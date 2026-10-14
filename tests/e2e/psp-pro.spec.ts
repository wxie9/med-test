import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { PatientProjectsView } from '@/lib/psp/views';
async function own(request: APIRequestContext, id = 'P-A') { const response = await request.get(`/api/psp/patients/${id}/projects?role=patient&actorId=${id}`); expect(response.ok()).toBe(true); return await response.json() as PatientProjectsView; }
async function openForm(page: Page) { await page.goto('/patient/plan?patient=P-A'); await page.getByRole('link', { name: '填写项目问卷', exact: true }).click(); await expect(page.getByTestId('submit-project-pro')).toBeVisible(); }
async function fill(page: Page) { await page.getByLabel('关节痛', { exact: true }).fill('3'); for (const symptom of ['潮热', '情绪', '睡眠']) await page.getByLabel(symptom, { exact: true }).fill('1'); await page.getByTestId('missed-doses').fill('4'); await page.getByTestId('stop-intent').check(); }
test.beforeEach(async ({ request }) => { expect((await request.post('/api/reset')).ok()).toBe(true); });
test.afterAll(async ({ request }) => { await request.post('/api/reset'); });
test('PA fixed project plan submits late, shows same-screen receipt, and explicitly revises without completing twice', async ({ page, request }) => {
 const before = await own(request); const planned = before.projects[0].assignments.find(a => a.kind === 'questionnaire')!;
 await openForm(page); await expect(page.getByText(before.projects[0].project.title, { exact: true })).toBeVisible();
 await expect(page.getByText(`当前患者：${before.displayName} · P-A`, { exact: true })).toBeVisible(); await expect(page.getByText(/固定截止：2026\/10\/13 09:00:00/)).toBeVisible();
 await fill(page); await page.getByTestId('submit-project-pro').click(); await expect(page.getByTestId('project-pro-feedback')).toContainText('2'); await expect(page.getByTestId('project-pro-feedback')).not.toContainText('1 个工作日');
 await expect(page.getByTestId('project-pro-completion')).toContainText('已完成 · 迟交'); await expect(page.getByTestId('project-pro-feedback')).toBeVisible();
 const first = (await own(request)).projects[0].assignments.find(a => a.id === planned.id)!;
 expect(first.status).toBe('completed'); expect(Date.parse(first.firstValidSubmittedAt!)).toBe(Date.parse('2026-10-13T10:00:00+08:00')); expect(first.dueAt).toBe(planned.dueAt);
 const clinicalBefore = await (await request.get('/api/patients/P-A')).json(); const responseBefore = clinicalBefore.patient.pro.find((item: { id: string }) => item.id === first.latestValidResponseId); expect(responseBefore.items['关节痛']).toBe(3);
 await page.getByRole('link', { name: '修订项目问卷', exact: true }).click(); await expect(page.getByText(/修订上次项目答卷/)).toBeVisible(); await expect(page.getByLabel('关节痛', { exact: true })).toHaveValue('3');
 await page.getByLabel('关节痛', { exact: true }).fill('2'); await page.getByTestId('submit-project-pro').click(); await expect(page.getByTestId('project-pro-feedback')).toBeVisible();
 const revised = (await own(request)).projects[0].assignments.find(a => a.id === planned.id)!; expect(revised.latestValidResponseId).not.toBe(first.latestValidResponseId); expect(revised.firstValidSubmittedAt).toBe(first.firstValidSubmittedAt); expect(revised.dueAt).toBe(first.dueAt); expect(revised.version).toBe(first.version + 1);
 const clinicalAfter = await (await request.get('/api/patients/P-A')).json(); expect(clinicalAfter.patient.pro.length).toBe(clinicalBefore.patient.pro.length + 1);
 await page.goto('/patient/plan?patient=P-A'); await expect(page.getByTestId('psp-patient-service').getByText(/已完成 · 迟交/)).toBeVisible(); expect(await page.getByTestId('psp-patient-service').getByRole('link', { name: '填写项目问卷' }).count()).toBe(0);
});
test('503 retry uses exact body and id while form edits are locked', async ({ page }) => {
 const bodies: string[] = []; let attempts = 0;
 await page.route('**/api/psp/assignments/*/pro', async route => { bodies.push(route.request().postData()!); if (++attempts === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); else await route.continue(); });
 await openForm(page); await fill(page); await page.getByTestId('submit-project-pro').click(); await expect(page.getByRole('button', { name: '重试同一次提交' })).toBeVisible(); await expect(page.getByLabel('关节痛', { exact: true })).toBeDisabled(); await expect(page.getByTestId('submit-project-pro')).toBeDisabled();
 await page.getByRole('button', { name: '重试同一次提交' }).click(); await expect(page.getByTestId('project-pro-feedback')).toBeVisible(); expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
});
test('409 refresh requires review and seed reset discards captured answers', async ({ page, request }) => {
 let attempts = 0; await page.route('**/api/psp/assignments/*/pro', async route => { attempts++; if (attempts === 1) await route.fulfill({ status: 409, contentType: 'application/json', body: '{}' }); else await route.continue(); });
 await openForm(page); await fill(page); await page.getByTestId('submit-project-pro').click(); await expect(page.getByRole('button', { name: '已核对当前计划，继续填写' })).toBeVisible(); expect(attempts).toBe(1); await expect(page.getByTestId('submit-project-pro')).toBeDisabled();
 await page.getByRole('button', { name: '已核对当前计划，继续填写' }).click(); await expect(page.getByTestId('submit-project-pro')).toBeEnabled(); expect(attempts).toBe(1);
 await request.post('/api/reset'); await page.getByRole('button', { name: '刷新计划' }).click(); await expect(page.getByLabel('关节痛', { exact: true })).toHaveValue('0'); await expect(page.getByTestId('stop-intent')).not.toBeChecked();
});
test('cross-patient and malformed assignment never fall back to generic questionnaire, and service withdrawal removes entry', async ({ page, request }) => {
 const before = await own(request); const assignment = before.projects[0].assignments.find(a => a.kind === 'questionnaire')!;
 await page.goto(`/patient/pro?patient=P-B&assignment=${encodeURIComponent(assignment.id)}`); await expect(page.locator('p[role=alert]')).toContainText('当前患者的计划中不存在'); await expect(page.getByTestId('submit-pro')).toHaveCount(0); await expect(page.getByTestId('submit-project-pro')).toHaveCount(0);
 await page.goto('/patient/pro?patient=P-A&assignment='); await expect(page.locator('p[role=alert]')).toContainText('当前患者的计划中不存在'); await expect(page.getByTestId('submit-pro')).toHaveCount(0);
 const item = before.projects[0]; const response = await request.post(`/api/psp/enrollments/${item.enrollment.id}/permissions`, { data: { scope: 'service', action: 'withdraw', meta: { seedVersion: before.seedVersion, expectedVersion: item.enrollment.version, clientRequestId: 'psp-pro-e2e-withdraw', actorId: 'P-A', role: 'patient' } } }); expect(response.ok()).toBe(true);
 await page.goto('/patient/plan?patient=P-A'); await expect(page.getByTestId('psp-patient-service').getByText('接受支持服务：未授权')).toBeVisible(); await expect(page.getByRole('link', { name: '填写项目问卷' })).toHaveCount(0);
 await page.goto(`/patient/pro?patient=P-A&assignment=${encodeURIComponent(assignment.id)}`); await expect(page.getByText(/当前项目服务未激活或未授权/)).toBeVisible(); await expect(page.getByTestId('submit-project-pro')).toHaveCount(0);
 await page.goto('/patient/pro?patient=P-A'); await expect(page.getByTestId('submit-pro')).toBeVisible();
});
test('deferred project response cannot appear after switching patient', async ({ page }) => {
 let release!: () => void; const blocked = new Promise<void>(resolve => { release = resolve; }); let started!: () => void; const posted = new Promise<void>(resolve => { started = resolve; });
 await page.route('**/api/psp/assignments/*/pro', async route => { started(); await blocked; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); });
 await openForm(page); await page.getByTestId('submit-project-pro').click(); await posted; await page.getByRole('button', { name: '患者 B（李女士）', exact: true }).click(); await expect(page.locator('p[role=alert]')).toContainText('当前患者的计划中不存在'); release();
 await expect(page.getByRole('button', { name: '重试同一次提交' })).toHaveCount(0); await expect(page.getByTestId('project-pro-feedback')).toHaveCount(0); await expect(page.locator('p[role=alert]')).not.toContainText('503');
});
test('390px and 1440px project form keeps labeled keyboard controls, deadlines and readonly service plans visible', async ({ page }, testInfo) => {
 for (const width of [390, 1440]) {
  await page.setViewportSize({ width, height: 1100 }); await openForm(page); await expect(page.getByLabel('关节痛', { exact: true })).toBeVisible(); await expect(page.getByText(/固定截止：/)).toBeVisible();
  await page.getByLabel('关节痛', { exact: true }).focus(); await page.keyboard.press('ArrowRight'); await expect(page.getByLabel('关节痛', { exact: true })).toHaveValue('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: testInfo.outputPath(`project-pro-${width}.png`), fullPage: true });
  await page.goto('/patient/plan?patient=P-A');
  await expect(page.getByText('待服务团队联系', { exact: true })).toBeVisible();
  await expect(page.getByText('待发送教育资料', { exact: true })).toBeVisible();
 }
});
