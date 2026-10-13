"use client";
import { useParams } from "next/navigation";
import { useResearch } from "@/components/research/useResearch";
import { PageStatus } from "@/components/research/PageStatus";
import { MetricCard, ResearchCard } from "@/components/research/ResearchCard";
import { FollowUpBar } from "@/components/research/FollowUpBar";
import { StatFooter } from "@/components/StatFooter";
import { pct } from "@/lib/governance/labels";
export default function OverviewPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>();
  const id = decodeURIComponent(snapshotId);
  const { data: o, snapshot, error } = useResearch("overview", id);
  if (!o) return <PageStatus error={error} />;
  const cutoff = snapshot?.cutoff ?? "—";
  const missing = [
    { label: "缺 ISH（HER2 IHC 2+ 未做 ISH）", value: o.missing.ish },
    { label: "停药原因未知", value: o.missing.stopReason },
    { label: "外院治疗无日期", value: o.missing.externalNoDate },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">快照概览 <span className="font-mono text-sm font-normal text-gray-500">{id}</span></h1>
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="患者数 n" value={String(o.n)} />
        <MetricCard label="转移事件" value={String(o.events.metastasis)} note="有远处转移记录的患者" />
        <MetricCard label="进展事件" value={String(o.events.progression)} note="有疾病进展记录的患者" />
        <MetricCard label="死亡事件" value={String(o.events.death)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ResearchCard title="随访时长分布（入组至末次联系）">
          <FollowUpBar p25={o.followUpMonths.p25} median={o.followUpMonths.median} p75={o.followUpMonths.p75} />
          <StatFooter n={o.n} followUpMedian={o.followUpMonths.median} cutoff={cutoff} />
        </ResearchCard>
        <ResearchCard title="缺失概况">
          <table className="w-full text-sm" data-testid="missing-table">
            <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1 font-normal">字段</th><th className="pb-1 text-right font-normal">患者数</th><th className="pb-1 text-right font-normal">占比</th></tr></thead>
            <tbody>{missing.map(m => <tr key={m.label} className="border-t border-gray-100"><td className="py-1.5">{m.label}</td><td className="text-right tabular-nums">{m.value}</td><td className="text-right tabular-nums">{pct(o.n ? m.value / o.n : undefined)}</td></tr>)}</tbody>
          </table>
          <StatFooter n={o.n} cutoff={cutoff} />
        </ResearchCard>
      </div>
      {o.survivalEstimable
        ? <ResearchCard title="生存曲线：可估计（本演示不绘制曲线）"><StatFooter n={o.n} events={o.events.death} followUpMedian={o.followUpMonths.median} cutoff={cutoff} /></ResearchCard>
        : <section data-testid="survival-not-estimable" className="rounded-xl border border-gray-200 bg-gray-100 p-4 text-gray-500">
            <h2 className="text-sm font-semibold">生存曲线：事件数 &lt; 10，不可估计</h2>
            <StatFooter n={o.n} events={o.events.death} followUpMedian={o.followUpMonths.median} cutoff={cutoff} />
          </section>}
    </div>
  );
}
