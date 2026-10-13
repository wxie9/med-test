import { describe, it, expect } from "vitest";
import { buildTimeline } from "@/lib/clinic/timeline";
import { getStore } from "@/lib/state/store";
describe("buildTimeline", () => {
  const pb = getStore().patients.get("P-B")!;
  const m = buildTimeline(pb, "2026-10-14");
  const lane = (k: string) => m.lanes.find(l => l.key === k)!;
  it("shows P-B's primary IHC 0 and metastatic 1+ specimens with derived class", () => {
    const sp = lane("specimen").items;
    expect(sp.map(i => [i.tone, i.her2])).toEqual([["primary", "zero"], ["metastatic_specimen", "low"]]);
    expect(sp[0].detail).toContain("IHC 0"); expect(sp[1].detail).toContain("IHC 1+");
  });
  it("labels metastatic treatments with their line number", () => {
    const titles = lane("treatment").items.map(i => i.title);
    expect(titles).toContain("L1 · 氟维司群"); expect(titles).toContain("L1 · 哌柏西利"); expect(titles).toContain("L2 · 德曲妥珠单抗");
    expect(lane("treatment").items.filter(i => i.tone === "adjuvant").every(i => i.lineNo === undefined)).toBe(true);
  });
  it("packs overlapping treatments into separate rows and keeps positions on the axis", () => {
    const l1 = lane("treatment").items.filter(i => i.lineNo === 1);
    expect(l1[0].row).not.toBe(l1[1].row);
    expect(m.start).toBe("2022-03-10");
    for (const l of m.lanes) for (const i of l.items) { expect(i.left).toBeGreaterThanOrEqual(0); expect(i.left + i.width).toBeLessThanOrEqual(100.0001); }
    expect(m.ticks.length).toBeGreaterThan(0);
  });
});
