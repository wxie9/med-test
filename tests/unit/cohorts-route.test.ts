import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/cohorts/route";
import { PATCH } from "@/app/api/cohorts/[id]/route";
import { getStore, resetStore } from "@/lib/state/store";
import type { Cohort } from "@/lib/domain/types";
import expected from "@/data/seed/expected.json";
const post = (body: object) => POST(new Request("http://x/api/cohorts", { method: "POST", body: JSON.stringify(body) }));
const filter = { hrPositive: true, everMetastatic: true, priorCdk46: true };
describe("POST /api/cohorts", () => {
  beforeEach(() => resetStore());
  it("creates and submits in one request when submit: true", async () => {
    const r = await post({ name: "q", filter, by: "张医生", submit: true }); const c = (await r.json()) as Cohort;
    expect(r.status).toBe(201); expect(c.status).toBe("submitted"); expect(c.patientIds).toHaveLength(expected.find(e => e.key === "hrpos_evermet_cdk46")!.expectedCount!);
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

describe("POST /api/cohorts/export (统计一致：page == export == preview == expected.json)", () => {
  beforeEach(() => resetStore());
  it("exports one CSV data row per patient of the current filter; the row count equals the preview count and expected.json", async () => {
    const { POST: EXPORT } = await import("@/app/api/cohorts/export/route");
    const { POST: PREVIEW } = await import("@/app/api/cohorts/preview/route");
    for (const e of expected) {
      const body = JSON.stringify({ filter: e.filter });
      const r = await EXPORT(new Request("http://x/api/cohorts/export", { method: "POST", body }));
      expect(r.status).toBe(200); expect(r.headers.get("content-type")).toMatch(/^text\/csv/);
      const text = (await r.text()).replace(/^\uFEFF/, ""); const lines = text.split("\r\n").filter(Boolean);
      expect(lines[0]).toBe("patient_id,stage,her2,hr_positive,current_treatment,last_contact");
      const preview = (await (await PREVIEW(new Request("http://x/api/cohorts/preview", { method: "POST", body }))).json()) as { count: number };
      expect(lines.length - 1, e.key).toBe(preview.count); expect(preview.count, e.key).toBe(e.expectedCount);
      expect(Number(r.headers.get("x-row-count"))).toBe(preview.count);
    }
  });
  it("rows carry id, stage, HER2 class, HR status, current treatment and last contact; 400 on a bad body", async () => {
    const { POST: EXPORT } = await import("@/app/api/cohorts/export/route");
    const r = await EXPORT(new Request("http://x/api/cohorts/export", { method: "POST", body: JSON.stringify({ filter: { stage: ["metastatic"], currentTreatmentType: ["adc"] } }) }));
    const row = (await r.text()).split("\r\n").find(l => l.startsWith("P-B,"))!;
    expect(row).toBe(`P-B,metastatic,low,true,德曲妥珠单抗,${getStore().patients.get("P-B")!.lastContact}`);
    expect((await EXPORT(new Request("http://x/api/cohorts/export", { method: "POST", body: "{}" }))).status).toBe(400);
  });
});
