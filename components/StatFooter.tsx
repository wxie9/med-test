import type { StatSummary } from "@/lib/research/usecases";
const NA = "不适用";
/** Statistical footnote shown under every research chart (server-computed summary; null → 不适用). */
export function StatFooter({ n, events, followUpMedian, cutoff }: StatSummary) {
  const text = `n=${n}，事件数=${events ?? NA}，随访中位 ${followUpMedian === null ? NA : `${followUpMedian.toFixed(1)} 个月`}，数据截止 ${cutoff}`;
  return (
    <p data-testid="stat-footer" className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
      <span className="tabular-nums">{text}</span>
      <span className="ml-2 text-gray-400">· 合成数据，仅用于演示，不构成研究结论</span>
    </p>
  );
}
