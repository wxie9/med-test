import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

type LiteState = { alerts: unknown[]; cohorts: unknown[]; snapshots: unknown[]; candidateRequests: unknown[]; gapTasks: unknown[]; seedVersion: number };

async function json<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}
const reset = async (request: APIRequestContext) => json<{ ok: boolean }>(await request.post("/api/reset"));
const getState = async (request: APIRequestContext) => json<LiteState>(await request.get("/api/state"));
const proCount = async (request: APIRequestContext, id: string) => (await json<{ patient: { pro: unknown[] } }>(await request.get(`/api/patients/${id}`))).patient.pro.length;

async function submitPro(request: APIRequestContext, patientId: string) {
  return json(await request.post("/api/pro", {
    data: { patientId, scaleId: "endocrine_monthly_v1", items: { 关节痛: 2, 潮热: 2, 情绪: 0, 睡眠: 0 }, flags: { missedDoses14d: 5, stopIntent: true } },
  }));
}
async function createSubmittedCohort(request: APIRequestContext) {
  const filter = { hrPositive: true, everMetastatic: true, priorCdk46: true };
  return json<{ id: string; status: string }>(await request.post("/api/cohorts", { data: { name: "重置测试队列", filter, by: "张医生", submit: true } }));
}
async function createSnapshot(request: APIRequestContext, cohortId: string) {
  return json<{ id: string }>(await request.post("/api/snapshots", { data: { cohortId, cutoff: "2026-10-13" } }));
}

test("three demo rounds each reset back to seed state", async ({ request }) => {
  await reset(request);
  const seedPro = await proCount(request, "P-A");
  let lastVersion = (await getState(request)).seedVersion;
  for (let round = 1; round <= 3; round++) {
    await submitPro(request, "P-A");
    const cohort = await createSubmittedCohort(request);
    expect(cohort.status).toBe("submitted");
    const snap = await createSnapshot(request, cohort.id);
    expect(snap.id).toBe("SNAP-2026-10-13-v1"); // numbering restarts after every reset
    const dirty = await getState(request);
    expect(dirty.alerts.length).toBeGreaterThan(0);
    expect(await proCount(request, "P-A")).toBe(seedPro + 1);

    await reset(request);
    const s = await getState(request);
    expect(s.alerts, `round ${round}`).toEqual([]);
    expect(s.cohorts, `round ${round}`).toEqual([]);
    expect(s.snapshots, `round ${round}`).toEqual([]);
    expect(s.candidateRequests, `round ${round}`).toEqual([]);
    expect(s.gapTasks, `round ${round}`).toEqual([]);
    expect(await proCount(request, "P-A")).toBe(seedPro);
    expect(s.seedVersion).toBeGreaterThan(lastVersion);
    lastVersion = s.seedVersion;
  }
});

test.describe("1440×900 projector viewport", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("view entry pages have no horizontal scroll", async ({ page }) => {
    for (const path of ["/", "/patient", "/clinic/alerts", "/governance", "/research"]) {
      await page.goto(path);
      await expect(page.getByTestId("mode-badge")).not.toHaveText("…"); // root layout hydrated and state loaded
      await expect(page.getByText("加载中…")).toHaveCount(0);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, path).toBeLessThanOrEqual(1440);
    }
  });
});
