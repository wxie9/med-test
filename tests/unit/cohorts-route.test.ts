import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/cohorts/route";
import { PATCH } from "@/app/api/cohorts/[id]/route";
import { getStore, resetStore } from "@/lib/state/store";
import type { Cohort } from "@/lib/domain/types";
import expected from "@/data/seed/expected.json";
const post = (body: object) => POST(new Request("http://x/api/cohorts", { method: "POST", body: JSON.stringify(body) }));
const filter = { hrPositive: true, her2: ["low"], stage: ["metastatic"], priorCdk46: true };
describe("POST /api/cohorts", () => {
  beforeEach(() => resetStore());
  it("creates and submits in one request when submit: true", async () => {
    const r = await post({ name: "q", filter, by: "张医生", submit: true }); const c = (await r.json()) as Cohort;
    expect(r.status).toBe(201); expect(c.status).toBe("submitted"); expect(c.patientIds).toHaveLength(expected.find(e => e.key === "hrpos_her2low_metastatic_cdk46")!.expectedCount!);
    expect(getStore().cohorts).toHaveLength(1); expect(getStore().cohorts[0].status).toBe("submitted");
  });
  it("creates a draft without submit; PATCH submit still works", async () => {
    const c = (await (await post({ name: "q", filter, by: "张医生" })).json()) as Cohort; expect(c.status).toBe("draft");
    const r = await PATCH(new Request(`http://x/api/cohorts/${c.id}`, { method: "PATCH", body: JSON.stringify({ action: "submit" }) }), { params: Promise.resolve({ id: c.id }) });
    expect(r.status).toBe(200); expect(getStore().cohorts[0].status).toBe("submitted");
  });
  it("rejects invalid bodies with 400", async () => {
    expect((await post({ name: " ", filter, by: "x" })).status).toBe(400);
    expect((await post({ name: "q", filter: { her2: ["ultralow"] }, by: "x" })).status).toBe(400);
    expect(getStore().cohorts).toHaveLength(0);
  });
});
