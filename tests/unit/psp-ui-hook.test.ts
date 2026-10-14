// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePspState } from "@/lib/client/usePspState";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const defer = () => { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("does not expose the previous patient while the next request is pending or apply deferred stale results", async () => {
 const a = defer(), b = defer(); vi.stubGlobal("fetch", vi.fn((url: string) => url === "A" ? a.promise : b.promise));
 const { result, rerender } = renderHook(({ url }) => usePspState<{ seedVersion: number; name: string }>(url), { initialProps: { url: "A" } });
 rerender({ url: "B" }); expect(result.current.data).toBeNull();
 await act(async () => { b.resolve(json({ seedVersion: 1, name: "B" })); });
 await waitFor(() => expect(result.current.data?.name).toBe("B"));
 await act(async () => { a.resolve(json({ seedVersion: 1, name: "A" })); });
 expect(result.current.data?.name).toBe("B");
});
it("reuses the exact request id and body after a persistence failure", async () => {
 const requests: string[] = []; let posts = 0;
 vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => { if (options?.method === "POST") { requests.push(options.body as string); return Promise.resolve(json({}, ++posts === 1 ? 503 : 200)); } return Promise.resolve(json({ seedVersion: 1 })); }));
 const { result } = renderHook(() => usePspState("A")); await waitFor(() => expect(result.current.data).not.toBeNull());
 act(() => result.current.command("/permission", { scope: "aggregate", action: "withdraw" }, { role: "patient", actorId: "A" }, 2));
 await waitFor(() => expect(result.current.canRetry).toBe(true)); act(() => result.current.retry());
 await waitFor(() => expect(requests.length).toBe(2)); expect(requests[1]).toBe(requests[0]);
});
it("ignores a deferred write after patient changes and rejects callbacks retained from an earlier visit", async () => {
 const post = defer(); const fetcher = vi.fn((_url: string, options?: RequestInit) => options?.method === "POST" ? post.promise : Promise.resolve(json({ seedVersion: 1 })));
 vi.stubGlobal("fetch", fetcher);
 const { result, rerender } = renderHook(({ url }) => usePspState(url), { initialProps: { url: "A" } }); await waitFor(() => expect(result.current.data).not.toBeNull());
 const oldCommand = result.current.command; act(() => oldCommand("/permission", {}, { role: "patient", actorId: "A" }, 1));
 rerender({ url: "B" }); await waitFor(() => expect(result.current.data).not.toBeNull());
 await act(async () => { post.resolve(json({})); }); expect(result.current.notice).toBeNull(); expect(result.current.busy).toBe(false);
 rerender({ url: "A" }); await waitFor(() => expect(result.current.data).not.toBeNull()); const count = fetcher.mock.calls.length;
 act(() => oldCommand("/permission", {}, { role: "patient", actorId: "A" }, 1)); expect(fetcher.mock.calls.length).toBe(count);
});
it("invalidates a retry after seed reset and refreshes an object conflict", async () => {
 let seedVersion = 1; let status = 503;
 vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => Promise.resolve(options?.method === "POST" ? json({}, status) : json({ seedVersion }))));
 const { result } = renderHook(() => usePspState("A")); await waitFor(() => expect(result.current.data).not.toBeNull());
 act(() => result.current.command("/permission", {}, { role: "patient", actorId: "A" }, 1)); await waitFor(() => expect(result.current.canRetry).toBe(true));
 seedVersion = 2; await act(async () => { await result.current.refresh(); }); expect(result.current.canRetry).toBe(false); expect(result.current.notice).toContain("重置");
 status = 409; act(() => result.current.command("/permission", {}, { role: "patient", actorId: "A" }, 1)); await waitFor(() => expect(result.current.notice).toContain("状态已变化")); expect(result.current.canRetry).toBe(false);
});
it("does not show a rejected old write after reset or update after unmount", async () => {
 let reject!: (error: Error) => void; const mutation = new Promise<Response>((_resolve, fail) => { reject = fail; }); let seedVersion = 1;
 vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => options?.method === "POST" ? mutation : Promise.resolve(json({ seedVersion }))));
 const { result, unmount } = renderHook(() => usePspState("A")); await waitFor(() => expect(result.current.data).not.toBeNull());
 act(() => result.current.command("/permission", {}, { role: "patient", actorId: "A" }, 1)); seedVersion = 2; await act(async () => { await result.current.refresh(); });
 await act(async () => { reject(new Error("old operation")); }); expect(result.current.notice).toContain("重置"); expect(result.current.canRetry).toBe(false);
 unmount();
});
it("cannot revive a retained refresh or retry callback after leaving and revisiting a scope", async () => {
 const fetcher = vi.fn((_url: string, options?: RequestInit) => Promise.resolve(options?.method === "POST" ? json({}, 503) : json({ seedVersion: 1 })));
 vi.stubGlobal("fetch", fetcher); const { result, rerender } = renderHook(({ url }) => usePspState(url), { initialProps: { url: "A" } }); await waitFor(() => expect(result.current.data).not.toBeNull());
 const oldRefresh = result.current.refresh, oldRetry = result.current.retry;
 rerender({ url: "B" }); await waitFor(() => expect(result.current.data).not.toBeNull()); rerender({ url: "A" }); await waitFor(() => expect(result.current.data).not.toBeNull());
 act(() => result.current.command("/permission", {}, { role: "patient", actorId: "A" }, 1)); await waitFor(() => expect(result.current.canRetry).toBe(true));
 const count = fetcher.mock.calls.length; await act(async () => { await oldRefresh(); oldRetry(); }); expect(fetcher.mock.calls.length).toBe(count);
});
it("a permanent 400 clears the pending operation and allows a corrected new action", async () => {
 let status = 400; const requests: string[] = [];
 vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => { if (options?.method === "POST") { requests.push(options.body as string); return Promise.resolve(json({}, status)); } return Promise.resolve(json({ seedVersion: 1 })); }));
 const { result } = renderHook(() => usePspState("A")); await waitFor(() => expect(result.current.data).not.toBeNull());
 act(() => result.current.command("/permission", { scope: "invalid" }, { role: "patient", actorId: "A" }, 1)); await waitFor(() => expect(result.current.notice).toContain("400")); expect(result.current.canRetry).toBe(false); expect(result.current.busy).toBe(false);
 status = 200; act(() => result.current.command("/permission", { scope: "service", action: "grant" }, { role: "patient", actorId: "A" }, 1)); await waitFor(() => expect(result.current.notice).toBe("操作已保存。")); expect(requests).toHaveLength(2); expect(JSON.parse(requests[1]).meta.clientRequestId).not.toBe(JSON.parse(requests[0]).meta.clientRequestId);
});
it("binds retained same-scope command callbacks to their rendered seed across reset", async () => {
 let seedVersion = 1; const bodies: { meta: { seedVersion: number } }[] = [];
 vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => { if (options?.method === "POST") { bodies.push(JSON.parse(options.body as string)); return Promise.resolve(json({})); } return Promise.resolve(json({ seedVersion })); }));
 const { result } = renderHook(() => usePspState("A")); await waitFor(() => expect(result.current.data?.seedVersion).toBe(1));
 const oldCommand = result.current.command; seedVersion = 2; await act(async () => { await result.current.refresh(); }); expect(result.current.data?.seedVersion).toBe(2);
 act(() => oldCommand("/permission", {}, { role: "patient", actorId: "A" }, 1)); expect(bodies).toHaveLength(0);
 act(() => result.current.command("/permission", {}, { role: "patient", actorId: "A" }, 1)); await waitFor(() => expect(bodies).toHaveLength(1)); expect(bodies[0].meta.seedVersion).toBe(2);
});
