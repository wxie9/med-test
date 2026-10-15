"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommandMeta } from "@/lib/psp/types";

type Conflict = { key: string; token: symbol; seedVersion: number; id: number; refreshed: boolean };
export type PspVersion = { seedVersion: number; authorizationVersion?: number };
type Pending = { url: string; body: Record<string, unknown>; meta: CommandMeta; key: string; authorizationVersion?: number };
type Observation = { key: string; token: symbol; version: PspVersion };
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const sameVersion = (left: PspVersion, right: PspVersion) => left.seedVersion === right.seedVersion && left.authorizationVersion === right.authorizationVersion;
const olderThan = (value: PspVersion, floor: PspVersion) => value.seedVersion < floor.seedVersion || (value.seedVersion === floor.seedVersion && floor.authorizationVersion !== undefined && (value.authorizationVersion === undefined || value.authorizationVersion < floor.authorizationVersion));
const newerErrorVersion = (body: unknown, floor: PspVersion | null): PspVersion | null => {
  if (!body || typeof body !== "object") return null;
  const fields = body as Record<string, unknown>;
  const seedVersion = fields.seedVersion ?? fields.currentSeedVersion;
  const authorizationVersion = fields.authorizationVersion ?? fields.currentAuthorizationVersion;
  if (!positiveInteger(seedVersion)) return null;
  const value: PspVersion = { seedVersion, ...(positiveInteger(authorizationVersion) ? { authorizationVersion } : {}) };
  return floor && (olderThan(value, floor) || sameVersion(value, floor)) ? null : value;
};
export function usePspState<T extends PspVersion>(url: string, pollMs = 10000, clearOnReadError = false) {
  const token = useMemo(() => Symbol(url), [url]);
  const activeToken = useRef(token); activeToken.current = token;
  const [snapshot, setSnapshot] = useState<{ key: string; token: symbol; data: T } | null>(null);
  const [notice, setNotice] = useState<{ key: string; token: symbol; text: string; kind?: "load" } | null>(null);
  const observed = useRef<Observation | null>(null);
  const [invalidation, setInvalidation] = useState<Observation | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const conflictRef = useRef<Conflict | null>(null), conflictEpoch = useRef(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const scope = useRef(url); scope.current = url;
  const mounted = useRef(false), request = useRef(0), pending = useRef<Pending | null>(null);
  const latest = useRef<T | null>(null);
  const data = snapshot?.key === url && snapshot.token === token ? snapshot.data : null;
  latest.current = data;
  const clearContent = useCallback(() => {
    latest.current = null; setSnapshot(null); pending.current = null; setBusyKey(null);
  }, []);
  const installVersionBarrier = useCallback((body: unknown) => {
    if (!mounted.current || activeToken.current !== token || scope.current !== url) return null;
    const floor = observed.current?.key === url && observed.current.token === token ? observed.current.version : null;
    const version = newerErrorVersion(body, floor);
    if (!version) return null;
    const observation = { key: url, token, version };
    observed.current = observation; setInvalidation(observation); clearContent();
    if (conflictRef.current?.seedVersion !== version.seedVersion) { conflictRef.current = null; setConflict(null); }
    return version;
  }, [url, token, clearContent]);
  const refresh = useCallback(async () => {
    if (!mounted.current || activeToken.current !== token) return;
    const key = url, seq = ++request.current, conflictAtStart = conflictRef.current;
    const isCurrent = () => mounted.current && scope.current === key && activeToken.current === token && seq === request.current;
    try {
      const response = await fetch(key, { cache: "no-store" });
      if (!response.ok) {
        // Error responses can carry a newer authorization barrier without a DTO.
        const body: unknown = await response.json().catch(() => null);
        if (!isCurrent()) return;
        installVersionBarrier(body);
        throw new Error(`加载失败（${response.status}），请重试。`);
      }
      const value = await response.json() as T;
      if (!isCurrent()) return;
      if (!value || !positiveInteger(value.seedVersion) || (value.authorizationVersion !== undefined && !positiveInteger(value.authorizationVersion))) throw new Error("加载失败，请重试。");
      const floor = observed.current?.key === key && observed.current.token === token ? observed.current.version : null;
      if (floor && olderThan(value, floor)) return;
      observed.current = { key, token, version: { seedVersion: value.seedVersion, ...(value.authorizationVersion !== undefined ? { authorizationVersion: value.authorizationVersion } : {}) } };
      if (pending.current && !sameVersion({ seedVersion: pending.current.meta.seedVersion, authorizationVersion: pending.current.authorizationVersion }, value)) {
        const reset = pending.current.meta.seedVersion !== value.seedVersion;
        pending.current = null; setBusyKey(null); setNotice({ key, token, text: reset ? "演示已重置，请核对当前状态后重新操作。" : "授权已变化，请核对当前状态后重新操作。" });
      }
      // Only a current GET begun after this conflict may establish fresh data.
      // A reset retires the marker even when this hook keeps the same URL.
      const currentConflict = conflictRef.current;
      if (currentConflict?.key === key && currentConflict.token === token) {
        if (currentConflict.seedVersion !== value.seedVersion) {
          conflictRef.current = null; setConflict(null);
        } else if (conflictAtStart?.id === currentConflict.id) {
          const refreshed = { ...currentConflict, refreshed: true };
          conflictRef.current = refreshed; setConflict(refreshed);
        }
      }
      setInvalidation(null);
      setNotice(previous => previous?.kind === "load" && previous.key === key ? null : previous);
      latest.current = value; setSnapshot({ key, token, data: value });
    } catch (e) {
      if (isCurrent()) {
        if (clearOnReadError) clearContent();
        setNotice({ key, token, kind: "load", text: e instanceof Error ? e.message : "加载失败，请重试。" });
      }
    }
  }, [url, token, clearOnReadError, clearContent, installVersionBarrier]);
  useEffect(() => {
    mounted.current = true; pending.current = null; conflictRef.current = null; setConflict(null); setBusyKey(null); setNotice(null);
    void refresh(); const timer = setInterval(() => void refresh(), pollMs);
    return () => { mounted.current = false;
      // Invalidate request responses; this ref is a sequence counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++request.current; clearInterval(timer); pending.current = null; conflictRef.current = null; };
  }, [refresh, pollMs]);
  const execute = useCallback(async (operation: Pending) => {
    if (!mounted.current || activeToken.current !== token || scope.current !== operation.key || pending.current !== operation || !latest.current || !sameVersion(latest.current, { seedVersion: operation.meta.seedVersion, authorizationVersion: operation.authorizationVersion })) return;
    const key = operation.key; setBusyKey(key); setNotice(null);
    const stillCurrent = () => mounted.current && activeToken.current === token && scope.current === key && pending.current === operation && !!latest.current && sameVersion(latest.current, { seedVersion: operation.meta.seedVersion, authorizationVersion: operation.authorizationVersion });
    try {
      const response = await fetch(operation.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation.body, meta: operation.meta }) });
      if (!stillCurrent()) return;
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        // Parsing may outlive this operation or URL visit; only current errors can raise the floor.
        if (!stillCurrent()) return;
        const version = installVersionBarrier(body);
        if (version) {
          const reset = version.seedVersion !== operation.meta.seedVersion;
          setNotice({ key, token, text: `操作未完成（${response.status}）。${reset ? "演示已重置" : "授权已变化"}，请核对当前状态后重新操作。` });
          if (response.status === 409) await refresh();
          return;
        }
        if (response.status === 409) {
          const marker = { key, token, seedVersion: operation.meta.seedVersion, id: ++conflictEpoch.current, refreshed: false };
          conflictRef.current = marker; setConflict(marker);
          pending.current = null; setNotice({ key, token, text: "状态已变化，本次操作未应用。请核对最新状态后重新操作。" }); await refresh(); return; }
        const message = `操作未完成（${response.status}）。${response.status >= 500 ? "可重试同一次操作。" : "请核对身份和当前状态。"}`;
        if (response.status < 500) { pending.current = null; setNotice({ key, token, text: message }); return; }
        throw new Error(message);
      }
      pending.current = null; setNotice({ key, token, text: "操作已保存。" }); await refresh();
    } catch (e) { if (stillCurrent()) setNotice({ key, token, text: e instanceof Error ? e.message : "网络异常，可重试同一次操作。" }); }
    finally { if (mounted.current && activeToken.current === token && scope.current === key && (!pending.current || pending.current === operation)) setBusyKey(null); }
  }, [refresh, token, installVersionBarrier]);
  const renderedSeedVersion = data?.seedVersion, renderedAuthorizationVersion = data?.authorizationVersion;
  const command = useCallback((target: string, body: Record<string, unknown>, identity: Pick<CommandMeta, "actorId" | "role">, expectedVersion: number) => {
    if (!mounted.current || activeToken.current !== token || !latest.current || renderedSeedVersion === undefined || (latest.current.seedVersion !== renderedSeedVersion || latest.current.authorizationVersion !== renderedAuthorizationVersion) || busyKey === url || pending.current) return;
    const operation = { key: url, url: target, body, authorizationVersion: renderedAuthorizationVersion, meta: { ...identity, seedVersion: renderedSeedVersion, expectedVersion, clientRequestId: crypto.randomUUID() } };
    conflictRef.current = null; setConflict(null);
    pending.current = operation; void execute(operation);
  }, [url, token, renderedSeedVersion, renderedAuthorizationVersion, busyKey, execute]);
  const currentConflict = conflict?.key === url && conflict.token === token ? { id: conflict.id, refreshed: conflict.refreshed } : null;
  return { data, invalidation: invalidation?.key === url && invalidation.token === token ? invalidation.version : null, conflict: currentConflict, notice: notice?.key === url && notice.token === token ? notice.text : null, busy: busyKey === url, refresh, installVersionBarrier, command, canRetry: !!pending.current && pending.current.key === url && busyKey !== url, retry: () => { if (pending.current?.key === url) void execute(pending.current); } };
}
