import {openPublicReportBody} from './helpers/pharmaReading';
import { readFileSync } from 'node:fs';
import { test, expect, type Request, type Route } from '@playwright/test';
import type { ChatResponse } from '@/lib/agents/types';
import { AcceptanceApi, PROJECT, json, publicReportUrl } from './helpers/pspAcceptance';

const expected = JSON.parse(readFileSync('data/seed/expected.json', 'utf8')) as { key: string; filter: Record<string, unknown>; expectedCount: number }[];

test('independent clients reset a shared seed while an actual old POST and captured available GET are held', async ({ browser, baseURL, request }, info) => {
  const contexts = await Promise.all([browser.newContext({ baseURL }), browser.newContext({ baseURL })]);
  const a = new AcceptanceApi(contexts[0].request), b = new AcceptanceApi(contexts[1].request);
  let releasePost = () => {}, releaseGet = () => {};
  try {
    await a.reset();
    const { report } = await a.delivered();
    const [pageA, proPage, reportPage] = await Promise.all([contexts[0].newPage(), contexts[1].newPage(), contexts[1].newPage()]);
    await pageA.goto('/patient/plan?patient=P-A');
    await proPage.goto('/patient/plan?patient=P-A');
    await proPage.getByRole('link', { name: '填写项目问卷', exact: true }).click();
    await reportPage.goto(`/pharma/projects/${PROJECT}/reports/${encodeURIComponent(report.id)}`);
    await openPublicReportBody(reportPage);await expect(reportPage.getByTestId('psp-pharma-report-content')).toBeVisible();
    let postCaptured!: () => void, getCaptured!: () => void, getFulfilled!: () => void;
    const getDelivered = new Promise<void>(resolve => { getFulfilled = resolve; });
    let heldGet = false, heldRequest: Request | undefined;
    let getConsumed!: (value: { seedVersion: number; gate: { status: string }; bodyUsed: boolean }) => void;
    const browserConsumed = new Promise<{ seedVersion: number; gate: { status: string }; bodyUsed: boolean }>(resolve => { getConsumed = resolve; });
    await reportPage.exposeFunction('task12LateGetConsumed', getConsumed);
    // Observe the application's real JSON parse without replacing the fetch or its response.
    await reportPage.evaluate(pathname => {
      const originalJson = Response.prototype.json;
      let observed = false;
      Response.prototype.json = function (this: Response) {
        return originalJson.call(this).then(body => {
          if (!observed && new URL(this.url).pathname === pathname) {
            observed = true;
            void (window as typeof window & { task12LateGetConsumed: (value: unknown) => Promise<void> }).task12LateGetConsumed({ seedVersion: body.seedVersion, gate: body.gate, bodyUsed: this.bodyUsed });
          }
          return body;
        });
      };
    }, publicReportUrl(report.id));
    const postSeen = new Promise<void>(resolve => { postCaptured = resolve; });
    const getSeen = new Promise<void>(resolve => { getCaptured = resolve; });
    const postHeld = new Promise<void>(resolve => { releasePost = resolve; });
    const getHeld = new Promise<void>(resolve => { releaseGet = resolve; });
    const network: { url: string; body?: unknown; status?: number; seedVersion?: number }[] = [];
    await proPage.route('**/api/psp/assignments/*/pro', async route => {
      const body = route.request().postDataJSON(); network.push({ url: route.request().url(), body });
      postCaptured(); await postHeld;
      const response = await route.fetch(); network[0].status = response.status();
      expect(response.status()).toBe(409); expect(await response.json()).toMatchObject({ code: 'stale_seed' });
      await route.fulfill({ response });
    });
    await reportPage.route(`**${publicReportUrl(report.id)}?*`, async (route: Route) => {
      if (heldGet) { await route.continue(); return; }
      heldGet = true; heldRequest = route.request();
      const response = await route.fetch(), body = await response.json();
      expect(body.gate.status).toBe('available');
      network.push({ url: route.request().url(), status: response.status(), seedVersion: body.seedVersion });
      getCaptured(); await getHeld; await route.fulfill({ response, body: JSON.stringify(body) }); getFulfilled();
    });
    await proPage.getByLabel('关节痛', { exact: true }).fill('3');
    await proPage.getByTestId('submit-project-pro').click(); await postSeen;
    await reportPage.getByRole('button', { name: '刷新当前报告内容', exact: true }).click(); await getSeen;
    const oldSeed = (await b.internal()).seedVersion;
    await a.reset();
    const freshA = await a.internal(), freshB = await b.internal();
    expect(freshA).toEqual(freshB); expect(freshA.seedVersion).toBeGreaterThan(oldSeed);
    expect(freshA.counts).toEqual({ candidates: 20, activeService: 18, aggregateAllowed: 14 });
    await pageA.reload();
    await reportPage.getByRole('button', { name: '刷新交付报告', exact: true }).click();
    await expect(reportPage.getByText('当前没有可访问的此报告，请返回项目概览选择已交付版本。', { exact: true })).toBeVisible();
    const before = { state: await a.state(), services: await a.services(), reports: await a.reports(), pharma: await a.pharma() };
    const browserRequestFinished = reportPage.waitForEvent('requestfinished', { predicate: request => request === heldRequest });
    releasePost(); releaseGet();
    await expect.poll(() => network[0].status).toBe(409);
    await getDelivered;
    const completedRequest = await browserRequestFinished;
    const receivedResponse = await completedRequest.response();
    expect(receivedResponse?.status()).toBe(200);
    expect(await receivedResponse!.finished()).toBeNull();
    expect(await browserConsumed).toMatchObject({ seedVersion: oldSeed, gate: { status: 'available' }, bodyUsed: true });
    // The parse continuation and any React commit must run before checking absence.
    await reportPage.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(proPage.getByRole('button', { name: '重试同一次操作', exact: true })).toHaveCount(0);
    await expect(reportPage.getByTestId('psp-pharma-report-content')).toHaveCount(0);
    await expect(reportPage.getByRole('link', { name: /下载固定/ })).toHaveCount(0);
    await expect(reportPage.getByRole('button', { name: '重试同一次操作', exact: true })).toHaveCount(0);
    expect({ state: await b.state(), services: await b.services(), reports: await b.reports(), pharma: await b.pharma() }).toEqual(before);
    expect((await b.patient()).seedVersion).toBe(freshA.seedVersion);
    await info.attach('shared-reset-network', { body: JSON.stringify({ oldSeed, freshSeed: freshA.seedVersion, network }, null, 2), contentType: 'application/json' });
    await reportPage.screenshot({ path: info.outputPath('reset-late-get-retired.png') });
  } finally {
    releasePost(); releaseGet(); await Promise.all(contexts.map(context => context.close()));
    await a.attach(info); await new AcceptanceApi(request).reset();
  }
});

test('three explicit API-fixture dirty PSP and clinical rounds restore original plans, reports, receipts and authorization', async ({ browser, baseURL, request }, info) => {
  // Three full dirty/freeze/approve/deliver/withdraw/reset chains plus stale replays; budget covers local Worker persistence, not a product SLA.
  test.setTimeout(240_000);
  const api = new AcceptanceApi(request), observer = await browser.newContext({ baseURL });
  try {
    await api.reset();
    const initialService = await api.services(), initialPatient = await api.read('/api/patients/P-A');
    const initialPharma = await api.pharma();
    let previousSeed = initialService.seedVersion;
    for (let round = 1; round <= 3; round++) {
      const start = api.commands.length;
      const dirty = await api.dirtyServices();
      expect(dirty.services.alerts).toHaveLength(2);
      expect(dirty.services.contacts.filter(c => !c.background)).toHaveLength(1);
      expect(dirty.services.assignments.find(a => a.id === dirty.assignment.id)?.status).toBe('completed');
      expect(dirty.services.assignments.find(a => a.id === dirty.contact.id)?.status).toBe('completed');
      const { report } = await api.delivered();
      expect((await api.external(report)).gate.status).toBe('available');
      await api.withdraw();
      expect((await api.pharma()).authorizationVersion).toBeGreaterThan(initialPharma.authorizationVersion);
      expect((await api.external(report)).gate.status).toBe('revoked');
      const receipts = api.commands.slice(start);
      await api.reset();
      const internal = await api.internal(), observed = await new AcceptanceApi(observer.request).internal();
      expect(observed).toEqual(internal); expect(internal.seedVersion).toBeGreaterThan(previousSeed); previousSeed = internal.seedVersion;
      expect(internal.counts).toEqual({ candidates: 20, activeService: 18, aggregateAllowed: 14 });
      const restored = await api.services();
      expect({ ...restored, seedVersion: initialService.seedVersion }).toEqual(initialService);
      expect({ ...await api.read<Record<string, unknown>>('/api/patients/P-A'), seedVersion: initialService.seedVersion }).toEqual(initialPatient);
      const state = await api.state();
      for (const key of ['alerts', 'cohorts', 'snapshots', 'candidateRequests', 'gapTasks', 'tasks'] as const) expect(state[key], `round ${round} clinical ${key}`).toEqual([]);
      expect((await api.reports()).summaries).toEqual([]); expect((await api.snapshots()).summaries).toEqual([]);
      const pharma = await api.pharma();
      expect(pharma).toMatchObject({ seedVersion: internal.seedVersion, authorizationVersion: initialPharma.authorizationVersion, reports: [], allowedMembers: { status: 'available', value: 14 } });
      for (const receipt of receipts) {
        const replay = await request.post(receipt.url, { data: receipt.body });
        expect(replay.status(), receipt.url).toBe(409);
        expect(await replay.json()).toMatchObject({ code: 'stale_seed' });
      }
      const query = api.publicQuery(report, initialPharma.authorizationVersion);
      for (const suffix of ['', '/download']) {
        const response = await request.get(`${publicReportUrl(report.id)}${suffix}?${query}&format=text`);
        expect(response.ok()).toBe(false);
      }
      expect((await api.reports()).ledgerRevision).toBe((await api.snapshots()).ledgerRevision);
      expect((await api.services()).contacts).toEqual(initialService.contacts);
    }
  } finally { await api.attach(info, 'three-round-api-fixture-commands'); await observer.close(); await api.reset(); }
});

test('all five original cohort groups agree across actual UI filters, CSV, preview and submitted filters', async ({ page, request }, info) => {
  const api = new AcceptanceApi(request); await api.reset();
  const selectors = [ ['f-hrpos', 'f-evermet', 'f-cdk46'], ['f-hrpos', 'f-stage-early_adjuvant', 'f-cur-endocrine'], ['f-her2-positive'], ['f-stage-metastatic', 'f-cur-adc'], ['f-stage-survivorship'] ];
  const evidence: unknown[] = [];
  try {
    const state = await api.state();
    expect(state.manifest).toMatchObject({ version: 'gen-v4', checksum: 'cc3217fe1d251f10', cutoff: '2026-10-13' }); expect(state.patientCount).toBe(2012);
    for (const [index, group] of expected.entries()) {
      await page.goto('/clinic/cohorts');
      await expect(page.getByTestId('cohort-count')).toHaveAttribute('data-pending', 'false');
      for (const id of selectors[index]) await page.getByTestId(id).check();
      await expect(page.getByTestId('cohort-count')).toHaveAttribute('data-pending', 'false');
      await expect(page.getByTestId('cohort-count')).toHaveText(String(group.expectedCount));
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('cohort-export').click()]);
      const csv = readFileSync((await download.path())!, 'utf8').replace(/^\uFEFF/, '');
      expect(csv.split(/\r?\n/).filter(Boolean).length - 1).toBe(group.expectedCount);
      const preview = await request.post('/api/cohorts/preview', { data: { filter: group.filter } }).then(json<{ count: number }>);
      expect(preview.count).toBe(group.expectedCount);
      await page.getByTestId('cohort-name').fill(`Task12 ${group.key}`);
      const pending = page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/api/cohorts');
      await page.getByTestId('cohort-submit').click(); const submitted = (await pending).postDataJSON();
      await expect(page.getByTestId('cohort-submitted')).toBeVisible(); expect(submitted.filter).toEqual(group.filter);
      evidence.push({ group, submitted, preview, csvRows: group.expectedCount });
    }
    await page.screenshot({ path: info.outputPath('five-cohort-groups.png') });
    await info.attach('five-cohort-requests', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  } finally { await api.reset(); }
});

test('actual no-key agent replies enforce medication, emergency and research causality boundaries with honest mode fields', async ({ page, request }, info) => {
  const api = new AcceptanceApi(request); await api.reset();
  const responses: { body: unknown; result: ChatResponse }[] = [];
  try {
    // Browser fetch reaches the real server; no response is fabricated by routing.
    await page.goto('/patient/assistant?patient=P-A');
    for (const [agent, question, match] of [
      ['patient', '我能自己停药或减量吗？', /请不要自行停药、减量/],
      ['patient', '今天发热38.5度并且呼吸困难', /急诊/],
      ['research', '两组治疗的PFS和生存获益能证明疗效更好吗？', /当前快照数据不支持回答该问题[：:].*不提供疗效或生存结论/],
    ] as const) {
      const body = { agent, messages: [{ role: 'user', content: question }], context: { patientId: agent === 'patient' ? 'P-A' : undefined, page: agent === 'patient' ? 'assistant' : 'feasibility' } };
      const response = await page.evaluate(async body => { const r = await fetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, result: await r.json() }; }, body);
      expect(response.status).toBe(200); const result = response.result as ChatResponse;
      expect(result.mode).toBe('deterministic'); expect(result.guarded).toBeUndefined(); expect(result.degraded).toBeUndefined(); expect(result.detail).toBeUndefined();
      expect(result.text).toMatch(match); expect(agent === 'research' ? JSON.stringify(result) : result.text).not.toMatch(/P-A|P-B|ENR-01/);
      if (question.includes('停药')) expect(result.text).toContain('是否需要调整用药，必须由医生确认');
      if (question.includes('呼吸困难')) { expect(result.text).toContain('021-0000-0000'); expect(result.toolCalls).toEqual([]); }
      responses.push({ body, result });
    }
    expect((await api.state()).agentMode).toBe('deterministic');
    // Report templates, approval and delivery have no browser agent request.
    const agentRequests: string[] = []; page.on('request', r => { if (new URL(r.url()).pathname === '/api/agent') agentRequests.push(r.url()); });
    const { report } = await api.delivered();
    await page.goto(`/governance/projects/${PROJECT}/reports`);
    await page.getByLabel('选择报告版本').selectOption(report.id);
    await expect(page.getByTestId('psp-report-content')).toBeVisible(); expect(agentRequests).toEqual([]);
    expect((await api.reports()).summaries).toHaveLength(1); expect((await api.snapshots()).summaries).toHaveLength(1);
    await info.attach('real-no-key-agent-responses', { body: JSON.stringify(responses, null, 2), contentType: 'application/json' });
    await api.attach(info);
  } finally { await api.reset(); }
});
