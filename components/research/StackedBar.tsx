export type Segment = { key: string; label: string; value: number; color: string };
/** One horizontal bar split into mutually exclusive segments; `scale` (≥ total) sets the full width, so bars can be compared. */
export function StackedBar({ segments, scale, height = "h-7" }: { segments: Segment[]; scale?: number; height?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const full = Math.max(scale ?? total, total, 1);
  return (
    <div className={`flex w-full overflow-hidden rounded bg-gray-50 ${height}`}>
      {segments.filter(s => s.value > 0).map(s => (
        <div key={s.key} data-segment={s.key} title={`${s.label} ${s.value}`} style={{ width: `${(s.value / full) * 100}%`, backgroundColor: s.color }}
          className="flex items-center justify-center overflow-hidden text-xs font-semibold tabular-nums text-white">
          {s.value / full >= 0.06 ? s.value : ""}
        </div>
      ))}
    </div>
  );
}
export function SegmentLegend({ segments }: { segments: Pick<Segment, "key" | "label" | "color">[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {segments.map(s => <li key={s.key} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />{s.label}</li>)}
    </ul>
  );
}
