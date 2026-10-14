"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommandMeta } from "@/lib/psp/types";

type Versioned = { seedVersion: number };
type Pending = { url: string; body: Record<string, unknown>; meta: CommandMeta; key: string };
export function usePspState<T extends Versioned>(url: string, pollMs = 10000) {
  const token = useMemo(() => Symbol(url), [url]);
  const activeToken = useRef(token); activeToken.current = token;
  const [snapshot, setSnapshot] = useState<{ key: string; token: symbol; data: T } | null>(null);
  const [notice, setNotice] = useState<{ key: string; token: symbol; text: string; kind?: "load" } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const scope = useRef(url); scope.current = url;
  const mounted = useRef(false), request = useRef(0), pending = useRef<Pending | null>(null);
  const latest = useRef<T | null>(null);
  const data = snapshot?.key === url && snapshot.token === token ? snapshot.data : null;
  latest.current = data;
  const refresh = useCallback(async () => {
    if (!mounted.current || activeToken.current !== token) return;
    const key = url, seq = ++request.current;
    try {
      const response = await fetch(key, { cache: "no-store" });
      if (!response.ok) throw new Error(`加载失败（${response.status}），请重试。`);
      const value = await response.json() as T;
      if (!mounted.current || scope.current !== key || activeToken.current !== token || seq !== request.current) return;
      if (pending.current && pending.current.meta.seedVersion !== value.seedVersion) {
        pending.current = null; setBusyKey(null); setNotice({ key, token, text: "演示已重置，请核对当前状态后重新操作。" });
      }
      setNotice(previous => previous?.kind === "load" && previous.key === key ? null : previous);
      latest.current = value; setSnapshot({ key, token, data: value });
    } catch (e) { if (mounted.current && scope.current === key && activeToken.current === token && seq === request.current) setNotice({ key, token, kind: "load", text: e instanceof Error ? e.message : "加载失败，请重试。" }); }
  }, [url, token]);
  useEffect(() => {
    mounted.current = true; pending.current = null; setBusyKey(null); setNotice(null);
    void refresh(); const timer = setInterval(() => void refresh(), pollMs);
    return () => { mounted.current = false;
      // Invalidate request responses; this ref is a sequence counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++request.current; clearInterval(timer); pending.current = null; };
  }, [refresh, pollMs]);
  const execute = useCallback(async (operation: Pending) => {
    if (!mounted.current || activeToken.current !== token || scope.current !== operation.key || pending.current !== operation || latest.current?.seedVersion !== operation.meta.seedVersion) return;
    const key = operation.key; setBusyKey(key); setNotice(null);
    const stillCurrent = () => mounted.current && activeToken.current === token && scope.current === key && pending.current === operation && latest.current?.seedVersion === operation.meta.seedVersion;
    try {
      const response = await fetch(operation.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation.body, meta: operation.meta }) });
      if (!stillCurrent()) return;
      if (!response.ok) {
        if (response.status === 409) { pending.current = null; setNotice({ key, token, text: "状态已变化，本次操作未应用。已刷新，请核对后重新操作。" }); await refresh(); return; }
        const message = `操作未完成（${response.status}）。${response.status >= 500 ? "可重试同一次操作。" : "请核对身份和当前状态。"}`;
        if (response.status < 500) { pending.current = null; setNotice({ key, token, text: message }); return; }
        throw new Error(message);
      }
      pending.current = null; setNotice({ key, token, text: "操作已保存。" }); await refresh();
    } catch (e) { if (stillCurrent()) setNotice({ key, token, text: e instanceof Error ? e.message : "网络异常，可重试同一次操作。" }); }
    finally { if (mounted.current && activeToken.current === token && scope.current === key && (!pending.current || pending.current === operation)) setBusyKey(null); }
  }, [refresh, token]);
  const renderedSeedVersion = data?.seedVersion;
  const command = useCallback((target: string, body: Record<string, unknown>, identity: Pick<CommandMeta, "actorId" | "role">, expectedVersion: number) => {
    if (!mounted.current || activeToken.current !== token || !latest.current || renderedSeedVersion === undefined || latest.current.seedVersion !== renderedSeedVersion || busyKey === url || pending.current) return;
    const operation = { key: url, url: target, body, meta: { ...identity, seedVersion: renderedSeedVersion, expectedVersion, clientRequestId: crypto.randomUUID() } };
    pending.current = operation; void execute(operation);
  }, [url, token, renderedSeedVersion, busyKey, execute]);
  return { data, notice: notice?.key === url && notice.token === token ? notice.text : null, busy: busyKey === url, refresh, command, canRetry: !!pending.current && pending.current.key === url && busyKey !== url, retry: () => { if (pending.current?.key === url) void execute(pending.current); } };
}
