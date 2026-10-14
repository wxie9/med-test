"use client";
import { useParams } from "next/navigation";
import { useResearch } from "@/components/research/useResearch";
import { PageStatus } from "@/components/research/PageStatus";
import { ResearchCard } from "@/components/research/ResearchCard";
import { LineGapBar } from "@/components/research/LineGapBar";
import { PatternChart } from "@/components/PatternChart";
import { StatFooter } from "@/components/StatFooter";
export default function PatternsPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>();
  const id = decodeURIComponent(snapshotId);
  const { data: d, error } = useResearch("patterns", id);
  if (!d) return <PageStatus error={error} />;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">治疗模式 <span className="font-mono text-sm font-normal text-gray-500">{id}</span></h1>
      <ResearchCard title={`治疗线序列（共 ${d.patterns.sequences.length} 种${d.patterns.sequences.length > 10 ? "，显示前 10 种" : ""}）`}>
        <PatternChart sequences={d.patterns.sequences} />
        <StatFooter {...d.summary} />
      </ResearchCard>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ResearchCard title="一线后状态">
          <LineGapBar gap={d.gapAfterLine1} />
          <StatFooter {...d.summary} />
        </ResearchCard>
        <ResearchCard title="二线后状态">
          <LineGapBar gap={d.gapAfterLine2} />
          <StatFooter {...d.summary} />
        </ResearchCard>
      </div>
      <p className="text-xs text-gray-400">分母说明：页脚 n 为有治疗线记录的患者（事件数 = 其中有进展记录的患者数）；一线后 / 二线后条形的分母为进入该线的患者（见条下计数），五种状态互斥。</p>
    </div>
  );
}
