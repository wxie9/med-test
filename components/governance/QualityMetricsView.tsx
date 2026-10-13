import { pct } from "@/lib/governance/labels";
export type QualityMetrics = { n: number; completeness: { subtype: number; stage: number; lines: number }; lineReviewRate: number; consent: { followUp: number; research: number; pharmaDeidentified: number } };
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-gray-100 bg-gray-50 px-3 py-2"><p className="text-xs text-gray-500">{label}</p><p className="text-base font-semibold tabular-nums">{value}</p></div>;
}
export function QualityMetricsView({ q }: { q: QualityMetrics }) {
  return (
    <div className="space-y-2" data-testid="quality-metrics">
      <p className="text-xs font-semibold text-gray-500">字段完整率</p>
      <div className="grid grid-cols-4 gap-2">
        <Metric label="分型" value={pct(q.completeness.subtype)} /><Metric label="分期" value={pct(q.completeness.stage)} />
        <Metric label="治疗线（晚期）" value={pct(q.completeness.lines)} /><Metric label="治疗线复核率" value={pct(q.lineReviewRate)} />
      </div>
      <p className="text-xs font-semibold text-gray-500">知情同意</p>
      <div className="grid grid-cols-4 gap-2">
        <Metric label="随访" value={pct(q.consent.followUp)} /><Metric label="院内研究" value={pct(q.consent.research)} />
        <Metric label="药企去标识化" value={pct(q.consent.pharmaDeidentified)} />
      </div>
    </div>
  );
}
