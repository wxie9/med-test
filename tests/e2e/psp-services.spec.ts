import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { PatientServiceView } from '@/lib/psp/serviceView';
import type { PatientProjectsView } from '@/lib/psp/views';
const PROJECT = 'PSP-BC-ENDO-001';
async function services(request: APIRequestContext, patientId = 'P-A', doctor = false) {
 const role = doctor ? 'doctor' : 'case_manager', actorId = doctor ? 'doctor-zhang' : 'case-manager-chen';
 const response = await request.get(`/api/psp/projects/${PROJECT}/services?patientId=${patientId}&role=${role}&actorId=${actorId}`); expect(response.ok()).toBe(true); return await response.json() as PatientServiceView;
}
async function projects(request: APIRequestContext) { return await (await request.get('/api/psp/patients/P-A/projects?role=patient&actorId=P-A')).json() as PatientProjectsView; }
async function createAlerts(page: Page) {
 await page.goto('/patient/plan?patient=P-A'); await page.getByRole('link', { name: '填写项目问卷', exact: true }).click();
 await page.getByLabel('关节痛', { exact: true }).fill('3'); await page.getByTestId('missed-doses').fill('4'); await page.getByTestId('stop-intent').check(); await page.getByTestId('submit-project-pro').click(); await expect(page.getByTestId('project-pro-feedback')).toBeVisible();
}
async function clinic(page: Page) { await page.goto('/clinic/patients/P-A'); await expect(page.getByTestId('psp-service-workflow').getByText(/当前患者：/)).toBeVisible(); }
async function caseManager(page: Page) { await page.getByLabel('切换身份').selectOption('个案管理师小陈'); }
async function doctor(page: Page) { await page.getByLabel('切换身份').selectOption('张医生'); }
async function readEducation(request: APIRequestContext, assignmentId: string) { const response = await request.get(`/api/psp/education/${encodeURIComponent(assignmentId)}?role=patient&actorId=P-A`); expect(response.ok()).toBe(true); return await response.json(); }
test.beforeEach(async ({ request }) => { expect((await request.post('/api/reset')).ok()).toBe(true); });
test.afterAll(async ({ request }) => { await request.post('/api/reset'); });
test('two project alerts share one phone, retain own dispositions and doctor reviews, and education help schedules future care', async ({ page, request }, testInfo) => {
 await createAlerts(page); const initial = await services(request); expect(initial.alerts).toHaveLength(2); const originalPlan = initial.assignments.find(a => a.kind === 'contact' && a.status === 'open')!;
 await clinic(page); await caseManager(page); const workflow = page.getByTestId('psp-service-workflow');
 for (const alert of initial.alerts) { const row = page.getByTestId(`psp-alert-${alert.id}`); await row.getByRole('button', { name: '接单', exact: true }).click(); await row.getByRole('button', { name: '开始处置', exact: true }).click(); await expect(row.getByRole('button', { name: '提交本预警复核' })).toBeVisible(); }
 for (const alert of initial.alerts) await workflow.getByLabel(`联系覆盖：${alert.kind === 'symptom' ? '症状' : '依从性'} · ${alert.rule}`).check();
 await workflow.getByLabel('联系结果', { exact: true }).selectOption('no_answer'); await workflow.getByRole('button', { name: '记录本次联系' }).click(); await expect(workflow.getByText('实际联系 1 次，按联系事实计数。')).toBeVisible();
 const missed = await services(request); expect(missed.assignments.find(a => a.id === originalPlan.id)?.status).toBe('open'); expect(missed.alerts.every(a => a.status === 'in_progress' && !a.doctorReview)).toBe(true);
 await workflow.getByLabel('联系结果', { exact: true }).selectOption('reached'); await workflow.getByRole('button', { name: '记录本次联系' }).click(); await expect(workflow.getByText('实际联系 2 次，按联系事实计数。')).toBeVisible();
 const reached = await services(request); const call = reached.contacts.find(c => !c.background && c.outcome === 'reached')!; expect(call.alertIds).toHaveLength(2); expect(reached.assignments.find(a => a.id === originalPlan.id)?.status).toBe('completed');
 for (const alert of initial.alerts) { const row = page.getByTestId(`psp-alert-${alert.id}`); await row.getByLabel('处置类别', { exact: true }).selectOption('contacted'); await row.getByLabel('处置摘要').fill('已完成合成电话沟通，提交医生复核。'); await row.getByLabel(/复核引用联系：.*已接通/).check(); await row.getByRole('button', { name: '提交本预警复核' }).click(); await expect(row.getByText('待复核', { exact: true })).toBeVisible(); }
 const reviewed = await services(request); expect(reviewed.alerts.every(a => a.disposition?.interactionIds.join(',') === call.interactionId && a.doctorReview === null)).toBe(true);
 await doctor(page); const future = '2026-10-14T10:30';
 for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 1100 }); await expect(page.getByLabel('医生复核意见').first()).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); await page.screenshot({ path: testInfo.outputPath(`psp-doctor-review-${width}.png`), fullPage: true }); }
 for (const alert of initial.alerts) { const row = page.getByTestId(`psp-alert-${alert.id}`); await row.getByLabel('医生复核意见').fill('合成演示复核：安排未来复评。'); await row.getByLabel('未来复评时间（上海时间）').fill(future); await row.getByLabel('未来任务责任人').fill('张医生'); await row.getByRole('button', { name: '确认复核并关闭本预警' }).click(); await expect(row.getByText('已关闭', { exact: true })).toBeVisible(); }
 const closed = await services(request, 'P-A', true); expect(closed.alerts.every(a => a.doctorReview && a.status === 'closed')).toBe(true);
 const clinical = await (await request.get('/api/patients/P-A')).json(); const futureIds = closed.alerts.map(a => a.doctorReview!.followupTaskId); expect(clinical.tasks.filter((t: { id: string; status: string }) => futureIds.includes(t.id)).map((t: { status: string }) => t.status)).toEqual(['open', 'open']);
 await caseManager(page); const education = closed.education.find(e => !e.sentAt)!; const card = page.getByTestId(`psp-education-${education.assignmentId}`); await card.getByRole('button', { name: '发送教育资料' }).click(); await expect(card.getByText(/尚未确认阅读/)).toBeVisible();
 const sent = await readEducation(request, education.assignmentId); expect(sent.result.openedAt).toBeNull(); expect(sent.result.feedbackAt).toBeNull();
 await page.goto(`/patient/education/${encodeURIComponent(education.assignmentId)}?patient=P-A`); await expect(page.getByRole('button', { name: '我已阅读', exact: true })).toBeVisible(); expect((await readEducation(request, education.assignmentId)).result.openedAt).toBeNull();
 await page.getByRole('button', { name: '我已阅读', exact: true }).click();
 await page.setViewportSize({ width: 390, height: 1100 }); await expect(page.getByLabel('我已理解', { exact: true })).toBeVisible(); await page.screenshot({ path: testInfo.outputPath('psp-patient-reading-feedback-390.png'), fullPage: true });
 await page.getByLabel('我已理解', { exact: true }).check(); await page.getByLabel('仍需服务团队帮助', { exact: true }).check(); await page.getByRole('button', { name: '提交阅读反馈' }).click(); await expect(page.getByTestId('education-feedback-saved')).toContainText('仍需帮助');
 const final = await services(request); expect(final.education.find(e => e.assignmentId === education.assignmentId)).toMatchObject({ understood: true, needsHelp: true, status: 'completed', background: false }); expect(final.assignments.some(a => a.title === '教育反馈联系跟进' && a.status === 'open' && Date.parse(a.dueAt) > Date.parse(final.serverNow))).toBe(true);
 const afterClinical = await (await request.get('/api/patients/P-A')).json(); expect(afterClinical.tasks.filter((t: { id: string }) => futureIds.includes(t.id)).every((t: { status: string }) => t.status === 'open')).toBe(true);
 await page.goto('/patient/messages?patient=P-A'); await expect(page.getByTestId('psp-message-education').getByRole('link', { name: '阅读教育资料' })).toBeVisible();
 for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 1100 }); await clinic(page); await doctor(page); await expect(page.getByTestId('psp-service-workflow')).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); await page.screenshot({ path: testInfo.outputPath(`psp-service-completed-${width}.png`), fullPage: true }); }
 await page.goto(`/governance/projects/${PROJECT}/snapshots`); await page.getByRole('button', { name: '冻结阶段服务快照', exact: true }).click(); await expect(page.getByRole('heading', { name: '已冻结版本（1）', exact: true })).toBeVisible();
 const frozenList = await (await request.get(`/api/psp/projects/${PROJECT}/snapshots?role=project_manager&actorId=project-manager-psp`)).json(); const frozenId = frozenList.summaries[0].id; await page.getByLabel('选择冻结版本').selectOption(frozenId); await expect(page.getByTestId('psp-snapshot-detail')).toBeVisible();
 const frozen = (await (await request.get(`/api/psp/snapshots/${encodeURIComponent(frozenId)}?role=project_manager&actorId=project-manager-psp&seedVersion=${final.seedVersion}`)).json()).snapshot;
 expect(frozen.sources.filter((s: { kind: string; value: { assignedSequence?: number } }) => s.kind === 'assignment' && s.value.assignedSequence !== undefined)).toHaveLength(3);
 await page.getByRole('button', { name: '查看本期预警医生复核完成率口径与来源', exact: true }).click(); await page.getByText('资格与内容支持来源', { exact: true }).click(); const frozenEvidence = page.getByTestId('psp-metric-evidence'); await expect(frozenEvidence.getByText('提交时的处置记录', { exact: true })).toHaveCount(2); await expect(frozenEvidence.getByText('已完成合成电话沟通，提交医生复核。', { exact: true })).toHaveCount(2);
 await frozenEvidence.screenshot({ path: testInfo.outputPath('psp-frozen-doctor-dispositions.png') });
});
test('contact 503 retry keeps exact request while 409 refresh and reset never replay a new operation automatically', async ({ page, request }) => {
 await createAlerts(page); await clinic(page); const workflow = page.getByTestId('psp-service-workflow'); const captured: string[] = [];
 await page.route('**/api/psp/projects/*/interactions', async route => { captured.push(route.request().postData()!); if (captured.length === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); else await route.continue(); });
 await workflow.getByRole('button', { name: '记录本次联系' }).click(); await expect(workflow.getByRole('button', { name: '重试同一次操作' })).toBeVisible(); await expect(workflow.getByLabel('联系结果', { exact: true })).toBeDisabled();
 await workflow.getByRole('button', { name: '重试同一次操作' }).click(); await expect(workflow.getByText('实际联系 1 次，按联系事实计数。')).toBeVisible(); expect(captured[1]).toBe(captured[0]);
 await page.unroute('**/api/psp/projects/*/interactions'); await page.route('**/api/psp/projects/*/interactions', route => route.fulfill({ status: 409, contentType: 'application/json', body: '{}' }));
 const before = await services(request); await workflow.getByLabel(/联系覆盖：/).first().check(); await workflow.getByRole('button', { name: '记录本次联系' }).click(); await expect(workflow.getByText(/状态已变化/)).toBeVisible(); expect((await services(request)).contacts.length).toBe(before.contacts.length);
 await request.post('/api/reset'); await workflow.getByRole('button', { name: '刷新服务状态' }).click(); await expect(workflow.getByText('实际联系 0 次，按联系事实计数。')).toBeVisible(); await expect(workflow.getByRole('button', { name: '重试同一次操作' })).toHaveCount(0);
});
test('patient/role boundaries reject writes and a revoked sent assignment remains read-only', async ({ page, request }) => {
 const view = await services(request); const education = view.education.find(e => !e.sentAt)!; const content = view.approvedContents[0];
 const base = { seedVersion: view.seedVersion, expectedVersion: education.version, clientRequestId: 'education-send-boundary' };
 const forbidden = await request.post(`/api/psp/education/${education.assignmentId}`, { data: { action: 'send', contentVersionId: content.id, meta: { ...base, role: 'patient', actorId: 'P-A' } } }); expect(forbidden.status()).toBe(403);
 const sent = await request.post(`/api/psp/education/${education.assignmentId}`, { data: { action: 'send', contentVersionId: content.id, meta: { ...base, role: 'case_manager', actorId: 'case-manager-chen' } } }); expect(sent.ok()).toBe(true);
 const sentView = await readEducation(request, education.assignmentId);
 expect((await request.post(`/api/psp/education/${education.assignmentId}`, { data: { action: 'feedback', understood: true, needsHelp: false, meta: { ...base, expectedVersion: sentView.assignment.version, clientRequestId: 'feedback-before-open', role: 'patient', actorId: 'P-A' } } })).status()).toBe(409);
 expect((await request.post(`/api/psp/education/${education.assignmentId}`, { data: { action: 'feedback', understood: 'yes', needsHelp: false, meta: { ...base, expectedVersion: sentView.assignment.version, clientRequestId: 'malformed-feedback', role: 'patient', actorId: 'P-A' } } })).status()).toBe(400);
 expect((await request.get(`/api/psp/education/${education.assignmentId}?role=patient&actorId=P-B`)).status()).toBe(403);
 await page.goto(`/patient/education/${education.assignmentId}?patient=P-B`); await expect(page.getByText(/资料无法加载/)).toBeVisible(); await expect(page.getByRole('button', { name: '我已阅读' })).toHaveCount(0);
 const current = await projects(request), enrollment = current.projects[0].enrollment;
 expect((await request.post(`/api/psp/enrollments/${enrollment.id}/permissions`, { data: { scope: 'service', action: 'withdraw', meta: { seedVersion: current.seedVersion, expectedVersion: enrollment.version, clientRequestId: 'education-withdraw-boundary', role: 'patient', actorId: 'P-A' } } })).ok()).toBe(true);
 await page.goto(`/patient/education/${education.assignmentId}?patient=P-A`); await expect(page.getByText(/历史资料只读/)).toBeVisible(); await expect(page.getByRole('button', { name: '我已阅读' })).toHaveCount(0); const result = await readEducation(request, education.assignmentId); expect(result.result.openedAt).toBeNull(); expect(result.canFeedback).toBe(false);
});

test('a delayed write cannot expose retries or contact facts after switching clinical identity', async ({ page, request }) => {
 await clinic(page); let release!: () => void, started!: () => void; const blocked = new Promise<void>(resolve => { release = resolve; }); const intercepted = new Promise<void>(resolve => { started = resolve; });
 await page.route('**/api/psp/projects/*/interactions', async route => { started(); await blocked; await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); });
 const workflow = page.getByTestId('psp-service-workflow'); await workflow.getByRole('button', { name: '记录本次联系' }).click(); await intercepted;
 await doctor(page); await expect(workflow.getByText('模拟身份：张医生 · 合成数据服务演示')).toBeVisible(); await expect(workflow.getByText(/当前患者：/)).toBeVisible(); release();
 await expect(workflow.getByRole('button', { name: '重试同一次操作' })).toHaveCount(0); await expect(workflow.getByRole('button', { name: '记录本次联系' })).toHaveCount(0); await expect(workflow).not.toContainText('503'); expect((await services(request)).contacts.filter(c => !c.background)).toHaveLength(0);
});
