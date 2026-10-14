"use client";
import { useState } from "react";
import { useDemoState } from "@/lib/client/useDemoState";
import { PatientName } from "@/components/clinic/PatientName";
import { TASK_STATUS, fmtDateTime } from "@/lib/clinic/labels";
import type { FollowUpTask } from "@/lib/domain/types";
type LiteState = { tasks: FollowUpTask[]; serverNow: string; serverToday: string };
export default function TasksPage() {
  const { data, error, refresh } = useDemoState<LiteState>(3000);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <p className="text-sm text-gray-500">{error ? `加载失败：${error.message}` : "加载中…"}</p>;
  const today = data.serverToday;
  const tasks = [...data.tasks].sort((a, b) => (a.status === b.status ? a.due.localeCompare(b.due) : a.status === "open" ? -1 : 1));
  async function done(id: string) {
    setBusy(id); setErr(null);
    try {
      const r = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "done" }) });
      if (!r.ok) throw new Error(`操作失败（${r.status}）`);
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">随访任务</h1>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>{["患者", "任务类型", "到期日", "负责人", "状态", "创建时间", ""].map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={7} className="px-2 py-6 text-center text-gray-400">暂无随访任务（关闭预警时会自动建立）</td></tr>}
            {tasks.map(t => (
              <tr key={t.id} data-testid="task-row" className="border-t border-gray-100">
                <td className="px-2 py-2"><PatientName id={t.patientId} /></td>
                <td className="px-2 py-2">{t.type}</td>
                <td className={`px-2 py-2 tabular-nums ${t.status === "open" && t.due < today ? "text-red-600" : ""}`}>{t.due}{t.status === "open" && t.due < today ? "（已逾期）" : ""}</td>
                <td className="px-2 py-2">{t.owner}</td>
                <td className="px-2 py-2">{TASK_STATUS[t.status]}</td>
                <td className="px-2 py-2 text-gray-500">{fmtDateTime(t.createdAt)}</td>
                <td className="px-2 py-2 text-right">{t.status === "open" && <button type="button" disabled={busy !== null} onClick={() => void done(t.id)} className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50">标记完成</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
