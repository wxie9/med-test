"use client";
import { useParams } from "next/navigation";
import { useResearch } from "@/components/research/useResearch";
import { PageStatus } from "@/components/research/PageStatus";
import { MetricCard, ResearchCard } from "@/components/research/ResearchCard";
import { MissedReasonPie } from "@/components/research/MissedReasonPie";
import { StatFooter } from "@/components/StatFooter";
import { pct } from "@/lib/governance/labels";
export default function AdherencePage() {
  const { snapshotId } = useParams<{ snapshotId: string }>();
  const id = decodeURIComponent(snapshotId);
  const { data: a, error } = useResearch("adherence", id);
  if (!a) return <PageStatus error={error} />;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">辅助内分泌依从性描述（合成数据，关联不构成发现） <span className="font-mono text-sm font-normal text-gray-500">{id}</span></h1>
      <div className="grid grid-cols-[1fr_20rem] gap-4">
        <ResearchCard title="漏服原因分布">
          <MissedReasonPie dist={a.missedReasonDist} />
          <StatFooter {...a.summary} />
        </ResearchCard>
        <div className="space-y-3">
          <MetricCard label="停药念头比例" value={a.n ? pct(a.stopIntentRate) : "—"} note="按问卷计" />
          <MetricCard label="平均服药率" value={a.n ? pct(a.meanTakenRate) : "—"} note="合计服药/应服" />
          <StatFooter {...a.summary} />
        </div>
      </div>
      {a.n === 0 && <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">本快照无辅助内分泌服药记录（例如仅含晚期患者的队列），依从性指标不可计算。</p>}
      <p className="text-xs text-gray-400">n 为有服药记录的患者数；漏服原因按漏服记录条数计。</p>
    </div>
  );
}
