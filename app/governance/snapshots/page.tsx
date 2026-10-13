"use client";
import { useDemoState } from "@/lib/client/useDemoState";
import { fmtDateTime } from "@/lib/clinic/labels";
import { pct } from "@/lib/governance/labels";
import type { Cohort } from "@/lib/domain/types";
import type { SnapshotSummary } from "@/lib/state/store";
type LiteState = { cohorts: Cohort[]; snapshots: SnapshotSummary[] };
export default function SnapshotsPage() {
  const { data, error } = useDemoState<LiteState>(3000);
  if (!data) return <p className="text-sm text-gray-500">{error ? `加载失败：${error.message}` : "加载中…"}</p>;
  const cohortName = (id: string) => data.cohorts.find(c => c.id === id)?.name ?? id;
  const snaps = [...data.snapshots].reverse();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">研究快照</h1>
      <p className="text-sm text-gray-500">快照创建后冻结：后续临床录入不会改变快照内容；截止日之后录入的检测结果不纳入。</p>
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>{["快照 ID", "队列", "数据截止日", "创建时间", "n", "分型完整率", "分期完整率", "治疗线完整率", "治疗线复核率", ""].map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {snaps.length === 0 && <tr><td colSpan={10} className="px-2 py-6 text-center text-gray-400">暂无研究快照（在「候选队列」中创建）</td></tr>}
            {snaps.map(s => (
              <tr key={s.id} data-testid="snapshot-row" className="border-t border-gray-100">
                <td className="px-2 py-2 font-mono">{s.id}</td><td className="px-2 py-2">{cohortName(s.cohortId)}</td>
                <td className="px-2 py-2 tabular-nums">{s.cutoff}</td><td className="px-2 py-2 text-gray-500">{fmtDateTime(s.createdAt)}</td>
                <td className="px-2 py-2 tabular-nums">{s.patientCount}</td>
                <td className="px-2 py-2 tabular-nums">{pct(s.quality.subtype)}</td><td className="px-2 py-2 tabular-nums">{pct(s.quality.stage)}</td>
                <td className="px-2 py-2 tabular-nums">{pct(s.quality.lines)}</td><td className="px-2 py-2 tabular-nums">{pct(s.quality.lineReviewRate)}</td>
                <td className="px-2 py-2"><span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-white">不可变</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
