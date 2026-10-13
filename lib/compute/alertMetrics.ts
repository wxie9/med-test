import type { Alert } from "@/lib/domain/types";
type Pct = { p50: number | null; p90: number | null };
const HOUR = 3_600_000;
const OVERDUE_HOURS: Record<Alert["level"], number> = { high: 2, medium: 24 };
/** Nearest-rank percentile; null for an empty set. */
function pct(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(q * s.length) - 1)];
}
export function alertMetrics(alerts: Alert[], nowIso: string): { firstResponse: { high: Pct; medium: Pct }; overdueUnassigned: number; closedThisWeek: number } {
  const now = Date.parse(nowIso);
  const hours: Record<Alert["level"], number[]> = { high: [], medium: [] };
  let overdueUnassigned = 0, closedThisWeek = 0;
  for (const a of alerts) {
    const trig = a.timestamps.triggered ? Date.parse(a.timestamps.triggered) : NaN;
    if (a.timestamps.accepted && !Number.isNaN(trig)) hours[a.level].push((Date.parse(a.timestamps.accepted) - trig) / HOUR);
    if ((a.status === "unassigned" || a.status === "escalated") && !Number.isNaN(trig) && (now - trig) / HOUR > OVERDUE_HOURS[a.level]) overdueUnassigned++;
    if (a.status === "closed" && a.timestamps.closed) { const c = Date.parse(a.timestamps.closed); if (c <= now && now - c <= 7 * 24 * HOUR) closedThisWeek++; }
  }
  return { firstResponse: { high: { p50: pct(hours.high, 0.5), p90: pct(hours.high, 0.9) }, medium: { p50: pct(hours.medium, 0.5), p90: pct(hours.medium, 0.9) } }, overdueUnassigned, closedThisWeek };
}
