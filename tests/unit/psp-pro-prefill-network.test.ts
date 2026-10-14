// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProPage from '@/app/patient/pro/page';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('assignment=assignment-A&revisionOf=PRO-1') }));
vi.mock('@/lib/client/patientContext', () => ({ usePatientId: () => 'P-A' }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement('a', props, children) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('recovers a real clinical GET 503 through the revision prefill retry without changing assignment identity', async () => {
 const project = { id: 'PSP-1', title: '支持服务项目', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z', contactTargets: { high: 2, medium: 24 } };
 const view = { patientId: 'P-A', displayName: '演示患者甲', serverNow: '2026-10-13T02:00:00Z', seedVersion: 1, projects: [{ project, enrollment: { id: 'ENR-1', status: 'active', version: 1 }, permissions: { service: true, aggregate: false }, assignments: [{ id: 'assignment-A', kind: 'questionnaire', title: '项目问卷', assignedAt: '2026-10-01T00:00:00Z', dueAt: '2026-10-13T01:00:00Z', status: 'completed', version: 2, actionable: false, firstValidSubmittedAt: '2026-10-13T02:00:00Z', latestValidResponseId: 'PRO-1' }] }] };
 const clinical = { patient: { id: 'P-A', stage: 'early_adjuvant', pro: [{ id: 'PRO-1', scaleId: 'endocrine_monthly_v1', submittedAt: '2026-10-13T02:00:00Z', items: { '关节痛': 2, '潮热': 1, '情绪': 1, '睡眠': 1 }, flags: { missedDoses14d: 4, stopIntent: true } }, { id: 'latest-generic', scaleId: 'endocrine_monthly_v1', items: { '关节痛': 0 }, flags: {} }] } };
 let clinicalReads = 0; const calls: string[] = [];
 vi.stubGlobal('fetch', (url: string) => { calls.push(url); const isClinical = url.startsWith('/api/patients/'); const fail = isClinical && ++clinicalReads === 1; return Promise.resolve(new Response(JSON.stringify(fail ? {} : isClinical ? clinical : view), { status: fail ? 503 : 200 })); });
 render(createElement(ProPage)); await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('上次项目答卷读取失败')); expect(screen.queryByTestId('submit-project-pro')).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: '重试读取答卷' })); await waitFor(() => expect((screen.getByLabelText('关节痛') as HTMLInputElement).value).toBe('2'));
 expect((screen.getByTestId('missed-doses') as HTMLInputElement).value).toBe('4'); expect((screen.getByTestId('stop-intent') as HTMLInputElement).checked).toBe(true); expect(clinicalReads).toBe(2); expect(screen.queryByRole('alert')).toBeNull(); expect(calls.every(url => url.includes('P-A'))).toBe(true);
});
