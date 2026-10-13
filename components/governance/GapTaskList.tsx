"use client";
import { useState } from "react";
import { Card } from "@/components/clinic/Card";
import { GAP_STATUS } from "@/lib/governance/labels";
import type { DataGapTask } from "@/lib/domain/types";
export function GapTaskList({ tasks, onChanged }: { tasks: DataGapTask[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function done(id: string) {
    setBusy(id); setErr(null);
    try {
      const r = await fetch(`/api/gap-tasks/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "done" }) });
      if (!r.ok) throw new Error(`操作失败（${r.status}）`);
      onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  return (
    <Card title="补数任务">
      {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr>{["来源", "字段", "涉及患者", "状态", ""].map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {tasks.length === 0 && <tr><td colSpan={5} className="px-2 py-6 text-center text-gray-400">暂无补数任务（由研究助手生成）</td></tr>}
          {tasks.map(t => (
            <tr key={t.id} data-testid="gap-task-row" className="border-t border-gray-100">
              <td className="px-2 py-2">{t.source}</td><td className="px-2 py-2">{t.field}</td>
              <td className="px-2 py-2 tabular-nums">{t.patientCount}</td><td className="px-2 py-2">{GAP_STATUS[t.status]}</td>
              <td className="px-2 py-2 text-right">{t.status === "open" && <button type="button" disabled={busy !== null} onClick={() => void done(t.id)} className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50">标记完成</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
