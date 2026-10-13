import { SegmentLegend, StackedBar, type Segment } from "@/components/research/StackedBar";
export type LineGap = { on_treatment: number; next_line: number; lost: number; deceased: number; unknown: number };
export const GAP_SEGMENTS: { key: keyof LineGap; label: string; color: string }[] = [
  { key: "on_treatment", label: "仍在治疗", color: "#2563eb" },
  { key: "next_line", label: "已进入下一线", color: "#059669" },
  { key: "lost", label: "失访", color: "#d97706" },
  { key: "deceased", label: "死亡", color: "#374151" },
  { key: "unknown", label: "信息不足", color: "#94a3b8" },
];
export const gapTotal = (g: LineGap) => GAP_SEGMENTS.reduce((s, x) => s + g[x.key], 0);
/** Five mutually exclusive statuses for every patient who reached a given line. */
export function LineGapBar({ gap }: { gap: LineGap }) {
  const segments: Segment[] = GAP_SEGMENTS.map(s => ({ ...s, value: gap[s.key] }));
  return (
    <div className="space-y-2" data-testid="line-gap-bar">
      <StackedBar segments={segments} height="h-8" />
      <SegmentLegend segments={GAP_SEGMENTS} />
      <p className="text-xs text-gray-600 tabular-nums">{segments.map(s => `${s.label} ${s.value}`).join(" · ")}</p>
    </div>
  );
}
