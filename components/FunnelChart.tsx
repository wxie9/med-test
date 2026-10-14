import { SegmentLegend, StackedBar } from "@/components/research/StackedBar";
export type FunnelStep = { id: string; label: string; met: number; notMet: number; unknown: number };
const SEGS = [
  { key: "met", label: "符合", color: "#059669" },
  { key: "notMet", label: "不符合", color: "#e11d48" },
  { key: "unknown", label: "信息不足", color: "#94a3b8" },
] as const;
/** Three-state enrolment funnel: one row per criterion; bar width is relative to the patients entering the first step. */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const scale = steps.length ? steps[0].met + steps[0].notMet + steps[0].unknown : 0;
  return (
    <div className="space-y-2">
      <SegmentLegend segments={[...SEGS]} />
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id} data-testid="funnel-step" data-step={s.id} className="grid min-w-0 grid-cols-1 items-center gap-1 text-sm lg:grid-cols-[13rem_minmax(0,1fr)_15rem] lg:gap-3">
            <span className="min-w-0" title={s.label}><span className="mr-1 text-gray-400 tabular-nums">{i + 1}.</span>{s.label}</span>
            <StackedBar scale={scale} segments={SEGS.map(g => ({ key: g.key, label: g.label, color: g.color, value: s[g.key] }))} />
            <span className="text-xs text-gray-600 tabular-nums">
              {SEGS.map((g, j) => <span key={g.key}>{j > 0 && " / "}{g.label} <span data-testid={g.key === "unknown" ? "funnel-unknown" : undefined}>{s[g.key]}</span></span>)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
