import { describe, it, expect } from "vitest";
import { NEXT_ACTION, sortQueue, partitionQueue } from "@/lib/clinic/labels";
import type { Alert } from "@/lib/domain/types";
const mk = (id: string, level: Alert["level"], status: Alert["status"], triggered: string): Alert => ({ id, patientId: "P-A", kind: "symptom", level, rule: "r", status, assignee: null, timestamps: { triggered }, notes: [], proId: "p" });
describe("sortQueue", () => {
  it("orders high before medium, then oldest trigger first", () => {
    const out = sortQueue([mk("m1", "medium", "unassigned", "2026-10-13T01:00:00Z"), mk("h2", "high", "unassigned", "2026-10-13T03:00:00Z"), mk("h1", "high", "accepted", "2026-10-13T02:00:00Z"), mk("m0", "medium", "unassigned", "2026-10-13T00:00:00Z")]);
    expect(out.map(a => a.id)).toEqual(["h1", "h2", "m0", "m1"]);
  });
  it("does not mutate its input", () => {
    const xs = [mk("m", "medium", "unassigned", "2026-10-13T01:00:00Z"), mk("h", "high", "unassigned", "2026-10-13T02:00:00Z")];
    sortQueue(xs); expect(xs.map(a => a.id)).toEqual(["m", "h"]);
  });
});
describe("NEXT_ACTION", () => {
  it("maps each status to its single legal clinician action", () => {
    expect(NEXT_ACTION.unassigned).toEqual({ action: "accept", label: "接单" });
    expect(NEXT_ACTION.escalated).toEqual({ action: "accept", label: "接单" });
    expect(NEXT_ACTION.accepted).toEqual({ action: "start", label: "开始处置" });
    expect(NEXT_ACTION.in_progress).toEqual({ action: "submit_review", label: "提交复核" });
    expect(NEXT_ACTION.pending_review).toEqual({ action: "close", label: "关闭" });
  });
  it("offers nothing for closed or triggered", () => {
    expect(NEXT_ACTION.closed).toBeUndefined(); expect(NEXT_ACTION.triggered).toBeUndefined();
  });
});
describe("partitionQueue", () => {
  it("keeps alerts closed this session inline at their sorted position; earlier-closed go to the collapsed section", () => {
    const closedAtLoad = mk("c-load", "high", "closed", "2026-10-13T00:00:00Z");
    const openHigh = mk("o-high", "high", "unassigned", "2026-10-13T01:00:00Z");
    const openMedium = mk("o-med", "medium", "accepted", "2026-10-13T02:00:00Z");
    const closedNow = mk("c-now", "medium", "closed", "2026-10-13T03:00:00Z");
    const { main, collapsed } = partitionQueue([closedAtLoad, openHigh, openMedium, closedNow], new Set(["c-now"]));
    expect(main.map(a => a.id)).toEqual(["o-high", "o-med", "c-now"]);
    expect(main[2].status).toBe("closed");
    expect(collapsed.map(a => a.id)).toEqual(["c-load"]);
  });
  it("a high alert closed this session sorts ahead of open medium ones", () => {
    const { main } = partitionQueue([mk("o-med", "medium", "unassigned", "2026-10-13T00:00:00Z"), mk("c-hi", "high", "closed", "2026-10-13T05:00:00Z")], new Set(["c-hi"]));
    expect(main.map(a => a.id)).toEqual(["c-hi", "o-med"]);
  });
});
