"use client";
import Link from "next/link";
import { useState } from "react";
import { fmtDateTime } from "@/lib/clinic/labels";
import type { CandidateRequest } from "@/lib/domain/types";
import type { ClinicCandidateRequest } from "@/lib/research/candidates";
type Status = CandidateRequest["candidates"][number]["status"];
const STATUS: Record<Status, { label: string; cls: string }> = {
  pending: { label: "待核查", cls: "text-amber-700" }, confirmed: { label: "已确认", cls: "text-green-700" }, rejected: { label: "不适合", cls: "text-gray-500" },
};
const count = (r: ClinicCandidateRequest, s: Status) => r.candidates.filter(c => c.status === s).length;
/** One pharma candidate-verification request; expanded it lists each candidate with key fields and confirm/reject actions. */
export function CandidateRequestCard({ req, expanded, onToggle, onDecide }: {
  req: ClinicCandidateRequest; expanded: boolean; onToggle: () => void;
  onDecide: (patientId: string, status: "confirmed" | "rejected") => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const summary = new Map(req.summaries.map(s => [s.patientId, s]));
  async function decide(patientId: string, status: "confirmed" | "rejected") {
    setBusy(patientId); setErr(null);
    try { await onDecide(patientId, status); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  return (
    <section data-testid="candidate-request" className="rounded-xl border border-gray-200 bg-white">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm">
        <span className="font-semibold text-gray-800">{req.protocolId}</span>
        <span className="text-gray-500">快照 {req.snapshotId}</span>
        <span className="text-gray-500">{fmtDateTime(req.createdAt)}</span>
        <span className="ml-auto tabular-nums">
          <span className="text-amber-700">待核查 {count(req, "pending")}</span><span className="mx-2 text-gray-300">|</span>
          <span className="text-green-700">已确认 {count(req, "confirmed")}</span><span className="mx-2 text-gray-300">|</span>
          <span className="text-gray-500">不适合 {count(req, "rejected")}</span>
        </span>
        <span className="text-gray-400" aria-hidden>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">患者 ID</th><th>HER2</th><th>当前治疗线</th><th>最近 PRO</th><th className="text-right">核查</th></tr></thead>
            <tbody>
              {req.candidates.map(c => {
                const s = summary.get(c.patientId);
                return (
                  <tr key={c.patientId} data-testid="candidate-row" className="border-t border-gray-100">
                    <td className="py-1.5"><Link data-testid="candidate-pid" href={`/clinic/patients/${encodeURIComponent(c.patientId)}`} className="text-pink-700 hover:underline">{c.patientId}</Link></td>
                    <td>{s?.her2 ?? "—"}</td>
                    <td>{s?.currentLine ?? "—"}</td>
                    <td>{s?.latestPro ?? "—"}</td>
                    <td className="text-right">
                      {c.status === "pending" ? (
                        <span className="inline-flex gap-2">
                          <button type="button" disabled={busy !== null} onClick={() => void decide(c.patientId, "confirmed")} className="rounded bg-pink-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-pink-700 disabled:opacity-50">确认</button>
                          <button type="button" disabled={busy !== null} onClick={() => void decide(c.patientId, "rejected")} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">不适合</button>
                        </span>
                      ) : <span className={`text-xs ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
