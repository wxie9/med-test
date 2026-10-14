import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/lib/clinic/timeline";
import { candidateSummary } from "@/lib/research/candidates";
import { loadSeed } from "@/lib/seed/load";

describe("Shanghai calendar date in clinical projections", () => {
  it.each(["2026-10-13T17:00:00.000Z", "2026-10-14T01:00:00+08:00"])("labels a 01:00 local questionnaire on October 14: %s", submittedAt => {
    const p = structuredClone(loadSeed().anchors[1]);
    p.pro = [{ id: "midnight-pro", scaleId: "treatment_weekly_v1", submittedAt, items: { 恶心: 2 }, flags: {} }];
    const item = buildTimeline(p, "2026-10-14").lanes.find(l => l.key === "pro")!.items[0];
    expect(item.start).toBe("2026-10-14");
    expect(item.detail).toContain("2026-10-14");
    expect(candidateSummary(p).latestPro).toMatch(/^2026-10-14/);
  });

  it("selects the latest questionnaire by instant when seed and API offsets differ", () => {
    const p = structuredClone(loadSeed().anchors[1]);
    p.pro = [
      { id: "seed-pro", scaleId: "treatment_weekly_v1", submittedAt: "2026-10-13T23:00:00+08:00", items: { 恶心: 0 }, flags: {} },
      { id: "new-api-pro", scaleId: "endocrine_monthly_v1", submittedAt: "2026-10-13T17:00:00.000Z", items: { 关节痛: 3 }, flags: {} },
    ];
    expect(candidateSummary(p).latestPro).toMatch(/^2026-10-14/);
  });
});
