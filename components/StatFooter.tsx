/** Statistical footnote shown under every research chart. */
export function StatFooter({ n, events, followUpMedian, cutoff }: { n: number; events?: number; followUpMedian?: number; cutoff: string }) {
  const parts = [`n=${n}`];
  if (events !== undefined) parts.push(`事件数=${events}`);
  if (followUpMedian !== undefined) parts.push(`随访中位 ${followUpMedian.toFixed(1)} 个月`);
  parts.push(`数据截止 ${cutoff}`);
  return (
    <p data-testid="stat-footer" className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
      <span className="tabular-nums">{parts.join("，")}</span>
      <span className="ml-2 text-gray-400">· 合成数据，仅用于演示，不构成研究结论</span>
    </p>
  );
}
