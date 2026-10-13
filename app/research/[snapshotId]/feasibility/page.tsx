"use client";
import { useParams } from "next/navigation";
import { useResearch } from "@/components/research/useResearch";
import { PageStatus } from "@/components/research/PageStatus";
import { ResearchCard } from "@/components/research/ResearchCard";
import { CandidateRequestPanel } from "@/components/research/CandidateRequestPanel";
import { FunnelChart } from "@/components/FunnelChart";
import { StatFooter } from "@/components/StatFooter";
export default function FeasibilityPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>();
  const id = decodeURIComponent(snapshotId);
  const { data: f, error } = useResearch("feasibility", id);
  if (!f) return <PageStatus error={error} />;
  const reasons = new Map<string, number>();
  for (const s of f.steps) for (const [k, v] of Object.entries(s.unknownReasons)) reasons.set(k, (reasons.get(k) ?? 0) + v);
  const ecogPending = f.pendingVerification.find(p => p.criterionId === "ecog")?.count ?? 0;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">入组可行性评估 · {f.protocol} <span className="font-mono text-sm font-normal text-gray-500">{id}</span></h1>
      <div className="grid grid-cols-[1fr_20rem] gap-4">
        <ResearchCard title="三态入组漏斗（符合 / 不符合 / 信息不足）">
          <FunnelChart steps={f.steps} />
          <StatFooter {...f.summary} />
        </ResearchCard>
        <div className="space-y-4">
          <ResearchCard title="信息不足原因">
            {reasons.size === 0 ? <p className="text-sm text-gray-400">无</p> : (
              <table className="w-full text-sm" data-testid="unknown-reasons">
                <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1 font-normal">原因</th><th className="pb-1 text-right font-normal">人次</th></tr></thead>
                <tbody>{[...reasons].sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k} className="border-t border-gray-100"><td className="py-1.5">{k}</td><td className="text-right tabular-nums">{v}</td></tr>)}</tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-gray-400">按步骤累计人次；同一患者可在多个步骤计入。</p>
          </ResearchCard>
          <section className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-400">研究助手（后续任务接入）</section>
        </div>
      </div>
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm" data-testid="funnel-summary">
          符合已知条件 <b className="tabular-nums">{f.finalMetCount}</b> 例，仍需医生核查（ECOG 待现场核查 <span className="tabular-nums">{ecogPending}</span> 例）
          {f.finalUnknownCount > 0 && <span className="text-gray-500">；另有 <span className="tabular-nums">{f.finalUnknownCount}</span> 例因信息不足暂无法判断</span>}
        </p>
        <CandidateRequestPanel snapshotId={id} expectedCount={f.finalMetCount} />
      </section>
    </div>
  );
}
