"use client";
import { useDemoState } from "@/lib/client/useDemoState";
import { CohortGovernanceCard } from "@/components/governance/CohortGovernanceCard";
import { GapTaskList } from "@/components/governance/GapTaskList";
import type { Cohort, DataGapTask } from "@/lib/domain/types";
import type { SnapshotSummary } from "@/lib/state/store";
type LiteState = { cohorts: Cohort[]; snapshots: SnapshotSummary[]; gapTasks: DataGapTask[]; manifest: { cutoff: string } };
export default function GovernancePage() {
  const { data, error, refresh } = useDemoState<LiteState>(3000);
  if (!data) return <p className="text-sm text-gray-500">{error ? `加载失败：${error.message}` : "加载中…"}</p>;
  const cohorts = data.cohorts.filter(c => c.status === "submitted").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">候选队列</h1>
      {cohorts.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">暂无已提交的候选队列（在医生工作台「队列圈选」中提交）</p>}
      {cohorts.map(c => <CohortGovernanceCard key={c.id} cohort={c} snapshots={data.snapshots.filter(s => s.cohortId === c.id)} defaultCutoff={data.manifest.cutoff} onCreated={() => void refresh()} />)}
      <GapTaskList tasks={data.gapTasks} onChanged={() => void refresh()} />
    </div>
  );
}
