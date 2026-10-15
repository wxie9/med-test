// @vitest-environment jsdom
import React, { createElement } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePatient, type PatientView } from "@/lib/client/usePatient";
import { useResearch } from "@/components/research/useResearch";
import { CandidateRequestPanel } from "@/components/research/CandidateRequestPanel";
import { useResearchState } from "@/lib/client/useDemoState";
import { AgentPanel } from "@/components/AgentPanel";
import type { ResearchState } from "@/lib/state/store";
import type { ChatRequest, ChatResponse } from "@/lib/agents/types";
import { loadSeed } from "@/lib/seed/load";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const patient = (id: string): PatientView => ({ seedVersion: 1, patient: { ...loadSeed().anchors[0], id }, alerts: [], tasks: [], messages: [], today: "2026-10-14" });
const overview = (n: number) => ({ n, events: { metastasis: 0, progression: 0, death: 0 }, followUpMonths: { median: 0, p25: 0, p75: 0 }, survivalEstimable: false, missing: { ish: 0, stopReason: 0, externalNoDate: 0 }, summary: { n, events: 0, followUpMedian: 0, cutoff: "2026-10-14" } });
const researchState = (seedVersion: number, hasSnapshot = true): ResearchState => ({ seedVersion, snapshots: hasSnapshot ? [{ id: "SNAPv1", cohortId: "COHORT1", cutoff: "2026-10-14", createdAt: "2026-10-14T01:00:00Z", patientCount: 3, quality: {} }] : [], candidateRequests: [], cohorts: [], manifest: loadSeed().manifest, agentMode: "deterministic", serverNow: "2026-10-14T01:00:00Z" });
const reply: ChatResponse = { text: "演示回复", mode: "deterministic", citations: [], toolCalls: [] };

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("patient request identity", () => {
  it("ignores an A refresh retained by a mutation after B has loaded", async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(json(patient(url.endsWith("A") ? "A" : "B"))));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ id }) => usePatient(id), { initialProps: { id: "A" } });
    await waitFor(() => expect(result.current.data?.patient.id).toBe("A"));
    const afterOldMutation = result.current.refresh;
    rerender({ id: "B" });
    await waitFor(() => expect(result.current.data?.patient.id).toBe("B"));
    await act(async () => { await afterOldMutation(); });
    expect(result.current.data?.patient.id).toBe("B");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not revive a callback from an earlier visit to the same patient", async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(json(patient(url.endsWith("A") ? "A" : "B"))));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ id }) => usePatient(id), { initialProps: { id: "A" } });
    await waitFor(() => expect(result.current.data?.patient.id).toBe("A"));
    const oldRefresh = result.current.refresh;
    rerender({ id: "B" });
    await waitFor(() => expect(result.current.data?.patient.id).toBe("B"));
    rerender({ id: "A" });
    await waitFor(() => expect(result.current.data?.patient.id).toBe("A"));
    await act(async () => { await oldRefresh(); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("clears the previous patient's error while the new patient loads", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("A") ? Promise.resolve(json({}, 404)) : pending.promise));
    const { result, rerender } = renderHook(({ id }) => usePatient(id), { initialProps: { id: "A" } });
    await waitFor(() => expect(result.current.error?.message).toContain("404"));
    rerender({ id: "B" });
    expect(result.current.error).toBeNull();
    await act(async () => { pending.resolve(json(patient("B"))); });
    expect(result.current.data?.patient.id).toBe("B");
  });

  it("does not issue a refresh from a callback after unmount", async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(json(patient(url.endsWith("A") ? "A" : "B"))));
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => usePatient("A"));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const refresh = result.current.refresh;
    unmount();
    await act(async () => { await refresh(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores an old in-flight error and applies only the latest current refresh", async () => {
    const old = deferred<Response>();
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(json(patient("B"))).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ id }) => usePatient(id), { initialProps: { id: "A" } });
    rerender({ id: "B" });
    await waitFor(() => expect(result.current.data?.patient.id).toBe("B"));
    await act(async () => { old.reject(new Error("old A error")); });
    expect(result.current.error).toBeNull();
    let firstRefresh!: Promise<void>;
    let secondRefresh!: Promise<void>;
    act(() => { firstRefresh = result.current.refresh(); secondRefresh = result.current.refresh(); });
    await act(async () => { second.resolve(json({ ...patient("B"), today: "2026-10-16" })); await secondRefresh; });
    await act(async () => { first.resolve(json({ ...patient("B"), today: "2026-10-15" })); await firstRefresh; });
    expect(result.current.data?.today).toBe("2026-10-16");
  });
});

describe("research reset identity", () => {
  it("clears cached data on reset and refetches a reused snapshot only after it exists", async () => {
    vi.useFakeTimers();
    let state = researchState(1);
    const refreshed = deferred<Response>();
    let snapshotFetches = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/research/state") return Promise.resolve(json(state));
      snapshotFetches++;
      return snapshotFetches === 1 ? Promise.resolve(json(overview(3))) : refreshed.promise;
    }));
    const { result } = renderHook(() => useResearch("overview", "SNAPv1"));
    await act(async () => {});
    expect(result.current.data?.n).toBe(3);
    state = researchState(2, false);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain("重置");
    expect(snapshotFetches).toBe(1);
    state = researchState(2);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(result.current.data).toBeNull();
    expect(snapshotFetches).toBe(2);
    await act(async () => { refreshed.resolve(json(overview(8))); });
    expect(result.current.data?.n).toBe(8);
  });

  it("retains usable same-generation data if a research state poll temporarily fails", async () => {
    vi.useFakeTimers();
    let failed = false;
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url === "/api/research/state" ? failed ? json({}, 503) : json(researchState(1)) : json(overview(3)))));
    const { result } = renderHook(() => useResearch("overview", "SNAPv1"));
    await act(async () => {});
    expect(result.current.data?.n).toBe(3);
    failed = true;
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(result.current.data?.n).toBe(3);
  });

  it("drops an old snapshot response when reset reuses its ID", async () => {
    vi.useFakeTimers();
    let state = researchState(1);
    const old = deferred<Response>();
    let snapshotFetches = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/research/state") return Promise.resolve(json(state));
      snapshotFetches++;
      return snapshotFetches === 1 ? old.promise : Promise.resolve(json(overview(8)));
    }));
    const { result } = renderHook(() => useResearch("overview", "SNAPv1"));
    await act(async () => {});
    state = researchState(2);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(result.current.data?.n).toBe(8);
    await act(async () => { old.resolve(json(overview(3))); });
    expect(result.current.data?.n).toBe(8);
  });

  it("clears a posted candidate request for the same snapshot after reset", async () => {
    vi.useFakeTimers();
    let state = researchState(1);
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(json(url === "/api/research/state" ? state : { id: "CR1", snapshotId: "SNAPv1", protocolId: "XX-ADC-301", total: 3, confirmed: 0, createdAt: state.serverNow }))));
    function Harness() {
      const { data } = useResearchState<ResearchState>();
      return createElement(CandidateRequestPanel, { snapshotId: "SNAPv1", expectedCount: 3, researchState: data });
    }
    render(createElement(Harness));
    await act(async () => {});
    fireEvent.click(screen.getByTestId("request-candidates"));
    await act(async () => {});
    expect((screen.getByTestId("request-candidates") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("candidates-requested").textContent).toContain("3 例");
    state = researchState(2);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect((screen.getByTestId("request-candidates") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("candidates-requested")).toBeNull();
  });

  it("does not apply a candidate POST completed after reset", async () => {
    vi.useFakeTimers();
    let state = researchState(1);
    const oldPost = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/research/state" ? Promise.resolve(json(state)) : oldPost.promise));
    function Harness() {
      const { data } = useResearchState<ResearchState>();
      return createElement(CandidateRequestPanel, { snapshotId: "SNAPv1", expectedCount: 3, researchState: data });
    }
    render(createElement(Harness));
    await act(async () => {});
    fireEvent.click(screen.getByTestId("request-candidates"));
    state = researchState(2);
    await act(async () => { vi.advanceTimersByTime(3000); });
    await act(async () => { oldPost.resolve(json({ total: 3, confirmed: 0 })); });
    expect((screen.getByTestId("request-candidates") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("candidates-requested")).toBeNull();
  });
});

describe("committed identity during suspended transitions", () => {
  it("applies the visible patient's pending response and resumes polling while B remains suspended", async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const never = deferred<void>();
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise).mockImplementation(() => Promise.resolve(json(patient("A"))));
    vi.stubGlobal("fetch", fetchMock);
    let changeId!: React.Dispatch<React.SetStateAction<string>>;
    let bRendered = false;
    function Harness() {
      const [id, setId] = React.useState("A");
      const value = usePatient(id);
      React.useLayoutEffect(() => { changeId = setId; }, []);
      if (id === "B") { bRendered = true; throw never.promise; }
      return createElement("div", { "data-testid": "visible-patient" }, `${id}:${value.data?.patient.id ?? "loading"}`);
    }
    render(createElement(React.Suspense, { fallback: "transition loading" }, createElement(Harness)));
    await act(async () => { React.startTransition(() => changeId("B")); });
    expect(bRendered).toBe(true);
    expect(screen.getByTestId("visible-patient").textContent).toBe("A:loading");
    await act(async () => { pending.resolve(json(patient("A"))); });
    expect(screen.getByTestId("visible-patient").textContent).toBe("A:A");
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/patients/A");
  });

  it("allows the visible A mutation callback to refresh while B is uncommitted", async () => {
    const never = deferred<void>();
    const fetchMock = vi.fn((url: string) => Promise.resolve(json(patient(url.endsWith("A") ? "A" : "B"))));
    vi.stubGlobal("fetch", fetchMock);
    let changeId!: React.Dispatch<React.SetStateAction<string>>;
    let refreshA!: () => Promise<void>;
    let bRendered = false;
    function Harness() {
      const [id, setId] = React.useState("A");
      const value = usePatient(id);
      React.useLayoutEffect(() => { changeId = setId; refreshA = value.refresh; }, [value.refresh]);
      if (id === "B") { bRendered = true; throw never.promise; }
      return createElement("div", { "data-testid": "visible-patient" }, `${id}:${value.data?.patient.id ?? "loading"}`);
    }
    render(createElement(React.Suspense, { fallback: "transition loading" }, createElement(Harness)));
    await act(async () => {});
    await act(async () => { React.startTransition(() => changeId("B")); });
    expect(bRendered).toBe(true);
    expect(screen.getByTestId("visible-patient").textContent).toBe("A:A");
    await act(async () => { await refreshA(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/patients/A");
    expect(screen.getByTestId("visible-patient").textContent).toBe("A:A");
  });

  it("applies the visible A research response while B is uncommitted", async () => {
    const pending = deferred<Response>();
    const never = deferred<void>();
    const state = researchState(1);
    state.snapshots = ["A", "B"].map(id => ({ ...state.snapshots[0], id }));
    const fetchMock = vi.fn((url: string) => url === "/api/research/state" ? Promise.resolve(json(state)) : pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    let changeId!: React.Dispatch<React.SetStateAction<string>>;
    let bRendered = false;
    function Harness() {
      const [id, setId] = React.useState("A");
      const value = useResearch("overview", id);
      React.useLayoutEffect(() => { changeId = setId; }, []);
      if (id === "B") { bRendered = true; throw never.promise; }
      return createElement("div", { "data-testid": "visible-research" }, `${id}:${value.data?.n ?? "loading"}`);
    }
    render(createElement(React.Suspense, { fallback: "transition loading" }, createElement(Harness)));
    await act(async () => {});
    await act(async () => { React.startTransition(() => changeId("B")); });
    expect(bRendered).toBe(true);
    expect(screen.getByTestId("visible-research").textContent).toBe("A:loading");
    await act(async () => { pending.resolve(json(overview(3))); });
    expect(screen.getByTestId("visible-research").textContent).toBe("A:3");
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("snapshotId=B"))).toHaveLength(0);
  });

  it("finishes the visible A candidate request while a sibling suspends B", async () => {
    const pending = deferred<Response>();
    const never = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const state = researchState(1);
    state.snapshots = ["A", "B"].map(id => ({ ...state.snapshots[0], id }));
    let changeId!: React.Dispatch<React.SetStateAction<string>>;
    let bRendered = false;
    function SuspendB(): never { bRendered = true; throw never.promise; }
    function Harness() {
      const [id, setId] = React.useState("A");
      React.useLayoutEffect(() => { changeId = setId; }, []);
      return createElement(React.Fragment, null,
        createElement("div", { "data-testid": "visible-candidate-snapshot" }, id),
        createElement(CandidateRequestPanel, { snapshotId: id, expectedCount: 3, researchState: state }),
        id === "B" ? createElement(SuspendB) : null);
    }
    render(createElement(React.Suspense, { fallback: "transition loading" }, createElement(Harness)));
    fireEvent.click(screen.getByTestId("request-candidates"));
    await act(async () => { React.startTransition(() => changeId("B")); });
    expect(bRendered).toBe(true);
    expect(screen.getByTestId("visible-candidate-snapshot").textContent).toBe("A");
    await act(async () => { pending.resolve(json({ total: 3, confirmed: 1 })); });
    expect(screen.queryByTestId("candidates-requested")?.textContent ?? "").toContain("3 例");
    expect(screen.getByTestId("candidates-confirmed").textContent).toContain("1 例");
    expect((screen.getByTestId("request-candidates") as HTMLButtonElement).disabled).toBe(true);
  });

  it("preserves patient lifecycle generation during StrictMode effect replay", async () => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    vi.stubGlobal("fetch", fetchMock);
    function Harness() {
      const value = usePatient("A");
      return createElement("div", { "data-testid": "strict-patient" }, value.data?.patient.id ?? "loading");
    }
    render(createElement(React.StrictMode, null, createElement(Harness)));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { current.resolve(json(patient("A"))); });
    await act(async () => { old.resolve(json(patient("STALE"))); });
    expect(screen.getByTestId("strict-patient").textContent).toBe("A");
  });
});

describe("request lifecycle during temporary Suspense hiding", () => {
  it("keeps a patient GET result completed while hidden when the same A view is revealed", async () => {
    const pending = deferred<Response>();
    const never = deferred<void>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    let setSuspend!: React.Dispatch<React.SetStateAction<boolean>>;
    function Patient() {
      const value = usePatient("A", 3600000);
      return createElement("div", { "data-testid": "hidden-patient" }, value.data?.patient.id ?? "loading");
    }
    function Block({ suspend }: { suspend: boolean }) { if (suspend) throw never.promise; return null; }
    function Harness() {
      const [suspend, changeSuspend] = React.useState(false);
      React.useLayoutEffect(() => { setSuspend = changeSuspend; }, []);
      return createElement(React.Suspense, { fallback: createElement("p", { "data-testid": "hidden-fallback" }, "fallback") }, createElement(Patient), createElement(Block, { suspend }));
    }
    render(createElement(Harness));
    await act(async () => { setSuspend(true); });
    expect(screen.getByTestId("hidden-patient").style.display).toBe("none");
    expect(screen.getByTestId("hidden-fallback")).toBeTruthy();
    await act(async () => { pending.resolve(json(patient("A"))); });
    await act(async () => { setSuspend(false); });
    expect(screen.getByTestId("hidden-patient").textContent).toBe("A");
    expect(screen.getByTestId("hidden-patient").style.display).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a research GET result completed while hidden when the same snapshot is revealed", async () => {
    const pending = deferred<Response>();
    const never = deferred<void>();
    const fetchMock = vi.fn((url: string) => url === "/api/research/state" ? Promise.resolve(json(researchState(1))) : pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    let setSuspend!: React.Dispatch<React.SetStateAction<boolean>>;
    function Research() {
      const value = useResearch("overview", "SNAPv1");
      return createElement("div", { "data-testid": "hidden-research" }, value.data?.n ?? "loading");
    }
    function Block({ suspend }: { suspend: boolean }) { if (suspend) throw never.promise; return null; }
    function Harness() {
      const [suspend, changeSuspend] = React.useState(false);
      React.useLayoutEffect(() => { setSuspend = changeSuspend; }, []);
      return createElement(React.Suspense, { fallback: "fallback" }, createElement(Research), createElement(Block, { suspend }));
    }
    render(createElement(Harness));
    await act(async () => {});
    await act(async () => { setSuspend(true); });
    expect(screen.getByTestId("hidden-research").style.display).toBe("none");
    await act(async () => { pending.resolve(json(overview(3))); });
    await act(async () => { setSuspend(false); });
    expect(screen.getByTestId("hidden-research").textContent).toBe("3");
    expect(screen.getByTestId("hidden-research").style.display).toBe("");
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/overview?"))).toHaveLength(1);
  });

  it("shows a candidate POST failure completed while hidden and permits retry after reveal", async () => {
    const pending = deferred<Response>();
    const never = deferred<void>();
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(json({ total: 3, confirmed: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const state = researchState(1);
    let setSuspend!: React.Dispatch<React.SetStateAction<boolean>>;
    function Block({ suspend }: { suspend: boolean }) { if (suspend) throw never.promise; return null; }
    function Harness() {
      const [suspend, changeSuspend] = React.useState(false);
      React.useLayoutEffect(() => { setSuspend = changeSuspend; }, []);
      return createElement(React.Suspense, { fallback: "fallback" }, createElement(CandidateRequestPanel, { snapshotId: "SNAPv1", expectedCount: 3, researchState: state }), createElement(Block, { suspend }));
    }
    render(createElement(Harness));
    fireEvent.click(screen.getByTestId("request-candidates"));
    await act(async () => { setSuspend(true); });
    expect(screen.getByTestId("request-candidates").parentElement?.style.display).toBe("none");
    await act(async () => { pending.reject(new Error("network failure while hidden")); });
    await act(async () => { setSuspend(false); });
    expect((screen.getByTestId("request-candidates") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("network failure while hidden")).toBeTruthy();
    fireEvent.click(screen.getByTestId("request-candidates"));
    await act(async () => {});
    expect(screen.getByTestId("candidates-requested").textContent).toContain("3 例");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("chat request recovery", () => {
  const renderAgent = () => render(createElement(AgentPanel, { agent: "patient", context: { patientId: "P-A", page: "assistant" }, quickQuestions: [] }));
  const send = (content: string) => {
    fireEvent.change(screen.getByRole("textbox", { name: "输入问题" }), { target: { value: content } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
  };
  it("keeps an oversized message visible with an error and sends the next valid question without it", async () => {
    const requests: ChatRequest[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      const request = JSON.parse(options.body as string) as ChatRequest;
      requests.push(request);
      return Promise.resolve(json(request.messages.some(m => m.content.length > 4000) ? { error: "invalid request" } : reply, request.messages.some(m => m.content.length > 4000) ? 400 : 200));
    }));
    renderAgent();
    const long = "长".repeat(4001);
    send(long);
    await act(async () => {});
    expect(requests).toHaveLength(0);
    expect(screen.getByText(long)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("4000");
    send("我今天应该做什么？");
    await waitFor(() => expect(screen.getByTestId("agent-reply").textContent).toContain(reply.text));
    expect(requests[0].messages).toEqual([{ role: "user", content: "我今天应该做什么？" }]);
  });

  it("can retry after a rejected request without duplicating the failed turn in history", async () => {
    const requests: ChatRequest[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      requests.push(JSON.parse(options.body as string) as ChatRequest);
      return Promise.resolve(json(requests.length === 1 ? {} : reply, requests.length === 1 ? 503 : 200));
    }));
    renderAgent();
    send("服药提醒");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("503"));
    send("服药提醒");
    await waitFor(() => expect(screen.getByTestId("agent-reply")).toBeTruthy());
    expect(requests[1].messages).toEqual([{ role: "user", content: "服药提醒" }]);
  });

  it("keeps long assistant replies visible but bounds their content in the next request", async () => {
    const requests: ChatRequest[] = [];
    const longReply = { ...reply, text: "答".repeat(4001) };
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      requests.push(JSON.parse(options.body as string) as ChatRequest);
      return Promise.resolve(json(requests.length === 1 ? longReply : reply));
    }));
    renderAgent();
    send("先问一个问题");
    await waitFor(() => expect(screen.getByTestId("agent-reply").textContent).toBe(longReply.text));
    send("继续解释");
    await act(async () => {});
    expect(requests[1].messages.every(message => message.content.length <= 4000)).toBe(true);
    expect(requests[1].messages.at(-1)?.content).toBe("继续解释");
    expect(screen.getByText(longReply.text)).toBeTruthy();
  });

  it("accepts exactly 4000 characters and trims long conversations to a user-first history", async () => {
    const requests: ChatRequest[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      requests.push(JSON.parse(options.body as string) as ChatRequest);
      return Promise.resolve(json(reply));
    }));
    renderAgent();
    send("问".repeat(4000));
    await act(async () => {});
    expect(requests[0].messages[0].content).toHaveLength(4000);
    for (let i = 0; i < 12; i++) { send(`问题 ${i}`); await act(async () => {}); }
    expect(requests.at(-1)!.messages.length).toBeLessThanOrEqual(20);
    expect(requests.at(-1)!.messages[0].role).toBe("user");
    expect(requests.at(-1)!.messages.at(-1)?.content).toBe("问题 11");
  });
});
