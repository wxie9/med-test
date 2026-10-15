import { expect, type APIRequestContext, type APIResponse, type TestInfo } from '@playwright/test';
import type { CommandMeta } from '@/lib/psp/types';
import type { CommandResult } from '@/lib/psp/transaction';
import type { PspReportDetail, PspReportList, PspReportVersion } from '@/lib/psp/reportTypes';
import type { PspSnapshotDetail, PspSnapshotList, PspServiceSnapshot } from '@/lib/psp/snapshotTypes';
import type { InternalProjectView, PatientProjectsView } from '@/lib/psp/views';
import type { PatientServiceView } from '@/lib/psp/serviceView';
import type { PharmaProjectView, PharmaReportView } from '@/lib/psp/pharmaView';
import type { serializeLite } from '@/lib/state/store';

export const PROJECT = 'PSP-BC-ENDO-001';
export const staff = 'role=project_manager&actorId=project-manager-psp';
export const projectUrl = `/api/psp/projects/${PROJECT}`;
export const reportsUrl = `${projectUrl}/reports`;
export const snapshotsUrl = `${projectUrl}/snapshots`;
export const publicUrl = `/api/pharma/projects/${PROJECT}`;
export const reportUrl = (id: string) => `/api/psp/reports/${encodeURIComponent(id)}`;
export const publicReportUrl = (id: string) => `${publicUrl}/reports/${encodeURIComponent(id)}`;
export const window = { periodStart: '2026-10-01T00:00:00+08:00', periodEnd: '2026-11-01T00:00:00+08:00', cutoffAt: '2026-10-13T02:00:00.000Z' };
export function meta(seedVersion: number, expectedVersion: number, role: CommandMeta['role'] = 'project_manager'): CommandMeta {
  const actorId = { project_manager: 'project-manager-psp', data_reviewer: 'data-reviewer-psp', medical_reviewer: 'medical-reviewer-psp', case_manager: 'case-manager-chen', patient: 'P-A', doctor: 'doctor-zhang', pharma_owner: 'pharma-owner-a' }[role];
  return { seedVersion, expectedVersion, role, actorId, clientRequestId: crypto.randomUUID() };
}
export async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.url()} ${response.status()} ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}
export type Evidence = { url: string; body: unknown; receipt: unknown };
export class AcceptanceApi {
  readonly commands: Evidence[] = [];
  constructor(readonly request: APIRequestContext) {}
  read<T>(url: string) { return this.request.get(url).then(json<T>); }
  async command<T>(url: string, body: unknown) {
    const receipt = await this.request.post(url, { data: body }).then(json<CommandResult<T>>);
    this.commands.push({ url, body, receipt });
    return receipt.data;
  }
  state() { return this.read<ReturnType<typeof serializeLite> & { serverNow: string }>('/api/state'); }
  internal() { return this.read<InternalProjectView>(`${projectUrl}?${staff}`); }
  patient() { return this.read<PatientProjectsView>('/api/psp/patients/P-A/projects?role=patient&actorId=P-A'); }
  services() { return this.read<PatientServiceView>(`${projectUrl}/services?patientId=P-A&role=case_manager&actorId=case-manager-chen`); }
  reports() { return this.read<PspReportList>(`${reportsUrl}?${staff}`); }
  snapshots() { return this.read<PspSnapshotList>(`${snapshotsUrl}?${staff}`); }
  pharma() { return this.read<PharmaProjectView>(publicUrl); }
  detail(report: PspReportVersion) { return this.read<PspReportDetail>(`${reportUrl(report.id)}?${staff}&seedVersion=${report.seedVersion}`); }
  frozen(snapshot: PspServiceSnapshot) { return this.read<PspSnapshotDetail>(`/api/psp/snapshots/${encodeURIComponent(snapshot.id)}?${staff}&seedVersion=${snapshot.seedVersion}`); }
  publicQuery(report: PspReportVersion, authorizationVersion: number) {
    return new URLSearchParams({ role: 'pharma_owner', actorId: 'pharma-owner-a', seedVersion: String(report.seedVersion), authorizationVersion: String(authorizationVersion), periodStart: report.window.periodStart, periodEnd: report.window.periodEnd });
  }
  async external(report: PspReportVersion) { return this.read<PharmaReportView>(`${publicReportUrl(report.id)}?${this.publicQuery(report, (await this.pharma()).authorizationVersion)}`); }
  async reset() {
    // Check the actual running clock and seed agreement before every setup reset.
    const state = await this.state(), current = await this.internal();
    expect(state.serverNow).toBe(window.cutoffAt);
    expect(current.seedVersion).toBe(state.seedVersion);
    expect(current.project.cutoffAt).toBe(window.cutoffAt);
    expect((await this.request.post('/api/reset')).ok()).toBe(true);
  }
  async dirtyServices() {
    const patient = await this.patient();
    const assignment = patient.projects[0].assignments.find(a => a.kind === 'questionnaire' && a.status === 'open')!;
    await this.command(`/api/psp/assignments/${encodeURIComponent(assignment.id)}/pro`, { patientId: 'P-A', scaleId: 'endocrine_monthly_v1', items: { 关节痛: 3, 潮热: 1, 情绪: 1, 睡眠: 1 }, flags: { stopIntent: true, missedDoses14d: 4 }, meta: meta(patient.seedVersion, assignment.version, 'patient') });
    const services = await this.services(), contact = services.assignments.find(a => a.kind === 'contact' && a.status === 'open')!;
    await this.command(`${projectUrl}/interactions`, { enrollmentId: services.enrollment.id, assignmentId: contact.id, alertIds: services.alerts.map(a => a.id), channel: 'phone', outcome: 'reached', meta: meta(services.seedVersion, contact.version, 'case_manager') });
    return { assignment, contact, services: await this.services() };
  }
  async delivered() {
    const current = await this.snapshots();
    const snapshot = await this.command<PspServiceSnapshot>(snapshotsUrl, { window, meta: meta(current.seedVersion, current.ledgerRevision) });
    const list = await this.reports();
    let report = await this.command<PspReportVersion>(reportsUrl, { snapshotId: snapshot.id, nextActions: [], meta: meta(list.seedVersion, list.ledgerRevision) });
    for (const [body, role] of [
      [{ action: 'submit' }, 'project_manager'],
      [{ action: 'review', kind: 'data', decision: 'approve' }, 'data_reviewer'],
      [{ action: 'review', kind: 'medical', decision: 'approve' }, 'medical_reviewer'],
      [{ action: 'deliver' }, 'project_manager'],
    ] as const) report = await this.command<PspReportVersion>(`${reportUrl(report.id)}/actions`, { ...body, meta: meta(report.seedVersion, report.version, role) });
    return { snapshot, report };
  }
  async withdraw() {
    const patient = await this.patient(), enrollment = patient.projects[0].enrollment;
    return this.command(`/api/psp/enrollments/${encodeURIComponent(enrollment.id)}/permissions`, { scope: 'aggregate', action: 'withdraw', meta: meta(patient.seedVersion, enrollment.version, 'patient') });
  }
  async attach(info: TestInfo, name = 'actual-api-commands') { await info.attach(name, { body: JSON.stringify(this.commands, null, 2), contentType: 'application/json' }); }
}
