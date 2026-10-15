import {openPublicReportBody} from './helpers/pharmaReading';
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import type { InternalProjectView, PatientProjectsView } from "@/lib/psp/views";
import type { PharmaProjectView } from "@/lib/psp/pharmaView";
import { AcceptanceApi } from './helpers/pspAcceptance';

// Use the isolated PSP config baseURL (:3112 Next or :8787 Worker), never the original checkout server.
const projectId = "PSP-BC-ENDO-001";
const deskPath = `/clinic/projects/${projectId}/services`;
async function payload<T>(response: APIResponse): Promise<T> { expect(response.ok(), `${response.url()} -> ${response.status()}`).toBe(true); return await response.json() as T; }
async function internal(request: APIRequestContext) { return payload<InternalProjectView>(await request.get(`/api/psp/projects/${projectId}?role=case_manager&actorId=case-manager-chen`)); }
async function patient(request: APIRequestContext, patientId: string) { return payload<PatientProjectsView>(await request.get(`/api/psp/patients/${patientId}/projects?role=patient&actorId=${patientId}`)); }
test.beforeEach(async ({ request }) => { expect((await request.post("/api/reset")).ok()).toBe(true); });
test.afterAll(async ({ request }) => { await request.post("/api/reset"); });

test("pharma overview only requests authorized aggregate projections without individual identifiers", async ({ page, request }) => {
 const urls: string[] = []; page.on("request", req => { const pathname = new URL(req.url()).pathname; if (pathname.startsWith("/api/")) urls.push(pathname); });
 await page.goto(`/pharma/projects/${projectId}`);
 await expect(page.getByText("当前允许汇总人数：14 人")).toBeVisible();
 await expect(page.getByText('本阶段尚无已交付报告。完成双审核并由项目经理交付后可在此查看。')).toBeVisible(); await expect(page.getByTestId("mode-badge")).not.toHaveText("…");
 expect(urls.length).toBeGreaterThan(0); expect(urls.every(url => url.startsWith("/api/pharma/projects"))).toBe(true);
 const dto = await payload<PharmaProjectView>(await request.get(`/api/pharma/projects/${projectId}`));
 expect(dto.metrics).toEqual([]); expect(dto.reports).toEqual([]); const serialized = JSON.stringify(dto);
 expect(serialized).not.toMatch(/patientId|displayName|enrollmentId|candidates|activeService|P-A|P-0040|ENR-/);
 await expect(page.getByText(/候选名单|当前有效服务/)).toHaveCount(0);
 await expect(page.getByRole("link", { name: "研究演示", exact: true })).toBeVisible();
});

test('pharma project scope and the exact delivered entry remain usable at four widths', async ({page, request}, info) => {
 const api = new AcceptanceApi(request), {report} = await api.delivered();
 const ledgerBefore = (await api.reports()).ledgerRevision;
 const writes: string[] = [];
 page.on('request', req => {if (req.method() === 'POST') writes.push(new URL(req.url()).pathname);});
 for (const width of [390, 755, 1440, 1920]) {
  await page.setViewportSize({width, height: 900});
  await page.goto(`/pharma/projects/${projectId}`);
  const overview = page.getByTestId('psp-pharma-project-overview');
  await expect(overview).toBeVisible();
  for (const name of ['本演示支持的服务内容', '周期与阶段', '本阶段交付构成', '项目报告', '当前汇总授权']) {
   await expect(overview.getByRole('heading', {name, exact: true})).toBeVisible();
  }
  await expect(overview).toContainText('当前汇总授权人数不等于本版报告的统计分母');
  const entry = overview.getByRole('link', {name: '查看本次交付 · 修订 1', exact: true});
  await expect(entry).toHaveAttribute('href', `/pharma/projects/${projectId}/reports/${encodeURIComponent(report.id)}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const clipped = await overview.locator('a,button').evaluateAll(nodes => nodes.filter(node => {
   const box = node.getBoundingClientRect();
   return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
  }).map(node => node.textContent));
  expect(clipped).toEqual([]);
  await page.screenshot({path: info.outputPath(`project-overview-${width}.png`), fullPage: true});
  await entry.focus();
  await expect(entry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/pharma/projects/${projectId}/reports/${encodeURIComponent(report.id)}`);
  await openPublicReportBody(page);await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();
 }
 expect(writes).toEqual([]);
 expect((await api.reports()).ledgerRevision).toBe(ledgerBefore);
});

test("PA independently withdraws aggregate then service and service withdrawal pauses membership", async ({ page, request }) => {
 await page.goto("/patient?patient=P-A"); const card = page.getByTestId("psp-patient-service");
 await expect(card.getByText("接受支持服务：已授权")).toBeVisible(); await expect(card.getByText("允许项目汇总：已授权")).toBeVisible();
 await card.getByRole("button", { name: "撤回授权", exact: true }).nth(1).click();
 await expect(card.getByText("允许项目汇总：未授权")).toBeVisible(); await expect(card.getByText("接受支持服务：已授权")).toBeVisible();
 let own = (await patient(request, "P-A")).projects[0]; expect(own.enrollment.status).toBe("active"); expect(own.permissions).toEqual({ service: true, aggregate: false });
 await card.getByRole("button", { name: "撤回授权", exact: true }).click();
 await expect(card.getByText("接受支持服务：未授权")).toBeVisible(); await expect(card.getByText(/已暂停/)).toBeVisible();
 own = (await patient(request, "P-A")).projects[0]; expect(own.enrollment.status).toBe("paused"); expect(own.assignments).toHaveLength(3); expect(own.assignments.every(item => !item.actionable)).toBe(true);
 await card.getByText(/授权历史/).click(); await expect(card.getByText(/服务 · 撤回/)).toBeVisible(); await expect(card.getByText(/汇总 · 撤回/)).toBeVisible();
 expect(await page.locator('a[href="/patient/pro"]').count()).toBeGreaterThan(0); expect(await card.locator('a[href="/patient/pro"]').count()).toBe(0);
});

test("invited P-0040 grants service without automatic activation, then doctor confirms and CM activates", async ({ page, request }) => {
 await page.goto("/patient?patient=P-0040"); const card = page.getByTestId("psp-patient-service");
 await expect(card.getByText("接受支持服务：未授权")).toBeVisible(); await expect(card.getByText(/待加入/)).toBeVisible();
 await card.getByRole("button", { name: "同意授权", exact: true }).first().click(); await expect(card.getByText("接受支持服务：已授权")).toBeVisible();
 let own = (await patient(request, "P-0040")).projects[0]; expect(own.enrollment.status).toBe("invited"); expect(own.assignments).toHaveLength(0);
 await page.goto(deskPath); const member = page.getByTestId("psp-member").filter({ hasText: "P-0040" });
 await expect(member).toBeVisible(); await page.getByRole("combobox", { name: "切换身份" }).selectOption("张医生");
 await expect(member.getByRole("button", { name: "确认适用性", exact: true })).toBeVisible();
 await member.getByRole("textbox").fill("合成演示：医生确认符合本项目适用范围"); await member.getByRole("button", { name: "确认适用性", exact: true }).click();
 await expect(member.getByText(/医生适用性：已确认/)).toBeVisible(); await page.getByRole("combobox", { name: "切换身份" }).selectOption("个案管理师小陈");
 await member.getByRole("textbox").fill("患者已授权服务且医生已确认，激活合成项目服务"); await expect(member.getByRole("button", { name: "激活服务", exact: true })).toBeEnabled(); await member.getByRole("button", { name: "激活服务", exact: true }).click();
 await expect(member.getByText("服务中", { exact: true })).toBeVisible(); own = (await patient(request, "P-0040")).projects[0]; expect(own.enrollment.status).toBe("active"); expect(own.assignments).toHaveLength(3);
 expect(own.assignments.every(item => Date.parse(item.assignedAt) <= Date.parse(item.dueAt) && Date.parse(item.dueAt) > Date.parse("2026-10-13T02:00:00Z"))).toBe(true);
 expect(own.assignments.every(item => item.dueAt.startsWith("2026-11"))).toBe(true);
 const initialMember = (await patient(request, "P-A")).projects[0]; expect(initialMember.assignments.every(item => item.dueAt.startsWith("2026-10"))).toBe(true);
});

test("PSP navigation and project content reflow at 390px without horizontal overflow", async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 900 });
 await page.goto(deskPath); await expect(page.getByTestId("psp-member")).toHaveCount(20);
 const navigation = page.getByRole("navigation", { name: "医生工作台导航" });
 for (const label of ["PSP 服务台", "预警队列", "患者列表", "随访任务", "队列圈选", "候选核查"]) await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 for (const path of ["/pharma/projects", `/pharma/projects/${projectId}`, "/patient?patient=P-A", "/patient/plan?patient=P-A"]) {
  await page.goto(path); await expect(page.getByTestId("mode-badge")).not.toHaveText("…");
  if (path.startsWith("/patient")) await expect(page.getByTestId("psp-patient-service").getByText("接受支持服务：已授权")).toBeVisible();
  else await expect(page.getByText("当前允许汇总人数：14 人")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
 }
});

test("reset restores internal 20/18/14 and protected external 14", async ({ page, request }) => {
 const before = await internal(request); const enr = before.enrollments.find(item => item.patientId === "P-A")!;
 const response = await request.post(`/api/psp/enrollments/${enr.id}/permissions`, { data: { scope: "service", action: "withdraw", meta: { seedVersion: before.seedVersion, expectedVersion: enr.version, clientRequestId: "psp-e2e-reset-withdraw", role: "patient", actorId: "P-A" } } }); expect(response.ok()).toBe(true);
 expect((await internal(request)).counts.activeService).toBe(17);
 expect((await request.post("/api/reset")).ok()).toBe(true); const reset = await internal(request); expect(reset.seedVersion).toBeGreaterThan(before.seedVersion); expect(reset.counts).toEqual({ candidates: 20, activeService: 18, aggregateAllowed: 14 });
 await page.goto(deskPath); await expect(page.getByText("候选名单 20 人 · 当前有效服务 18 人 · 允许汇总 14 人")).toBeVisible();
 await page.goto(`/pharma/projects/${projectId}`); await expect(page.getByText("当前允许汇总人数：14 人")).toBeVisible();
});
