import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { AcceptanceApi, PROJECT, publicReportUrl, publicUrl } from './helpers/pspAcceptance';

/** Only the private loopback launcher owns this control channel; the app has no test endpoint. */
test('owned Wrangler stop/restart preserves exact frozen facts, dual approval, delivery, command receipts and file bytes', async ({ request, page }, info) => {
  test.skip(info.project.metadata.backend !== 'worker', 'Requires the owned Wrangler runtime and durable local persistence');
  test.setTimeout(180_000);
  const api = new AcceptanceApi(request);
  await api.reset();
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const clinical = () => api.read('/api/state?include=patients');
  const pages = ['/', '/patient/plan?patient=P-A', `/clinic/projects/${PROJECT}/services`, `/governance/projects/${PROJECT}/reports`, `/pharma/projects/${PROJECT}`];
  async function ssrReadOnly() {
    const before = { clinical: digest(await clinical()), reports: await api.reports(), snapshots: await api.snapshots(), internal: await api.internal(), pharma: await api.pharma() };
    for (const path of pages) { const response = await request.get(path); expect(response.ok(), path).toBe(true); expect(response.headers()['content-type']).toContain('text/html'); }
    expect({ clinical: digest(await clinical()), reports: await api.reports(), snapshots: await api.snapshots(), internal: await api.internal(), pharma: await api.pharma() }).toEqual(before);
  }
  await ssrReadOnly();
  const dirty = await api.dirtyServices();
  expect(dirty.services.contacts.filter(c => !c.background)).toHaveLength(1);
  const clinicalPatient = await api.read<{ seedVersion: number; patient: { pro: { id: string }[] }; alerts: { id: string }[] }>('/api/patients/P-A');
  const completed = dirty.services.assignments.find(a => a.id === dirty.assignment.id)!;
  expect(clinicalPatient.seedVersion).toBe(dirty.services.seedVersion);
  expect(completed.status).toBe('completed');
  expect(clinicalPatient.patient.pro.map(pro => pro.id)).toContain(completed.latestValidResponseId);
  expect(clinicalPatient.alerts.map(alert => alert.id).sort()).toEqual(dirty.services.alerts.map(alert => alert.id).sort());
  const { snapshot, report } = await api.delivered();
  const details = await api.detail(report);
  expect(details.report.status).toBe('delivered');
  expect(details.workflow.history.map(e => e.action)).toEqual(['submit', 'review', 'review', 'deliver']);
  for (const signature of [details.workflow.dataReview!, details.workflow.medicalReview!]) {
    expect(signature.submissionId).toBe(details.workflow.submission!.id);
    expect(signature.snapshotDigest).toBe(snapshot.contentDigest);
    expect(signature.contentDigest).toBe(report.contentDigest);
  }
  const authorizationVersion = (await api.pharma()).authorizationVersion;
  const query = api.publicQuery(report, authorizationVersion);
  async function downloads() {
    const result: Record<string, string> = {};
    for (const format of ['text', 'html']) {
      const response = await request.get(`${publicReportUrl(report.id)}/download?${query}&format=${format}`);
      expect(response.ok()).toBe(true); expect(response.headers()['cache-control']).toBe('no-store');
      result[format] = (await response.body()).toString('base64');
    }
    return result;
  }
  async function facts() {
    return { clinical: digest(await clinical()), services: await api.services(), patient: await api.patient(), internal: await api.internal(), snapshots: await api.snapshots(), frozen: await api.frozen(snapshot), reports: await api.reports(), detail: await api.detail(report), pharma: await api.pharma(), external: await api.external(report), downloads: await downloads() };
  }
  const before = await facts();
  expect(before.external.gate.status).toBe('available');
  await ssrReadOnly();
  const descriptor = JSON.parse(await readFile('test-results/runtime-worker/runtime.json', 'utf8')) as { url: string; token: string; pid: number; persist: string };
  const control = new URL(descriptor.url);
  expect(control.hostname).toBe('127.0.0.1'); expect(control.pathname).toBe('/restart');
  const restarted = await fetch(control, { method: 'POST', headers: { authorization: `Bearer ${descriptor.token}` }, signal: AbortSignal.timeout(120_000) });
  expect(restarted.ok).toBe(true);
  const lifecycle = await restarted.json() as { previousPid: number; pid: number; generation: number; persist: string };
  expect(lifecycle.previousPid).toBe(descriptor.pid); expect(lifecycle.pid).not.toBe(descriptor.pid);
  expect(lifecycle.persist).toBe(descriptor.persist); expect(lifecycle.generation).toBe(2);
  expect(await facts()).toEqual(before);
  // All successful commands are resent byte-for-byte as JSON bodies, preserving original request IDs.
  for (const command of api.commands) {
    const response = await request.post(command.url, { data: command.body });
    expect(response.ok(), command.url).toBe(true); expect(await response.json()).toEqual(command.receipt);
  }
  expect(await facts()).toEqual(before);
  await ssrReadOnly();
  await page.goto(`/pharma/projects/${PROJECT}/reports/${encodeURIComponent(report.id)}`);
  await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();
  if ('contentDigest' in before.external) await expect(page.locator('body')).toContainText(before.external.contentDigest);
  expect((await api.read<{ seedVersion: number }>(publicUrl)).seedVersion).toBe(report.seedVersion);
  expect(await facts()).toEqual(before);
  await page.screenshot({ path: info.outputPath('worker-restarted-delivered.png'), fullPage: true });
  await api.attach(info, 'restart-original-command-receipts');
  await info.attach('restart-identical-projections-and-files', { body: JSON.stringify({ lifecycle, before, after: await facts() }, null, 2), contentType: 'application/json' });
  // Intentionally retain the final delivered fixture and owned stopped SQLite for raw-state audit.
});
