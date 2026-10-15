// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const view = { patientId: 'P-A', displayName: '王女士', project: { title: '合成项目' }, assignment: { id: 'education', title: '模拟阅读计划', status: 'open', version: 2, dueAt: '2026-10-14T00:00:00Z' }, content: { id: 'approved', title: '合成教育内容', body: '这是用于演示的固定阅读内容。', version: 1, status: 'approved', sourceNote: '合成素材', approvedAt: '2026-10-01T00:00:00Z' }, result: { sentAt: '2026-10-13T02:00:00Z', openedAt: null as string | null, feedbackAt: null as string | null }, canOpen: true, canFeedback: false, seedVersion: 1 };
const json = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('GET never opens; explicit reading acknowledgement precedes understood/help feedback', async () => {
 const { PatientEducation } = await import('@/components/psp/PatientEducation'); const posts: Record<string, unknown>[] = []; let current = structuredClone(view);
 vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => { if (options?.method === 'POST') { const body = JSON.parse(options.body as string); posts.push(body); if (body.action === 'open') current = { ...current, assignment: { ...current.assignment, version: 3 }, result: { ...current.result, openedAt: view.result.sentAt }, canOpen: false, canFeedback: true }; } return Promise.resolve(json(current)); }));
 render(createElement(PatientEducation, { assignmentId: 'education', patientId: 'P-A' })); await screen.findByText('合成教育内容'); expect(posts).toHaveLength(0); expect(screen.queryByRole('button', { name: '提交阅读反馈' })).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: '我已阅读' })); await screen.findByRole('button', { name: '提交阅读反馈' }); expect(posts[0]).toMatchObject({ action: 'open', meta: { expectedVersion: 2, actorId: 'P-A' } });
 fireEvent.click(screen.getByLabelText('我已理解')); fireEvent.click(screen.getByLabelText('仍需服务团队帮助')); fireEvent.click(screen.getByRole('button', { name: '提交阅读反馈' }));
 await waitFor(() => expect(posts).toHaveLength(2)); expect(posts[1]).toMatchObject({ action: 'feedback', understood: true, needsHelp: true, meta: { expectedVersion: 3 } });
});
it('paused sent history remains readable without any new write controls', async () => {
 const { PatientEducation } = await import('@/components/psp/PatientEducation'); vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ ...view, canOpen: false, canFeedback: false }))));
 render(createElement(PatientEducation, { assignmentId: 'education', patientId: 'P-A' })); await screen.findByText('合成教育内容'); expect(screen.queryByRole('button', { name: '我已阅读' })).toBeNull(); expect(screen.getByText(/历史资料只读/)).toBeTruthy();
});
it('labels completed seed education as historical background and does not claim a new help task', async () => {
 const { PatientEducation } = await import('@/components/psp/PatientEducation'); vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ ...view, background: true, assignment: { ...view.assignment, status: 'completed' }, result: { ...view.result, openedAt: view.result.sentAt, feedbackAt: view.result.sentAt, understood: true, needsHelp: true }, canOpen: false, canFeedback: false }))));
 render(createElement(PatientEducation, { assignmentId: 'education', patientId: 'P-A' })); await screen.findByText('合成教育内容'); expect(screen.getByText(/合成背景教育记录/)).toBeTruthy(); expect(screen.queryByText(/已建立未来联系计划/)).toBeNull();
});

it.each(['open','feedback'])('preserves exact education %s retry across failed GET without reviving stale navigation',async(action)=>{
 const {PatientEducation}=await import('@/components/psp/PatientEducation');const bodies:string[]=[];let failRead=false;let resolveRetry!:(r:Response)=>void;const retry=new Promise<Response>(resolve=>{resolveRetry=resolve;});
 const current={...view,canOpen:action==='open',canFeedback:action==='feedback'};
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return bodies.length===1?Promise.resolve(new Response('{}',{status:503})):retry;}return Promise.resolve(failRead?new Response('{}',{status:404}):json(current));});
 render(createElement(PatientEducation,{assignmentId:'education',patientId:'P-A'}));await screen.findByText('合成教育内容');
 const assertLinks=()=>{expect(screen.getByRole('link',{name:'返回固定计划'}).getAttribute('href')).toBe('/patient/plan?patient=P-A#assignment-education');expect(screen.getByRole('link',{name:'返回服务消息'}).getAttribute('href')).toBe('/patient/messages?patient=P-A#education-education');};assertLinks();
 if(action==='feedback'){fireEvent.click(screen.getByLabelText('我已理解'));fireEvent.click(screen.getByLabelText('仍需服务团队帮助'));}
 fireEvent.click(screen.getByRole('button',{name:action==='open'?'我已阅读':'提交阅读反馈'}));await screen.findByRole('button',{name:'重试同一次操作'});
 expect(JSON.parse(bodies[0])).toMatchObject({action,...(action==='feedback'?{understood:true,needsHelp:true}:{}),meta:{expectedVersion:2,seedVersion:1,actorId:'P-A',role:'patient',clientRequestId:expect.any(String)}});
 failRead=true;fireEvent.click(screen.getByRole('button',{name:'刷新教育资料'}));await screen.findByText('加载失败（404），请重试。');expect(screen.queryByRole('link')).toBeNull();expect(screen.queryByText('合成教育内容')).toBeNull();
 failRead=false;fireEvent.click(screen.getByRole('button',{name:'重试同一次操作'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[1]).toBe(bodies[0]);expect(screen.queryByRole('link')).toBeNull();expect(screen.queryByText('合成教育内容')).toBeNull();
 resolveRetry(json({}));await screen.findByText('操作已保存。');await screen.findByText('合成教育内容');assertLinks();
});
