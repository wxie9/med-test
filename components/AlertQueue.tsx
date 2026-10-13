"use client";
import { useState } from "react";
import type { Alert } from "@/lib/domain/types";
import { PatientName } from "@/components/clinic/PatientName";
import { useClinicIdentity } from "@/lib/client/clinicIdentity";
import { ALERT_KIND, ALERT_LEVEL, ALERT_STATUS, NEXT_ACTION, firstResponseHours, fmtHours, sortQueue } from "@/lib/clinic/labels";
import { CloseAlertDialog, type CloseInput } from "@/components/clinic/CloseAlertDialog";
async function patchAlert(id: string, body: object) {
  const r = await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const j = (await r.json().catch(() => null)) as { error?: string } | null; throw new Error(j?.error ?? `操作失败（${r.status}）`); }
}
const STATUS_CLS: Partial<Record<Alert["status"], string>> = { escalated: "bg-red-100 text-red-700", unassigned: "bg-amber-50 text-amber-700", pending_review: "bg-blue-50 text-blue-700", closed: "bg-gray-100 text-gray-600" };
/** Alert queue: open alerts (high first, oldest first) with the one legal next action per row; closed alerts in a collapsible section. */
export function AlertQueue({ alerts, today, onChanged }: { alerts: Alert[]; today: string; onChanged: () => void | Promise<void> }) {
  const { identity } = useClinicIdentity();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<Alert | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const open = sortQueue(alerts.filter(a => a.status !== "closed"));
  const closed = sortQueue(alerts.filter(a => a.status === "closed"));
  async function act(a: Alert, body: object): Promise<boolean> {
    setBusyId(a.id); setError(null);
    try { await patchAlert(a.id, body); await onChanged(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusyId(null); }
  }
  async function confirmClose(v: CloseInput) {
    if (!closing) return;
    if (await act(closing, { action: "close", by: identity, note: v.note, task: v.task })) { setClosing(null); setShowClosed(true); }
  }
  const row = (a: Alert) => {
    const next = NEXT_ACTION[a.status];
    return (
      <tr key={a.id} data-testid="alert-row" className="border-t border-gray-100">
        <td className="px-2 py-2"><PatientName id={a.patientId} /></td>
        <td className="px-2 py-2">{ALERT_KIND[a.kind]}</td>
        <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${a.level === "high" ? "bg-red-600 text-white" : "bg-amber-400 text-gray-900"}`}>{ALERT_LEVEL[a.level]}</span></td>
        <td className="px-2 py-2 text-gray-700">{a.rule}</td>
        <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_CLS[a.status] ?? "bg-green-50 text-green-700"}`}>{ALERT_STATUS[a.status]}</span></td>
        <td className="px-2 py-2">{a.assignee ?? "—"}</td>
        <td className="px-2 py-2 tabular-nums">{fmtHours(firstResponseHours(a))}</td>
        <td className="px-2 py-2 text-right">
          {next && (
            <button type="button" disabled={busyId !== null} onClick={() => (next.action === "close" ? (setError(null), setClosing(a)) : void act(a, { action: next.action, by: identity }))}
              className="rounded bg-pink-600 px-3 py-1 text-sm text-white disabled:opacity-50">{next.label}</button>
          )}
        </td>
      </tr>
    );
  };
  const COLS = ["14%", "8%", "6%", "27%", "9%", "13%", "11%", "12%"];
  const head = (<>
    <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
    <thead className="bg-gray-50 text-left text-xs text-gray-500">
      <tr>{["患者", "类型", "等级", "规则", "状态", "责任人", "首响应时长", ""].map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr>
    </thead>
  </>);
  return (
    <div>
      {error && !closing && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}
      <table className="w-full table-fixed text-sm">{head}<tbody>{open.length ? open.map(row) : <tr><td colSpan={8} className="px-2 py-6 text-center text-gray-400">暂无待处理预警</td></tr>}</tbody></table>
      {closed.length > 0 && (
        <details open={showClosed} onToggle={e => setShowClosed((e.currentTarget as HTMLDetailsElement).open)} className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-600">已关闭（{closed.length}）</summary>
          <table className="mt-2 w-full table-fixed text-sm text-gray-600">{head}<tbody>{closed.map(row)}</tbody></table>
        </details>
      )}
      {closing && <CloseAlertDialog today={today} defaultOwner={identity} busy={busyId !== null} error={error} onCancel={() => setClosing(null)} onConfirm={v => void confirmClose(v)} />}
    </div>
  );
}
