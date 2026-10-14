'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ProjectProResult } from '@/lib/psp/commands';
export type ProjectProBinding = { patientId: string; assignmentId: string; seedVersion: number; expectedVersion: number; revisionOf?: string };
export type ProjectProAnswers = { items: Record<string, number>; flags: { missedDoses14d: number; stopIntent: boolean } };
type Pending = { body: string; running: boolean };
type Status = { result: ProjectProResult | null; notice: string | null; busy: boolean; canRetry: boolean; reviewRequired: boolean };
const initial: Status = { result: null, notice: null, busy: false, canRetry: false, reviewRequired: false };
/** One form visit owns its immutable submission; polling assignment versions does not erase its receipt. */
export function useProjectProSubmission(binding: ProjectProBinding, onSubmitted: () => void, refresh: () => void | Promise<void>) {
 const { patientId, assignmentId, seedVersion, revisionOf } = binding;
 const scope = useMemo(() => ({ patientId, assignmentId, seedVersion, revisionOf, active: false, pending: null as Pending | null, review: false, done: false }), [patientId, assignmentId, seedVersion, revisionOf]);
 const current = useRef(scope);
 const [snapshot, setSnapshot] = useState<{ scope: typeof scope; status: Status }>({ scope, status: initial });
 useLayoutEffect(() => { current.current = scope; }, [scope]);
 useEffect(() => { scope.active = true; return () => { scope.active = false; scope.pending = null; }; }, [scope]);
 const isCurrent = useCallback(() => current.current === scope && scope.active, [scope]);
 const update = useCallback((status: Partial<Status>) => {
  if (isCurrent()) setSnapshot(previous => ({ scope, status: { ...(previous.scope === scope ? previous.status : initial), ...status } }));
 }, [isCurrent, scope]);
 const execute = useCallback(async (operation: Pending) => {
  if (!isCurrent() || scope.pending !== operation || operation.running) return;
  operation.running = true; update({ busy: true, canRetry: false, notice: null });
  const stillCurrent = () => isCurrent() && scope.pending === operation;
  try {
   const response = await fetch(`/api/psp/assignments/${encodeURIComponent(assignmentId)}/pro`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: operation.body });
   if (!stillCurrent()) return;
   if (response.status === 409) {
    scope.pending = null; scope.review = true; update({ busy: false, reviewRequired: true, notice: '计划状态已变化，本次提交未应用。请核对刷新后的患者、截止时间和答卷，再重新提交。' });
    await refresh(); return;
   }
   if (!response.ok) {
    if (response.status >= 500) throw new Error(`提交未确认（${response.status}）。请重试同一次提交。`);
    scope.pending = null; update({ busy: false, notice: `提交未完成（${response.status}），请核对当前身份和服务授权。` }); return;
   }
   const value = await response.json() as ProjectProResult;
   if (!stillCurrent()) return;
   scope.pending = null; scope.done = true; update({ result: value, busy: false, canRetry: false, notice: null }); onSubmitted();
  } catch (error) {
   if (stillCurrent()) update({ busy: false, canRetry: true, notice: error instanceof Error ? error.message : '网络异常，请重试同一次提交。' });
  } finally { operation.running = false; }
 }, [assignmentId, isCurrent, onSubmitted, refresh, scope, update]);
 const submit = useCallback((answers: ProjectProAnswers) => {
  if (!isCurrent() || scope.pending || scope.review || scope.done) return;
  const operation = { running: false, body: JSON.stringify({ patientId, scaleId: 'endocrine_monthly_v1', items: answers.items, flags: answers.flags, ...(revisionOf ? { revisionOf } : {}), meta: { seedVersion, expectedVersion: binding.expectedVersion, clientRequestId: crypto.randomUUID(), actorId: patientId, role: 'patient' } }) };
  scope.pending = operation; void execute(operation);
 }, [binding.expectedVersion, execute, isCurrent, patientId, revisionOf, scope, seedVersion]);
 const retry = useCallback(() => { if (isCurrent() && scope.pending) void execute(scope.pending); }, [execute, isCurrent, scope]);
 const acknowledge = useCallback(() => { if (!isCurrent()) return; scope.review = false; update({ reviewRequired: false, notice: null }); }, [isCurrent, scope, update]);
 const status = snapshot.scope === scope ? snapshot.status : initial;
 return { ...status, locked: status.busy || status.canRetry || status.reviewRequired || !!status.result, submit, retry, acknowledge };
}
