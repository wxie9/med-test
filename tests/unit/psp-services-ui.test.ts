// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Plans } from '@/components/psp/Common';
import { PatientService } from '@/components/psp/PatientService';
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement('a', props, children) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete process.env.DEMO_FIXED_NOW; });
const project = { id: 'project', title: '合成支持项目', sponsor: '模拟', scope: '合成范围', population: '合成人群', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z', cutoffAt: '2026-10-13T02:00:00Z', contactTargets: { high: 2, medium: 24 } };
const assignment = { id: 'education-a', kind: 'education' as const, title: '合成教育资料', status: 'completed' as const, dueAt: '2026-10-14T00:00:00Z', assignedAt: '2026-10-01T00:00:00Z', version: 2, actionable: false, firstValidSubmittedAt: null, latestValidResponseId: null };
it('shows actual completed contact time without labeling this session as synthetic background', () => {
 render(createElement(Plans, { assignments: [{ ...assignment, kind: 'contact', completion: { at: '2026-10-13T02:00:00Z', background: false } }] }));
 expect(screen.queryByText(/合成背景记录/)).toBeNull(); expect(screen.getByText(/已完成联系/)).toBeTruthy();
});
it('links only sent education from own projection without per-assignment fanout', async () => {
 const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ seedVersion: 1, serverNow: '2026-10-13T02:00:00Z', patientId: 'P-A', displayName: '王女士', projects: [{ project, enrollment: { id: 'enrollment', status: 'active', version: 1 }, permissions: { service: true, aggregate: false }, permissionHistory: [], assignments: [assignment, { ...assignment, id: 'unsent', title: '尚未发送' }], education: [{ assignmentId: assignment.id, title: assignment.title, version: 2, sentAt: '2026-10-13T01:00:00Z', openedAt: null, feedbackAt: null, background: false }] }] }))));
 vi.stubGlobal('fetch', fetcher); render(createElement(PatientService, { patientId: 'P-A' }));
 const link = await screen.findByRole('link', { name: '阅读教育资料' }); expect(link.getAttribute('href')).toBe('/patient/education/education-a?patient=P-A');
 expect(fetcher.mock.calls).toHaveLength(1); expect(screen.getAllByRole('link', { name: '阅读教育资料' })).toHaveLength(1);
});

it.each([['2026-10-10T02:00:00.000Z','按时'],['2026-10-13T02:00:00.000Z','迟交']])('retains questionnaire submission wording for real completion DTO at %s',async(at,label)=>{
 const {buildPspTestStore,installPspTestStore}=await import('../helpers/psp');const {getStore}=await import('@/lib/state/store');
 const {submitProjectPro}=await import('@/lib/psp/commands');const {getPatientProjectsView}=await import('@/lib/psp/views');
 installPspTestStore(buildPspTestStore());process.env.DEMO_FIXED_NOW=at;
 const id='PSP-BC-ENDO-001:ENR-01:PRO:2026-10';
 submitProjectPro({assignmentId:id,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:{关节痛:1,潮热:1,情绪:1,睡眠:1},flags:{stopIntent:false,missedDoses14d:0}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'questionnaire-completion',role:'patient',actorId:'P-A'});
 const item=getPatientProjectsView('P-A','patient','P-A').projects[0].assignments.find(a=>a.id===id)!;
 expect(item.completion).toEqual({at,background:false});
 render(createElement(Plans,{assignments:[item],patientId:'P-A',canSubmit:true}));
 expect(screen.getByText(new RegExp(`已完成 · ${label}`))).toBeTruthy();expect(screen.queryByText(/教育反馈/)).toBeNull();
 expect(screen.getByRole('link',{name:'修订项目问卷'}).getAttribute('href')).toContain('revisionOf=');
});
it('shows actionable contact and education plan states',()=>{
 render(createElement(Plans,{assignments:[{...assignment,id:'contact',kind:'contact',status:'open',actionable:true},{...assignment,id:'unsent',status:'open',actionable:true},{...assignment,id:'sent',status:'open',actionable:true}],education:[{assignmentId:'sent',sentAt:'2026-10-13T02:00:00Z'}]}));
 expect(screen.getByText('待服务团队联系')).toBeTruthy();expect(screen.getByText('待发送教育资料')).toBeTruthy();expect(screen.getByText('待阅读反馈')).toBeTruthy();
});

it('does not infer unsent education when the caller has no education projection',()=>{
 render(createElement(Plans,{assignments:[{...assignment,status:'open',actionable:true}]}));
 expect(screen.getByText('待教育服务完成')).toBeTruthy();expect(screen.queryByText('待发送教育资料')).toBeNull();
});
it('shows unsent education when the caller supplies a known empty projection',()=>{
 render(createElement(Plans,{assignments:[{...assignment,status:'open',actionable:true}],education:[]}));
 expect(screen.getByText('待发送教育资料')).toBeTruthy();expect(screen.queryByText('待教育服务完成')).toBeNull();
});
