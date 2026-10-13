"use client";
import { useState } from "react";
import { useDemoState } from "@/lib/client/useDemoState";
import type { CandidateRequest } from "@/lib/domain/types";
const PROTOCOL_ID = "XX-ADC-301";
type Requested = { id?: string; count: number };
/**
 * Sends the candidate-verification request to the clinic and follows confirmations through the polled lite state.
 * One request per snapshot: the button is disabled once a request exists. expectedCount (funnel finalMetCount) is
 * shown only until the response/state reports the actual candidate list.
 */
export function CandidateRequestPanel({ snapshotId, expectedCount }: { snapshotId: string; expectedCount: number }) {
  const { data } = useDemoState<{ candidateRequests: CandidateRequest[] }>(3000);
  const [posted, setPosted] = useState<Requested | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reqs = (data?.candidateRequests ?? []).filter(r => r.snapshotId === snapshotId && r.protocolId === PROTOCOL_ID);
  const live = reqs.at(-1); // latest request for this snapshot
  const count = live ? live.candidates.length : posted?.count;
  const confirmed = live?.candidates.filter(c => c.status === "confirmed").length;
  const exists = !!live || !!posted;
  async function request() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshotId, protocolId: PROTOCOL_ID }) });
      if (r.status === 404) { setErr("候选核查接口尚未接入"); return; }
      if (!r.ok) { setErr(`请求失败（${r.status}）`); return; }
      const body = (await r.json().catch(() => ({}))) as Partial<CandidateRequest>;
      setPosted({ id: body.id, count: body.candidates?.length ?? expectedCount });
    } catch (e) { setErr(`请求失败（${e instanceof Error ? e.message : String(e)}）`); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button type="button" data-testid="request-candidates" disabled={busy || exists} onClick={() => void request()} className="rounded bg-pink-600 px-3 py-1.5 font-semibold text-white hover:bg-pink-700 disabled:opacity-50">申请候选患者核查</button>
      {count !== undefined && <span data-testid="candidates-requested" className="text-emerald-700">已向科室发出候选核查请求（{count} 例）</span>}
      {confirmed !== undefined && <span data-testid="candidates-confirmed" className="text-gray-700">已确认 {confirmed} 例</span>}
      {err && <span className="text-red-600">{err}</span>}
    </div>
  );
}
