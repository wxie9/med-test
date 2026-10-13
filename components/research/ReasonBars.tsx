/** Horizontal bars for a categorical count distribution (largest first); `labels` maps raw codes to display text. */
export function ReasonBars({ dist, labels = {}, unit, empty, testId }: { dist: Record<string, number>; labels?: Record<string, string>; unit: string; empty: string; testId?: string }) {
  const rows = Object.entries(dist).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return <p className="text-sm text-gray-400">{empty}</p>;
  const max = rows[0][1];
  return (
    <ul className="space-y-2" data-testid={testId}>
      {rows.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3 text-sm">
          <span className="truncate" title={labels[k] ?? k}>{labels[k] ?? k}</span>
          <span className="h-5 rounded bg-gray-50"><span className="block h-5 rounded bg-pink-500" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="text-right tabular-nums text-gray-600">{v} {unit}</span>
        </li>
      ))}
    </ul>
  );
}
