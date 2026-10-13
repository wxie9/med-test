import { test, expect, type Page } from "@playwright/test";

/** Waits until the cohort count shows the preview for the current filter (also proves the form has hydrated). */
async function waitCountSettled(page: Page) {
  await expect(page.getByTestId("cohort-count")).toHaveAttribute("data-pending", "false");
}

test("full chain story: patient → clinic → governance → research → back to patient", async ({ page, request }) => {
  expect((await request.post("/api/reset")).ok()).toBe(true);

  // 主线 A · 患者端：患者 A 提交月度 ePRO
  await page.goto("/patient/pro");
  await page.getByTestId("slider-关节痛").fill("2");
  await page.getByTestId("slider-潮热").fill("2");
  await page.getByTestId("missed-doses").fill("5");
  await page.getByTestId("stop-intent").check();
  await page.getByTestId("submit-pro").click();
  await expect(page.getByTestId("pro-feedback")).toContainText("个案管理师将在 1 个工作日内联系您");

  // 主线 A · 医生工作台：一次提交只产生两条预警；首条走完 接单 → 开始处置 → 提交复核 → 关闭
  await page.goto("/clinic/alerts");
  const rows = page.getByTestId("alert-row");
  await expect(rows).toHaveCount(2);
  const row = rows.first();
  for (const action of ["接单", "开始处置", "提交复核"]) await row.getByRole("button", { name: action, exact: true }).click();
  await row.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByTestId("close-note").fill("2 周后复评");
  await page.getByTestId("close-task-due").fill("2026-10-27");
  await page.getByTestId("close-confirm").click();
  await expect(row.getByText("已关闭", { exact: true })).toBeVisible();

  // 主线 B · 队列圈选：HR 阳性 + 曾发生远处转移（含已故/失访）+ CDK4/6 经治（不预设 HER2），提交数据治理
  await page.goto("/clinic/cohorts");
  await waitCountSettled(page); // hydrated and first preview resolved
  for (const id of ["f-hrpos", "f-evermet", "f-cdk46"]) await page.getByTestId(id).check();
  await waitCountSettled(page);
  await page.getByTestId("cohort-name").fill("HR+ 曾转移 CDK4/6 经治");
  expect(Number(await page.getByTestId("cohort-count").textContent())).toBeGreaterThan(0);
  await page.getByTestId("cohort-submit").click();
  await expect(page.getByTestId("cohort-submitted")).toBeVisible();

  // 主线 C · 数据治理：创建首个研究快照
  await page.goto("/governance");
  await page.getByTestId("create-snapshot").first().click();
  await expect(page.getByTestId("snapshot-id")).toHaveText("SNAP-2026-10-13-v1");

  // 主线 D · 研究门户：入组可行性漏斗并申请候选核查
  await page.goto("/research");
  await page.getByText("SNAP-2026-10-13-v1").click();
  await page.getByRole("link", { name: "入组可行性", exact: true }).click();
  await expect(page.getByTestId("funnel-step")).toHaveCount(6);
  // 无 HER2 预筛：HER2 低表达一步出现真实的“信息不足”（IHC 2+ 缺 ISH）
  const her2Unknown = Number(await page.locator('[data-testid="funnel-step"][data-step="her2_low"]').getByTestId("funnel-unknown").textContent());
  expect(her2Unknown).toBeGreaterThan(0);
  await page.getByTestId("request-candidates").click();
  await expect(page.getByTestId("candidates-requested")).toBeVisible();
  await expect(page.getByTestId("candidates-requested")).toContainText("已向科室发出候选核查请求");

  // 主线 D · 第二个快照：早期辅助内分泌在治队列 → SNAP-2026-10-13-v2 → 依从性页有数据
  await page.goto("/clinic/cohorts");
  await waitCountSettled(page);
  for (const id of ["f-hrpos", "f-stage-early_adjuvant", "f-cur-endocrine"]) await page.getByTestId(id).check();
  await waitCountSettled(page);
  await page.getByTestId("cohort-name").fill("早期辅助内分泌在治");
  await page.getByTestId("cohort-submit").click();
  await expect(page.getByTestId("cohort-submitted")).toBeVisible();
  await page.goto("/governance");
  const earlyCard = page.getByTestId("cohort-card").filter({ hasText: "早期辅助内分泌在治" });
  await earlyCard.getByTestId("create-snapshot").click();
  await expect(earlyCard.getByTestId("snapshot-id")).toHaveText("SNAP-2026-10-13-v2");
  await page.goto("/research/SNAP-2026-10-13-v2/adherence");
  await expect(page.getByTestId("stat-footer").first()).toContainText(/n=[1-9]\d*，/);
  await expect(page.getByTestId("stop-reason-chart")).toBeVisible();

  // 闭环 · 医生工作台：确认首个候选
  await page.goto("/clinic/candidates");
  const candidate = page.getByTestId("candidate-row").first();
  const pid = (await candidate.getByTestId("candidate-pid").textContent())?.trim();
  expect(pid).toBeTruthy();
  await candidate.getByRole("button", { name: "确认", exact: true }).click();
  await expect(candidate.getByText("已确认", { exact: true })).toBeVisible();

  // 闭环 · 患者端：该患者收到研究机会，患者管家回答参加研究的注意事项
  await page.goto(`/patient/research?patient=${encodeURIComponent(pid!)}`);
  await expect(page.getByText(/可能适合您/)).toBeVisible();
  await page.goto("/patient/assistant");
  await page.getByRole("button", { name: "参加临床研究需要注意什么？", exact: true }).click();
  await expect(page.getByTestId("agent-reply")).toBeVisible();
});
