import { test, expect } from "@playwright/test";

let snapshotId: string;
let adherenceSnapshotId: string;
test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/reset")).ok()).toBe(true);
  const cohort = await request.post("/api/cohorts", { data: { name: "窄窗口验收", filter: { hrPositive: true, everMetastatic: true, priorCdk46: true }, by: "张医生", submit: true } });
  expect(cohort.ok()).toBe(true);
  const snapshot = await request.post("/api/snapshots", { data: { cohortId: (await cohort.json()).id, cutoff: "2026-10-13" } });
  expect(snapshot.ok()).toBe(true);
  snapshotId = (await snapshot.json()).id;
  const early = await request.post("/api/cohorts", { data: { name: "窄窗口依从性", filter: { hrPositive: true, stage: ["early_adjuvant"], currentTreatmentType: ["endocrine"] }, by: "张医生", submit: true } });
  expect(early.ok()).toBe(true);
  const earlySnapshot = await request.post("/api/snapshots", { data: { cohortId: (await early.json()).id, cutoff: "2026-10-13" } });
  expect(earlySnapshot.ok()).toBe(true);
  adherenceSnapshotId = (await earlySnapshot.json()).id;
});
test.afterAll(async ({ request }) => { await request.post("/api/reset"); });

for (const width of [755, 390]) {
  test(`research funnel and controls remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/research/${snapshotId}/feasibility`);
    await expect(page.getByTestId("funnel-step")).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bar = await page.getByTestId("funnel-step").first().locator('[data-segment="met"]').boundingBox();
    expect(bar!.width).toBeGreaterThan(100);
    await expect(page.getByTestId("funnel-summary")).toContainText("20");
    await page.getByRole("button", { name: "当前快照共有多少例？", exact: true }).click();
    await expect(page.getByTestId("agent-reply").last()).toContainText("当前快照共 169 例");
    const requestButton = page.getByRole("button", { name: "申请候选患者核查", exact: true });
    await requestButton.scrollIntoViewIfNeeded();
    const button = await requestButton.boundingBox();
    expect(button!.x).toBeGreaterThanOrEqual(0);
    expect(button!.x + button!.width).toBeLessThanOrEqual(width);
    await expect(requestButton).toBeEnabled();
  });
}

test("research sections preserve navigation and avoid page overflow across window sizes", async ({ page }) => {
  for (const width of [390, 640, 755, 800, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ["overview", "patterns", "adherence", "feasibility"]) {
      await page.goto(`/research/${section === "adherence" ? adherenceSnapshotId : snapshotId}/${section}`);
      await expect(page.getByTestId("stat-footer").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${section} at ${width}`).toBeLessThanOrEqual(width);
      await expect(page.getByRole("navigation", { name: "药企研究导航" }).getByRole("link", { name: "入组可行性", exact: true })).toBeVisible();
    }
  }
});

test("nonempty adherence pie counts stay within the card at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/research/${adherenceSnapshotId}/adherence`);
  await expect(page.getByTestId("stat-footer").first()).toContainText("n=805");
  const card = await page.getByTestId("missed-reason-pie").boundingBox();
  for (const text of ["未填写 962", "外出 787", "关节痛 785", "忘记 763"]) {
    const label = page.getByText(text, { exact: true });
    await expect(label).toBeVisible();
    const bounds = await label.boundingBox();
    expect(bounds!.x, text).toBeGreaterThanOrEqual(card!.x - 1);
    expect(bounds!.x + bounds!.width, text).toBeLessThanOrEqual(card!.x + card!.width + 1);
  }
});

test("treatment pattern bars preserve count proportions at 640px", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(`/research/${snapshotId}/patterns`);
  await expect(page.getByTestId("stat-footer").first()).toContainText("n=169");
  const chart = page.getByTestId("pattern-chart");
  await expect(chart).toContainText("105 例");
  await expect(chart).toContainText("35 例");
  const widths = await chart.locator("span[style]").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
  expect(widths).toHaveLength(3);
  expect(widths[0] / widths[1]).toBeCloseTo(105 / 35, 2);
  expect(widths[0] / widths[2]).toBeCloseTo(105 / 29, 2);
});
