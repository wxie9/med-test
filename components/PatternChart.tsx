/** Horizontal bars of the most frequent treatment-line sequences (top 10 by count). */
export function PatternChart({ sequences, top = 10 }: { sequences: { path: string; count: number }[]; top?: number }) {
  const data = [...sequences].sort((a, b) => b.count - a.count).slice(0, top);
  if (!data.length) return <p className="text-sm text-gray-400">无治疗线记录</p>;
  return (
    <div className="min-w-0 w-full" data-testid="pattern-chart">
      <ul className="space-y-3">
        {data.map(s => (
          <li key={s.path} className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_4rem]">
            <span className="col-span-2 min-w-0 sm:col-span-1">{s.path}</span>
            <span className="h-6 min-w-0 rounded bg-gray-50" title={`${s.path}：${s.count} 例`}>
              <span className="block h-6 rounded bg-pink-600" style={{ width: `${s.count / Math.max(data[0].count, 1) * 100}%` }} />
            </span>
            <span className="text-right text-xs text-gray-700 tabular-nums">{s.count} 例</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
