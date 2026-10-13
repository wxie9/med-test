"use client";
import { Fragment, useState } from "react";
import type { Alert } from "@/lib/domain/types";
import { PatientName } from "@/components/clinic/PatientName";
import { useClinicIdentity } from "@/lib/client/clinicIdentity";
import { ALERT_KIND, ALERT_LEVEL, ALERT_STATUS, NEXT_ACTION, firstResponseHours, fmtHours, partitionQueue } from "@/lib/clinic/labels";
import { CloseAlertDialog, type CloseInput } from "@/components/clinic/CloseAlertDialog";
async function patchAlert(id: string, body: object) {
  const r = await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const j = (await r.json().catch(() => null)) as { error?: string } | null; throw new Error(j?.error ?? `操作失败（${r.status}）`); }
}
const STATUS_CLS: Partial<Record<Alert["status"], string>> = { escalated: "bg-red-100 text-red-700", unassigned: "bg-amber-50 text-amber-700", pending_review: "bg-blue-50 text-blue-700", closed: "bg-gray-100 text-gray-600" };
/** Alert queue: open alerts (high first, oldest first) with the one legal next action per row. Alerts closed during this page session stay inline (已关闭);
 * alerts already closed when the page loaded sit in a collapsible section. */
export function AlertQueue({ alerts, today, onChanged }: { alerts: Alert[]; today: string; onChanged: () => void | Promise<void> }) {
  const { identity } = useClinicIdentity();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<Alert | null>(null);
  const [closedHere, setClosedHere] = useState<ReadonlySet<string>>(() => new Set());
  const [noting, setNoting] = useState<{ id: string; action: "start" | "submit_review" } | null>(null); // inline note for 开始处置 / 提交复核
  const [noteText, setNoteText] = useState("");
  const { main, collapsed } = partitionQueue(alerts, closedHere);
  async function act(a: Alert, body: object): Promise<boolean> {
    setBusyId(a.id); setError(null);
    try { await patchAlert(a.id, body); await onChanged(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusyId(null); }
  }
  async function confirmClose(v: CloseInput) {
    if (!closing) return;
    const id = closing.id;
    if (await act(closing, { action: "close", by: identity, note: v.note, task: v.task })) { setClosedHere(prev => new Set(prev).add(id)); setClosing(null); }
  }
  async function confirmNote(a: Alert) {
    if (!noting) return;
    if (await act(a, { action: noting.action, by: identity, ...(noteText.trim() ? { note: noteText.trim() } : {}) })) { setNoting(null); setNoteText(""); }
  }
  function onNext(a: Alert, action: NonNullable<(typeof NEXT_ACTION)[Alert["status"]]>["action"]) {
    setError(null);
    if (action === "close") setClosing(a);
    else if (action === "start" || action === "submit_review") { setNoting({ id: a.id, action }); setNoteText(""); }
    else void act(a, { action, by: identity });
  }
  const row = (a: Alert) => {
    const next = NEXT_ACTION[a.status];
    const noteOpen = noting?.id === a.id;
    const required = noting?.action === "submit_review";
    return (
      <Fragment key={a.id}>
      <tr data-testid="alert-row" className="border-t border-gray-100">
        <td className="px-2 py-2"><PatientName id={a.patientId} /></td>
        <td className="px-2 py-2">{ALERT_KIND[a.kind]}</td>
        <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${a.level === "high" ? "bg-red-600 text-white" : "bg-amber-400 text-gray-900"}`}>{ALERT_LEVEL[a.level]}</span></td>
        <td className="px-2 py-2 text-gray-700">{a.rule}</td>
        <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_CLS[a.status] ?? "bg-green-50 text-green-700"}`}>{ALERT_STATUS[a.status]}</span></td>
        <td className="px-2 py-2">{a.assignee ?? "—"}</td>
        <td className="px-2 py-2 tabular-nums">{fmtHours(firstResponseHours(a))}</td>
        <td className="px-2 py-2 text-right">
          {next && (
            <button type="button" disabled={busyId !== null || noteOpen} onClick={() => onNext(a, next.action)}
              className="rounded bg-pink-600 px-3 py-1 text-sm text-white disabled:opacity-50">{next.label}</button>
          )}
        </td>
      </tr>
      {noteOpen && (
        <tr className="bg-pink-50/40">
          <td colSpan={8} className="px-2 py-2">
            <form className="flex items-center gap-2 text-sm" onSubmit={e => { e.preventDefault(); if (!required || noteText.trim()) void confirmNote(a); }}>
              <label className="shrink-0 text-gray-600" htmlFor={`note-${a.id}`}>{required ? "处置记录（必填）" : "处置记录（可选）"}</label>
              <input id={`note-${a.id}`} data-testid="action-note" value={noteText} onChange={e => setNoteText(e.target.value)} autoFocus
                placeholder={required ? "如：已沟通，建议复评" : "如：电话沟通：关节痛导致漏服"} className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1" />
              <button type="submit" data-testid="action-confirm" disabled={busyId !== null || (required && !noteText.trim())} className="rounded bg-pink-600 px-3 py-1 text-white disabled:opacity-50">确认{noting.action === "start" ? "开始处置" : "提交复核"}</button>
              <button type="button" onClick={() => { setNoting(null); setNoteText(""); }} className="rounded border border-gray-300 px-3 py-1">取消</button>
            </form>
          </td>
        </tr>
      )}
      </Fragment>
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
      <table className="w-full table-fixed text-sm">{head}<tbody>{main.length ? main.map(row) : <tr><td colSpan={8} className="px-2 py-6 text-center text-gray-400">暂无待处理预警</td></tr>}</tbody></table>
      {collapsed.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-600">已关闭（{collapsed.length}）</summary>
          <table className="mt-2 w-full table-fixed text-sm text-gray-600">{head}<tbody>{collapsed.map(row)}</tbody></table>
        </details>
      )}
      {closing && <CloseAlertDialog today={today} defaultOwner={identity} busy={busyId !== null} error={error} onCancel={() => setClosing(null)} onConfirm={v => void confirmClose(v)} />}
    </div>
  );
}
