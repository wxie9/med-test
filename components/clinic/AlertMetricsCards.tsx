import type { Alert } from "@/lib/domain/types";
import { alertMetrics } from "@/lib/compute";
const h = (v: number | null) => (v === null ? "—" : v.toFixed(1));
/** Headline response metrics for the alert queue (hours, 1 decimal). */
export function AlertMetricsCards({ alerts, nowIso }: { alerts: Alert[]; nowIso: string }) {
  const m = alertMetrics(alerts, nowIso);
  const cards = [
    { label: "高级首响应 P50 / P90", value: `${h(m.firstResponse.high.p50)} / ${h(m.firstResponse.high.p90)}`, unit: "小时" },
    { label: "中级首响应 P50 / P90", value: `${h(m.firstResponse.medium.p50)} / ${h(m.firstResponse.medium.p90)}`, unit: "小时" },
    { label: "逾期未处理", value: String(m.overdueUnassigned), unit: "条", warn: m.overdueUnassigned > 0 },
    { label: "本周关闭", value: String(m.closedThisWeek), unit: "条" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(c => (
        <div key={c.label} className="ui-panel">
          <p className="text-xs text-gray-500">{c.label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${c.warn ? "text-red-600" : "text-gray-900"}`}>{c.value}<span className="ml-1 text-sm font-normal text-gray-500">{c.unit}</span></p>
        </div>
      ))}
    </div>
  );
}
