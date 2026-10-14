"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ResearchState } from "@/lib/state/store";
import type { PharmaCandidateView } from "@/lib/research/pharmaView";
const PROTOCOL_ID = "XX-ADC-301";
type Requested = { id?: string; count: number; confirmed?: number };
/** Sends count-only verification requests, sharing the page's reset-aware research state poll. */
export function CandidateRequestPanel({ snapshotId, expectedCount, researchState }: { snapshotId: string; expectedCount: number; researchState: ResearchState | null }) {
  const key = `${researchState?.seedVersion ?? "pending"}:${snapshotId}`;
  const context = useMemo(() => ({ key, active: false, request: 0 }), [key]);
  const current = useRef(context);
  const [state, setState] = useState<{ context: typeof context; posted: Requested | null; busy: boolean; error: string | null }>({ context, posted: null, busy: false, error: null });
  useLayoutEffect(() => { current.current = context; }, [context]);
  useEffect(() => {
    context.active = true;
    return () => { context.active = false; context.request++; };
  }, [context]);
  const { posted, busy, error } = state.context === context ? state : { posted: null, busy: false, error: null };
  const available = !!researchState?.snapshots.some(snapshot => snapshot.id === snapshotId);
  const live = researchState?.candidateRequests.filter(r => r.snapshotId === snapshotId && r.protocolId === PROTOCOL_ID).at(-1);
  const count = live ? live.total : posted?.count;
  const confirmed = live ? live.confirmed : posted?.confirmed;
  const exists = !!live || !!posted;
  async function request() {
    if (!available || busy || exists || !context.active || current.current !== context) return;
    const requestId = ++context.request;
    const isCurrent = () => current.current === context && context.active && context.request === requestId;
    setState({ context, posted: null, busy: true, error: null });
    try {
      const r = await fetch("/api/candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshotId, protocolId: PROTOCOL_ID }) });
      if (r.status === 404) throw new Error("研究快照不存在");
      if (!r.ok && r.status !== 409) throw new Error(`请求失败（${r.status}）`);
      const body = (await r.json().catch(() => ({}))) as Partial<PharmaCandidateView>;
      if (isCurrent()) setState({ context, posted: { id: body.id, count: body.total ?? expectedCount, confirmed: body.confirmed }, busy: false, error: null });
    } catch (e) {
      if (isCurrent()) setState({ context, posted: null, busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button type="button" data-testid="request-candidates" disabled={!available || busy || exists} onClick={() => void request()} className="rounded bg-pink-600 px-3 py-1.5 font-semibold text-white hover:bg-pink-700 disabled:opacity-50">申请候选患者核查</button>
      {count !== undefined && <span data-testid="candidates-requested" className="text-emerald-700">已向科室发出候选核查请求（{count} 例，仅含已同意科研联系者）</span>}
      {confirmed !== undefined && <span data-testid="candidates-confirmed" className="text-gray-700">已确认 {confirmed} 例</span>}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
