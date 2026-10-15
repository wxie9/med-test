// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProPage from '@/app/patient/pro/page';
const clinicalRefresh = vi.fn();
let clinicalError: Error | null = null;
let clinicalReady = true;
let clinicalPro: unknown[] = [];
let patientId = 'P-A', query = new URLSearchParams('assignment=assignment-A');
vi.mock('next/navigation', () => ({ useSearchParams: () => query }));
vi.mock('@/lib/client/patientContext', () => ({ usePatientId: () => patientId }));
vi.mock('@/lib/client/usePatient', () => ({ usePatient: () => ({ data: clinicalReady ? { patient: { stage: 'early_adjuvant', pro: clinicalPro } } : null, error: clinicalError, refresh: clinicalRefresh }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement('a', props, children) }));
const assignment = { id: 'assignment-A', kind: 'questionnaire', title: '项目症状问卷', dueAt: '2026-10-13T01:00:00Z', assignedAt: '2026-10-01T00:00:00Z', status: 'open', version: 1, actionable: true };
const project = { id: 'PSP-1', title: '内分泌治疗支持项目', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z', contactTargets: { high: 2, medium: 24 } };
const view = (assignments: unknown[] = [assignment], permission = true, seedVersion = 1) => ({ patientId, displayName: '演示患者甲', serverNow: '2026-10-13T02:00:00Z', seedVersion, projects: [{ project, enrollment: { id: 'ENR-1', status: 'active', version: 1 }, permissions: { service: permission, aggregate: false }, assignments }] });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); patientId = 'P-A'; clinicalError = null; clinicalRefresh.mockReset(); clinicalReady = true; clinicalPro = []; query = new URLSearchParams('assignment=assignment-A'); });
it('never falls back to generic PRO for absent or another patient assignment', async () => {
 vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(view([]))))); render(createElement(ProPage));
 await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('当前患者的计划中不存在此项目问卷'));
 expect(screen.queryByTestId('submit-pro')).toBeNull(); expect(screen.queryByTestId('submit-project-pro')).toBeNull();
});
it('shows the current patient, project, fixed deadline and complete monthly scale with separate PSP endpoint', async () => {
 const posts: Record<string, unknown>[] = []; vi.stubGlobal('fetch', (_url: string, options?: RequestInit) => { if (options?.method === 'POST') { posts.push(JSON.parse(options.body as string)); return Promise.resolve(new Response('{}', { status: 503 })); } return Promise.resolve(new Response(JSON.stringify(view()))); });
 render(createElement(ProPage)); await waitFor(() => expect(screen.getByTestId('submit-project-pro')).toBeTruthy());
 expect(screen.getByText(/演示患者甲 · P-A/)).toBeTruthy(); expect(screen.getByText('内分泌治疗支持项目')).toBeTruthy(); expect(screen.getByText(/固定截止：2026\/10\/13 09:00:00/)).toBeTruthy(); expect(screen.getByText(/演示用自拟问卷，非标准量表/)).toBeTruthy();
 fireEvent.click(screen.getByTestId('submit-project-pro')); await waitFor(() => expect(screen.getByRole('button', { name: '重试同一次提交' })).toBeTruthy());
 expect(posts[0]).toMatchObject({ patientId: 'P-A', scaleId: 'endocrine_monthly_v1', items: { '关节痛': 0, '潮热': 0, '情绪': 0, '睡眠': 0 }, meta: { seedVersion: 1, expectedVersion: 1, actorId: 'P-A', role: 'patient' } });
 expect((screen.getByLabelText('关节痛') as HTMLInputElement).disabled).toBe(true);
});
it('keeps unauthorized assignment read-only and generic questionnaire intact without assignment', async () => {
 vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(view([assignment], false))))); const { rerender } = render(createElement(ProPage));
 await waitFor(() => expect(screen.getByText(/当前项目服务未激活或未授权/)).toBeTruthy()); expect(screen.queryByTestId('submit-project-pro')).toBeNull();
 query = new URLSearchParams(); rerender(createElement(ProPage)); expect(screen.getByTestId('submit-pro')).toBeTruthy();
});
it('requires explicit revision of the current latest response and preserves first completion', async () => {
 clinicalPro = [{ id: 'PRO-1', scaleId: 'endocrine_monthly_v1', items: { '关节痛': 2, '潮热': 1, '情绪': 3, '睡眠': 1 }, flags: { missedDoses14d: 4, stopIntent: true } }, { id: 'generic-latest', scaleId: 'endocrine_monthly_v1', items: { '关节痛': 0 }, flags: {} }];
 const completed = { ...assignment, status: 'completed', actionable: false, firstValidSubmittedAt: '2026-10-13T02:00:00Z', latestValidResponseId: 'PRO-1' };
 vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(view([completed]))))); const { rerender } = render(createElement(ProPage));
 await waitFor(() => expect(screen.getByText(/已完成 · 迟交/)).toBeTruthy()); expect(screen.queryByTestId('submit-project-pro')).toBeNull(); expect(screen.getByRole('link', { name: '修订项目问卷' }).getAttribute('href')).toContain('revisionOf=PRO-1');
 query = new URLSearchParams('assignment=assignment-A&revisionOf=stale'); rerender(createElement(ProPage)); await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('修订目标已变化'));
 query = new URLSearchParams('assignment=assignment-A&revisionOf=PRO-1'); rerender(createElement(ProPage)); await waitFor(() => expect(screen.getByTestId('submit-project-pro')).toBeTruthy()); expect(screen.getByText(/修订上次项目答卷/)).toBeTruthy(); expect(screen.queryByText(/修订目标：PRO-1/)).toBeNull(); expect((screen.getByLabelText('关节痛') as HTMLInputElement).value).toBe('2'); expect((screen.getByTestId('missed-doses') as HTMLInputElement).value).toBe('4');
});
it('resets answers when the projection seed changes', async () => {
 let seed = 1; vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(view([assignment], true, seed))))); render(createElement(ProPage));
 await waitFor(() => expect(screen.getByTestId('submit-project-pro')).toBeTruthy()); fireEvent.change(screen.getByLabelText('关节痛'), { target: { value: '3' } });
 seed = 2; await act(async () => { fireEvent.click(screen.getByRole('button', { name: '刷新计划' })); });
 await waitFor(() => expect((screen.getByLabelText('关节痛') as HTMLInputElement).value).toBe('0'));
});

it('initializes from the assigned revision when clinical data arrives after the project projection', async () => {
 query = new URLSearchParams('assignment=assignment-A&revisionOf=PRO-1'); clinicalReady = false;
 const completed = { ...assignment, status: 'completed', actionable: false, firstValidSubmittedAt: '2026-10-13T02:00:00Z', latestValidResponseId: 'PRO-1' };
 vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(view([completed]))))); const { rerender } = render(createElement(ProPage));
 await waitFor(() => expect(screen.getByText('正在读取当前计划的最新答卷…')).toBeTruthy()); expect(screen.queryByTestId('submit-project-pro')).toBeNull();
 clinicalPro = [{ id: 'PRO-1', scaleId: 'endocrine_monthly_v1', items: { '关节痛': 2, '潮热': 1, '情绪': 1, '睡眠': 1 }, flags: { missedDoses14d: 4, stopIntent: true } }]; clinicalReady = true; rerender(createElement(ProPage));
 await waitFor(() => expect((screen.getByLabelText('关节痛') as HTMLInputElement).value).toBe('2')); expect((screen.getByTestId('missed-doses') as HTMLInputElement).value).toBe('4'); expect((screen.getByTestId('stop-intent') as HTMLInputElement).checked).toBe(true);
});
it('keeps a pending revision retry available if polling sees its committed latest response before the lost response', async () => {
 query = new URLSearchParams('assignment=assignment-A&revisionOf=PRO-1'); clinicalPro = [{ id: 'PRO-1', scaleId: 'endocrine_monthly_v1', items: { '关节痛': 2 }, flags: {} }];
 let latest = 'PRO-1', resolve!: (response: Response) => void; const bodies: string[] = [];
 vi.stubGlobal('fetch', (_url: string, options?: RequestInit) => { if (options?.method === 'POST') { bodies.push(options.body as string); return new Promise<Response>(r => { resolve = r; }); } return Promise.resolve(new Response(JSON.stringify(view([{ ...assignment, status: 'completed', actionable: false, firstValidSubmittedAt: '2026-10-13T02:00:00Z', latestValidResponseId: latest }])))); });
 render(createElement(ProPage)); await waitFor(() => expect(screen.getByTestId('submit-project-pro')).toBeTruthy()); fireEvent.click(screen.getByTestId('submit-project-pro'));
 latest = 'PRO-2'; await act(async () => { fireEvent.click(screen.getByRole('button', { name: '刷新计划' })); }); await act(async () => resolve(new Response('{}', { status: 503 })));
 expect(screen.getByRole('button', { name: '重试同一次提交' })).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: '重试同一次提交' })); expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
});
it('does not expose a fill form for a cancelled or nonactionable questionnaire', async () => {
 vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(view([{ ...assignment, status: 'cancelled', actionable: false }]))))); render(createElement(ProPage));
 await waitFor(() => expect(screen.getByText(/此问卷计划当前不可填写/)).toBeTruthy()); expect(screen.queryByTestId('submit-project-pro')).toBeNull();
});

it('shows a clinical prefill read failure and allows explicit retry to load that project answer', async () => {
 query = new URLSearchParams('assignment=assignment-A&revisionOf=PRO-1'); clinicalReady = false; clinicalError = new Error('GET clinical failed: 503');
 const completed = { ...assignment, status: 'completed', actionable: false, firstValidSubmittedAt: '2026-10-13T02:00:00Z', latestValidResponseId: 'PRO-1' };
 vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(view([completed]))))); const { rerender } = render(createElement(ProPage));
 await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('上次项目答卷读取失败'));
 expect(screen.queryByText('正在读取当前计划的最新答卷…')).toBeNull(); expect(screen.queryByTestId('submit-project-pro')).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: '重试读取答卷' })); expect(clinicalRefresh).toHaveBeenCalledTimes(1);
 clinicalPro = [{ id: 'PRO-1', scaleId: 'endocrine_monthly_v1', submittedAt: '2026-10-13T02:00:00Z', items: { '关节痛': 2, '潮热': 1, '情绪': 1, '睡眠': 1 }, flags: { missedDoses14d: 4, stopIntent: true } }]; clinicalReady = true; clinicalError = null; rerender(createElement(ProPage));
 await waitFor(() => expect((screen.getByLabelText('关节痛') as HTMLInputElement).value).toBe('2')); expect((screen.getByTestId('missed-doses') as HTMLInputElement).value).toBe('4'); expect(screen.queryByRole('alert')).toBeNull();
});

const savedResult={data:{proId:'PRO-1',feedback:'已收到',emergency:false,offHours:false,alertIds:[],assignmentId:'assignment-A',firstValidSubmittedAt:'2026-10-13T02:00:00Z',latestValidResponseId:'PRO-1',dueAt:assignment.dueAt,onTime:false},objectVersion:2,ledgerRevision:1,seedVersion:1};
it('keeps the submission owner through failed parent reads while hiding stale input and links until accepted GET',async()=>{
 const bodies:string[]=[];let failRead=false;let finishRetry!:(response:Response)=>void;const retry=new Promise<Response>(resolve=>{finishRetry=resolve;});
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return bodies.length===1?Promise.resolve(new Response('{}',{status:503})):retry;}return Promise.resolve(new Response(JSON.stringify(failRead?{}:view()),{status:failRead?404:200}));});
 render(createElement(ProPage));await screen.findByTestId('submit-project-pro');fireEvent.change(screen.getByLabelText('关节痛'),{target:{value:'3'}});fireEvent.click(screen.getByTestId('submit-project-pro'));await screen.findByRole('button',{name:'重试同一次提交'});
 failRead=true;fireEvent.click(screen.getByRole('button',{name:'刷新计划'}));await screen.findByText('加载失败（404），请重试。');
 expect(screen.queryByRole('link')).toBeNull();expect(screen.queryByLabelText('关节痛')).toBeNull();expect(screen.queryByText(/演示患者甲/)).toBeNull();expect(screen.queryByTestId('submit-project-pro')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'重试同一次提交'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[1]).toBe(bodies[0]);expect(JSON.parse(bodies[0])).toMatchObject({items:{关节痛:3},meta:{seedVersion:1,expectedVersion:1,clientRequestId:expect.any(String)}});
 expect(screen.queryByRole('link')).toBeNull();expect(screen.queryByLabelText('关节痛')).toBeNull();
 await act(async()=>finishRetry(new Response(JSON.stringify(savedResult))));await screen.findByText('加载失败（404），请重试。');expect(screen.queryByTestId('project-pro-feedback')).toBeNull();expect(screen.queryByRole('link')).toBeNull();
 failRead=false;fireEvent.click(screen.getByRole('button',{name:'重新加载项目计划'}));await screen.findByTestId('project-pro-feedback');expect((screen.getByLabelText('关节痛') as HTMLInputElement).value).toBe('3');expect(screen.getAllByRole('link',{name:'返回固定计划'}).every(link=>link.getAttribute('href')==='/patient/plan?patient=P-A#assignment-assignment-A')).toBe(true);
});
it('all real successful submission return links preserve the same encoded assignment and patient',async()=>{
 const exact={...assignment,id:'PSP:PRO:1'};query=new URLSearchParams({assignment:exact.id});
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>Promise.resolve(new Response(JSON.stringify(options?.method==='POST'?savedResult:view([exact])))));
 render(createElement(ProPage));fireEvent.click(await screen.findByTestId('submit-project-pro'));await screen.findByTestId('project-pro-feedback');
 const links=screen.getAllByRole('link',{name:'返回固定计划'});expect(links).toHaveLength(2);for(const link of links)expect(link.getAttribute('href')).toBe('/patient/plan?patient=P-A#assignment-PSP%3APRO%3A1');expect(screen.getByRole('link',{name:'查看消息'}).getAttribute('href')).toBe('/patient/messages?patient=P-A');
});
