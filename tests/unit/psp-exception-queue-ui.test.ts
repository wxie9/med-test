// @vitest-environment jsdom
import {createElement} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {ExceptionQueue} from '@/components/psp/ExceptionQueue';
import type {PspException} from '@/lib/psp/exceptionQueue';
afterEach(cleanup);
const row:PspException={id:'review:a',kind:'pending_review',patientId:'P-A',displayName:'王女士',responsibleRole:'doctor',sourceAt:'2026-10-13T02:00:00Z',overdue:false,reason:'待复核',target:{kind:'alert',id:'a',href:'/clinic/patients/P-A#alert-a'},additionalTargets:[]};
it('shows server time, unknown review deadline, names and precise href; filters explicitly',()=>{
 render(createElement(ExceptionQueue,{rows:[row],serverNow:row.sourceAt,role:'case_manager',locked:false}));
 expect(screen.getByText('王女士')).toBeTruthy();expect(screen.getByText(/尚未设定复核时限/)).toBeTruthy();expect(screen.getByRole('link',{name:'进入医生复核'}).getAttribute('href')).toBe(row.target.href);
 expect(screen.getByText(/当前运营待办，截至/).textContent).toContain('上海时间');
 fireEvent.click(screen.getByLabelText('与当前角色相关'));expect(screen.getByText('当前筛选下没有事项')).toBeTruthy();
});
it('blocks navigation under authorization and command locks and distinguishes empty queue',()=>{
 const view=render(createElement(ExceptionQueue,{rows:[{...row,blockedReason:'服务授权已撤回'}],serverNow:row.sourceAt,role:'doctor',locked:false}));
 expect(screen.queryByRole('link')).toBeNull();expect(screen.getByText('服务授权已撤回')).toBeTruthy();
 view.rerender(createElement(ExceptionQueue,{rows:[row],serverNow:row.sourceAt,role:'doctor',locked:true}));expect(screen.queryByRole('link')).toBeNull();
 view.rerender(createElement(ExceptionQueue,{rows:[],serverNow:row.sourceAt,role:'doctor',locked:false}));expect(screen.getByText('当前无待处理事项')).toBeTruthy();
});
import {vi} from 'vitest';
import {waitFor,act} from '@testing-library/react';
const identity=vi.hoisted(()=>({current:'个案管理师小陈'}));
vi.mock('@/lib/client/clinicIdentity',()=>({useClinicIdentity:()=>({identity:identity.current})}));
const project={id:'project',title:'合成项目',startsAt:row.sourceAt,endsAt:'2026-12-31T00:00:00Z',cutoffAt:row.sourceAt,contactTargets:{high:1,medium:2}};
const dto={project,exceptions:[row],enrollments:[{id:'e',patientId:'P-A',displayName:'王女士',status:'active',version:1,permissions:{service:true,aggregate:true},assignments:[]}],counts:{candidates:1,activeService:1,aggregateAllowed:1},seedVersion:1,serverNow:row.sourceAt};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
afterEach(()=>{vi.unstubAllGlobals();identity.current='个案管理师小陈';});
it('ServiceDesk keeps navigation locked for 503 receipt retry and hides patient data on failed read',async()=>{
 const {ServiceDesk}=await import('@/components/psp/ServiceDesk');
 const requests:string[]=[];vi.stubGlobal('fetch',vi.fn((_url:string,opts?:RequestInit)=>{if(opts?.method==='POST')requests.push(opts.body as string);return Promise.resolve(opts?.method==='POST'?json({},503):json(dto));}));
 render(createElement(ServiceDesk,{projectId:'project'}));await screen.findByRole('link',{name:'进入医生复核'});
 fireEvent.change(screen.getByLabelText('王女士操作理由'),{target:{value:'暂停核对'}});fireEvent.click(screen.getByRole('button',{name:'暂停服务'}));
 await screen.findByRole('button',{name:'重试同一次操作'});expect(screen.queryByRole('link',{name:'进入医生复核'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'重试同一次操作'}));await waitFor(()=>expect(requests).toHaveLength(2));expect(requests[1]).toBe(requests[0]);expect(screen.queryByRole('link',{name:'进入医生复核'})).toBeNull();
});
it('ServiceDesk hides failed refresh results and ignores old-role responses',async()=>{
 const {ServiceDesk}=await import('@/components/psp/ServiceDesk');let fail=false;let resolve!:(r:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve(fail?json({},403):json(dto))));
 const view=render(createElement(ServiceDesk,{projectId:'project'}));await screen.findByRole('link',{name:'进入医生复核'});
 fail=true;fireEvent.click(screen.getByRole('button',{name:'刷新待办'}));await screen.findByText('项目成员暂时无法加载。');expect(screen.queryByText('王女士')).toBeNull();
 vi.stubGlobal('fetch',vi.fn((url:string)=>url.includes('role=doctor')?Promise.resolve(json({...dto,exceptions:[],enrollments:[]})):new Promise<Response>(r=>{resolve=r;})));
 fireEvent.click(screen.getByRole('button',{name:'重新加载'}));identity.current='张医生';view.rerender(createElement(ServiceDesk,{projectId:'project'}));
 await screen.findByText('当前无待处理事项');await act(async()=>resolve(json(dto)));expect(screen.queryByText('王女士')).toBeNull();
});
it('ServiceDesk seed barrier rejects old reads until reset data arrives',async()=>{
 const {ServiceDesk}=await import('@/components/psp/ServiceDesk');let stage=0;
 vi.stubGlobal('fetch',vi.fn(()=>Promise.resolve(stage===0?json(dto):stage===1?json({seedVersion:2},409):stage===2?json(dto):json({...dto,seedVersion:2,exceptions:[],enrollments:[]}))));
 render(createElement(ServiceDesk,{projectId:'project'}));await screen.findByRole('link',{name:'进入医生复核'});
 stage=1;fireEvent.click(screen.getByRole('button',{name:'刷新待办'}));await screen.findByText('项目成员暂时无法加载。');
 stage=2;fireEvent.click(screen.getByRole('button',{name:'重新加载'}));await waitFor(()=>expect(screen.queryByRole('link',{name:'进入医生复核'})).toBeNull());
 stage=3;fireEvent.click(screen.getByRole('button',{name:'重新加载'}));await screen.findByText('当前无待处理事项');
});
it('type and overdue controls preserve explicit selection and current filtering',()=>{
 const overdue={...row,id:'questionnaire:a',kind:'overdue_questionnaire' as const,responsibleRole:'case_manager' as const,overdue:true,dueAt:row.sourceAt,displayName:'李女士'};
 render(createElement(ExceptionQueue,{rows:[row,overdue],serverNow:row.sourceAt,role:'doctor',locked:false}));
 fireEvent.change(screen.getByLabelText('事项类型'),{target:{value:'pending_review'}});expect(screen.getByText('王女士')).toBeTruthy();expect(screen.queryByText('李女士')).toBeNull();
 fireEvent.click(screen.getByLabelText('仅看逾期'));expect(screen.getByText('当前筛选下没有事项')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('事项类型'),{target:{value:'all'}});expect(screen.getByText('李女士')).toBeTruthy();expect(screen.queryByText('王女士')).toBeNull();
});
