// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useProjectProSubmission, type ProjectProBinding } from '@/lib/client/useProjectProSubmission';
const binding: ProjectProBinding = { patientId: 'P-A', assignmentId: 'assignment-A', seedVersion: 1, expectedVersion: 1 };
const answers = { items: { '关节痛': 3, '潮热': 1, '情绪': 1, '睡眠': 1 }, flags: { missedDoses14d: 4, stopIntent: true } };
const result = { data: { proId: 'PRO-1', feedback: '已收到', emergency: false, offHours: false, alertIds: [], assignmentId: 'assignment-A', firstValidSubmittedAt: '2026-10-13T02:00:00Z', latestValidResponseId: 'PRO-1', dueAt: '2026-10-13T01:00:00Z', onTime: false }, objectVersion: 2, ledgerRevision: 1, seedVersion: 1 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const defer = () => { let resolve!: (value: Response) => void, reject!: (error: Error) => void; const promise = new Promise<Response>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps the exact captured answers and request ID on network/503 retry and prevents simultaneous submit', async () => {
 const requests: string[] = []; const first = defer(); let posts = 0;
 vi.stubGlobal('fetch', vi.fn((_url, options) => { requests.push(options.body); return ++posts === 1 ? first.promise : Promise.resolve(json(result)); }));
 const onSubmitted = vi.fn(), refresh = vi.fn(); const { result: hook } = renderHook(() => useProjectProSubmission(binding, onSubmitted, refresh));
 act(() => { hook.current.submit(answers); hook.current.submit(answers); }); expect(requests).toHaveLength(1); expect(hook.current.locked).toBe(true);
 await act(async () => first.resolve(json({}, 503))); expect(hook.current.canRetry).toBe(true); expect(hook.current.locked).toBe(true);
 answers.items['关节痛'] = 2; act(() => hook.current.retry()); await waitFor(() => expect(hook.current.result?.data.proId).toBe('PRO-1'));
 expect(requests[1]).toBe(requests[0]); expect(JSON.parse(requests[0]).items['关节痛']).toBe(3); expect(onSubmitted).toHaveBeenCalledTimes(1); answers.items['关节痛'] = 3;
});
it.each(['patientId', 'assignmentId', 'seedVersion', 'revisionOf'] as const)('drops deferred success and error after %s changes, including old retained submit callbacks', async field => {
 const first = defer(), second = defer(); let posts = 0; const fetcher = vi.fn(() => ++posts === 1 ? first.promise : second.promise); vi.stubGlobal('fetch', fetcher);
 const onSubmitted = vi.fn(); const { result: hook, rerender } = renderHook(({ scope }) => useProjectProSubmission(scope, onSubmitted, vi.fn()), { initialProps: { scope: binding } });
 const oldSubmit = hook.current.submit; act(() => oldSubmit(answers));
 const changed = { ...binding, [field]: field === 'seedVersion' ? 2 : 'changed' }; rerender({ scope: changed }); expect(hook.current.locked).toBe(false);
 await act(async () => first.resolve(json(result))); expect(hook.current.result).toBeNull(); expect(onSubmitted).not.toHaveBeenCalled();
 act(() => oldSubmit(answers)); expect(fetcher).toHaveBeenCalledTimes(1); act(() => hook.current.submit(answers)); rerender({ scope: binding });
 await act(async () => second.reject(new Error('stale error'))); expect(hook.current.notice).toBeNull(); expect(hook.current.canRetry).toBe(false);
});
it('refreshes a 409 conflict once and requires explicit review without auto submitting', async () => {
 const fetcher = vi.fn(() => Promise.resolve(json({}, 409))); vi.stubGlobal('fetch', fetcher); const refresh = vi.fn(() => Promise.resolve());
 const { result: hook, rerender } = renderHook(({ scope }) => useProjectProSubmission(scope, vi.fn(), refresh), { initialProps: { scope: binding } });
 act(() => hook.current.submit(answers)); await waitFor(() => expect(hook.current.reviewRequired).toBe(true)); expect(refresh).toHaveBeenCalledTimes(1); expect(hook.current.canRetry).toBe(false);
 rerender({ scope: { ...binding, expectedVersion: 2 } }); act(() => hook.current.submit(answers)); expect(fetcher).toHaveBeenCalledTimes(1);
 act(() => hook.current.acknowledge()); act(() => hook.current.submit(answers)); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});
it('ignores deferred response after unmount and binds a response body read to the same visit', async () => {
 const body = defer(); const read = vi.fn(() => body.promise); vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, json: read })); const onSubmitted = vi.fn();
 const { result: hook, unmount } = renderHook(() => useProjectProSubmission(binding, onSubmitted, vi.fn())); act(() => hook.current.submit(answers)); await waitFor(() => expect(read).toHaveBeenCalledTimes(1)); unmount();
 await act(async () => body.resolve(result as unknown as Response)); expect(onSubmitted).not.toHaveBeenCalled();
});
it('keeps retry identity after a network exception and drops a saved receipt on reset', async () => {
 const bodies: string[] = []; let count = 0;
 vi.stubGlobal('fetch', (_url: string, options: RequestInit) => { bodies.push(options.body as string); return ++count === 1 ? Promise.reject(new Error('connection interrupted')) : Promise.resolve(json(result)); });
 const { result: hook, rerender } = renderHook(({ scope }) => useProjectProSubmission(scope, vi.fn(), vi.fn()), { initialProps: { scope: binding } });
 act(() => hook.current.submit(answers)); await waitFor(() => expect(hook.current.canRetry).toBe(true)); expect(hook.current.locked).toBe(true); act(() => hook.current.retry());
 await waitFor(() => expect(hook.current.result?.data.proId).toBe('PRO-1')); expect(bodies[1]).toBe(bodies[0]); rerender({ scope: { ...binding, seedVersion: 2 } }); expect(hook.current.result).toBeNull(); expect(hook.current.notice).toBeNull(); expect(hook.current.locked).toBe(false);
});
