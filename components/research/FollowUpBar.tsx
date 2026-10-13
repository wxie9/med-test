/** Follow-up time distribution: interquartile box (p25–p75) with a median tick on a 0..max month axis. */
export function FollowUpBar({ p25, median, p75 }: { p25: number; median: number; p75: number }) {
  const max = Math.max(Math.ceil((p75 * 1.25) / 12) * 12, 12);
  const x = (v: number) => `${(v / max) * 100}%`;
  const ticks = Array.from({ length: max / 12 + 1 }, (_, i) => i * 12);
  return (
    <div className="space-y-1" data-testid="follow-up-bar">
      <div className="relative h-8 rounded bg-gray-100">
        <div className="absolute inset-y-1 rounded bg-pink-200" style={{ left: x(p25), width: `calc(${x(p75)} - ${x(p25)})` }} title={`P25–P75：${p25.toFixed(1)}–${p75.toFixed(1)} 个月`} />
        <div className="absolute inset-y-0 w-0.5 bg-pink-700" style={{ left: x(median) }} title={`中位 ${median.toFixed(1)} 个月`} />
      </div>
      <div className="relative h-4 text-[11px] text-gray-400">
        {ticks.map(t => <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: x(t) }}>{t}</span>)}
      </div>
      <p className="text-xs text-gray-600 tabular-nums">P25 {p25.toFixed(1)} 个月 · 中位 {median.toFixed(1)} 个月 · P75 {p75.toFixed(1)} 个月（横轴：月）</p>
    </div>
  );
}
