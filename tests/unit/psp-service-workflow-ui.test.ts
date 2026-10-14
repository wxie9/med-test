// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const identity = vi.hoisted(() => ({ current: '个案管理师小陈' }));
vi.mock('@/lib/client/clinicIdentity', () => ({ useClinicIdentity: () => ({ identity: identity.current }) }));
const project = { id: 'project', title: '合成支持项目', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z', cutoffAt: '2026-10-13T02:00:00Z' };
const plan = { id: 'contact-plan', title: '固定联系计划', kind: 'contact', status: 'open', version: 3, assignedAt: project.startsAt, dueAt: project.cutoffAt, actionable: true };
const alerts = ['symptom', 'adherence'].map((kind, i) => ({ id: `alert-${i}`, kind, rule: `模拟规则${i}`, level: 'high', status: 'in_progress', version: 4, assignee: '个案管理师小陈', timestamps: { triggered: project.cutoffAt }, disposition: null, doctorReview: null }));
const service = { patientId: 'P-A', displayName: '王女士', project, enrollment: { id: 'enrollment', status: 'active', version: 1 }, permissions: { service: true, aggregate: false }, assignments: [plan], alerts, contacts: [], education: [], approvedContents: [], seedVersion: 1, serverNow: '2026-10-13T02:00:00Z' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); identity.current = '个案管理师小陈'; });
it('captures two same-patient alerts and fixed contact plan as one unsuccessful attempt, freezing exact retry', async () => {
 const { ServiceWorkflow } = await import('@/components/psp/ServiceWorkflow'); const bodies: string[] = [];
 vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => { if (options?.method === 'POST') { bodies.push(options.body as string); return Promise.resolve(json({}, bodies.length === 1 ? 503 : 200)); } return Promise.resolve(json(service)); }));
 render(createElement(ServiceWorkflow, { patientId: 'P-A', projectId: 'project' }));
 await screen.findByText('当前患者：王女士 · P-A');
 fireEvent.click(screen.getByLabelText('联系覆盖：症状 · 模拟规则0')); fireEvent.click(screen.getByLabelText('联系覆盖：依从性 · 模拟规则1'));
 fireEvent.change(screen.getByLabelText('联系结果'), { target: { value: 'no_answer' } }); fireEvent.click(screen.getByRole('button', { name: '记录本次联系' }));
 await screen.findByRole('button', { name: '重试同一次操作' }); expect(screen.getByLabelText('联系结果').matches(':disabled')).toBe(true);
 const first = JSON.parse(bodies[0]); expect(first.alertIds).toEqual(['alert-0', 'alert-1']); expect(first.assignmentId).toBe('contact-plan'); expect(first.outcome).toBe('no_answer'); expect(first.meta.expectedVersion).toBe(3);
 fireEvent.click(screen.getByRole('button', { name: '重试同一次操作' })); await waitFor(() => expect(bodies).toHaveLength(2)); expect(bodies[1]).toBe(bodies[0]);
});
it('review requires a real covering contact, category and summary, rejecting seed background references', async () => {
 const { ServiceWorkflow } = await import('@/components/psp/ServiceWorkflow'); const bodies: Record<string, unknown>[] = [];
 const contacts = [{ id: 'real', interactionId: 'call', background: false, channel: 'phone', outcome: 'reached', alertIds: ['alert-0', 'alert-1'], occurredAt: service.serverNow, recordedAt: service.serverNow, actorId: 'case-manager-chen' }, { id: 'seed', interactionId: 'background', background: true, outcome: 'reached', alertIds: [], occurredAt: service.serverNow }];
 vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => { if (options?.method === 'POST') bodies.push(JSON.parse(options.body as string)); return Promise.resolve(json({ ...service, contacts })); }));
 render(createElement(ServiceWorkflow, { patientId: 'P-A', projectId: 'project' })); await screen.findByText('当前患者：王女士 · P-A');
 const region = screen.getByTestId('psp-alert-alert-0'); const { within } = await import('@testing-library/react'); const row = within(region);
 expect((row.getByRole('button', { name: '提交本预警复核' }) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(row.getByLabelText('处置类别'), { target: { value: 'contacted' } }); fireEvent.change(row.getByLabelText('处置摘要'), { target: { value: '已联系，待医生复核' } }); fireEvent.click(row.getByLabelText(/复核引用联系/));
 fireEvent.click(row.getByRole('button', { name: '提交本预警复核' })); await waitFor(() => expect(bodies).toHaveLength(1));
 expect(bodies[0]).toMatchObject({ action: 'submit_review', disposition: { category: 'contacted', summary: '已联系，待医生复核', interactionIds: ['call'] } });
 expect(row.queryByLabelText(/background/)).toBeNull();
});
it('drops stale service results when patient scope changes', async () => {
 const { ServiceWorkflow } = await import('@/components/psp/ServiceWorkflow'); let resolve!: (r: Response) => void; const old = new Promise<Response>(r => { resolve = r; });
 vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('patientId=P-A') ? old : Promise.resolve(json({ ...service, patientId: 'P-B', displayName: '李女士' }))));
 const view = render(createElement(ServiceWorkflow, { patientId: 'P-A', projectId: 'project' })); view.rerender(createElement(ServiceWorkflow, { patientId: 'P-B', projectId: 'project' }));
 await screen.findByText('当前患者：李女士 · P-B'); resolve(json(service)); await new Promise(r => setTimeout(r, 0)); expect(screen.queryByText('当前患者：王女士 · P-A')).toBeNull();
});

it('doctor cannot close without mandatory note and exact future Shanghai time, and writes the alert version', async () => {
 const { ServiceWorkflow } = await import('@/components/psp/ServiceWorkflow'); identity.current = '张医生'; const bodies: Record<string, unknown>[] = [];
 const alert = { ...alerts[0], status: 'pending_review', disposition: { category: 'contacted', summary: '已沟通，待复核', interactionIds: ['call'], at: service.serverNow, actorId: 'case-manager-chen' } };
 vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => { if (options?.method === 'POST') bodies.push(JSON.parse(options.body as string)); return Promise.resolve(json({ ...service, alerts: [alert] })); }));
 render(createElement(ServiceWorkflow, { patientId: 'P-A', projectId: 'project' })); await screen.findByText('当前患者：王女士 · P-A');
 expect(screen.queryByRole('button', { name: '记录本次联系' })).toBeNull(); const button = screen.getByRole('button', { name: '确认复核并关闭本预警' }); expect(button.matches(':disabled')).toBe(true);
 const due = screen.getByLabelText('未来复评时间（上海时间）') as HTMLInputElement;
 expect(due.value).toBe('');expect(due.required).toBe(true);expect(due.min).toBe('2026-10-13T10:01');expect(due.max).toBe('2026-12-31T08:00');
 fireEvent.change(screen.getByLabelText('医生复核意见'), { target: { value: '已复核，安排后续复评' } });
 expect(button.matches(':disabled')).toBe(true);fireEvent.submit(button.closest('form')!);expect(bodies).toHaveLength(0);
 fireEvent.change(screen.getByLabelText('未来复评时间（上海时间）'), { target: { value: '2026-10-13T10:00' } }); expect(button.matches(':disabled')).toBe(true);
 fireEvent.change(due, { target: { value: '2027-01-01T10:00' } });expect(button.matches(':disabled')).toBe(true);
 fireEvent.change(due, { target: { value: '2026-10-14T10:30' } });expect(button.matches(':disabled')).toBe(false);
 fireEvent.change(due, { target: { value: '' } });expect(button.matches(':disabled')).toBe(true);fireEvent.submit(button.closest('form')!);expect(bodies).toHaveLength(0);
 fireEvent.change(due, { target: { value: '2026-10-14T10:30' } }); fireEvent.click(button);
 await waitFor(() => expect(bodies).toHaveLength(1)); expect(bodies[0]).toMatchObject({ action: 'close', note: '已复核，安排后续复评', followupTask: { dueAt: '2026-10-14T02:30:00.000Z', type: '复评', owner: '张医生' }, meta: { expectedVersion: 4, role: 'doctor', actorId: 'doctor-zhang' } });
});
it('CM sends only the selected approved version against the education assignment version', async () => {
 const { ServiceWorkflow } = await import('@/components/psp/ServiceWorkflow'); const bodies: Record<string, unknown>[] = [];
 const education = [{ assignmentId: 'education', title: '阅读计划', version: 7, status: 'open', dueAt: plan.dueAt, sentAt: null, openedAt: null, feedbackAt: null, background: false }];
 const approvedContents = [{ id: 'approved-version', title: '批准素材', version: 2, sourceNote: '模拟审查后的合成素材', approvedAt: service.serverNow }];
 vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => { if (options?.method === 'POST') bodies.push(JSON.parse(options.body as string)); return Promise.resolve(json({ ...service, education, approvedContents })); }));
 render(createElement(ServiceWorkflow, { patientId: 'P-A', projectId: 'project' })); await screen.findByRole('button', { name: '发送教育资料' }); fireEvent.click(screen.getByRole('button', { name: '发送教育资料' }));
 await waitFor(() => expect(bodies).toHaveLength(1)); expect(bodies[0]).toMatchObject({ action: 'send', contentVersionId: 'approved-version', meta: { role: 'case_manager', expectedVersion: 7 } });
});
it('service withdrawal preserves history while disabling all new care writes independently of aggregate permission', async () => {
 const { ServiceWorkflow } = await import('@/components/psp/ServiceWorkflow');
 vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ ...service, enrollment: { ...service.enrollment, status: 'paused' }, permissions: { service: false, aggregate: true } }))));
 render(createElement(ServiceWorkflow, { patientId: 'P-A', projectId: 'project' })); await screen.findByText(/当前服务只读/);
 expect(screen.queryByRole('button', { name: '记录本次联系' })).toBeNull(); expect(screen.getAllByRole('button', { name: '提交本预警复核' }).every(button => button.matches(':disabled'))).toBe(true);
});
it('renders a named clinical assignee instead of the synthetic actor identifier', async () => {
 const { ServiceWorkflow } = await import('@/components/psp/ServiceWorkflow');
 vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ ...service, alerts: [{ ...alerts[0], assignee: 'case-manager-chen' }] }))));
 render(createElement(ServiceWorkflow, { patientId: 'P-A', projectId: 'project' })); await screen.findByText('当前患者：王女士 · P-A'); expect(screen.getByText(/责任人：个案管理师小陈/)).toBeTruthy(); expect(screen.queryByText(/case-manager-chen/)).toBeNull();
});

it('passes sent education projection into internal service plan wording',async()=>{
 const {ServiceWorkflow}=await import('@/components/psp/ServiceWorkflow');
 const education=[{assignmentId:'education',title:'阅读计划',version:2,status:'open',dueAt:plan.dueAt,sentAt:service.serverNow,openedAt:null,feedbackAt:null,background:false}];
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve(json({...service,assignments:[{...plan,id:'education',kind:'education'}],education}))));
 render(createElement(ServiceWorkflow,{patientId:'P-A',projectId:'project'}));
 await screen.findByText('当前患者：王女士 · P-A');expect(screen.getByText('待阅读反馈')).toBeTruthy();expect(screen.queryByText('待发送教育资料')).toBeNull();
});
