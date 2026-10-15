// @vitest-environment jsdom
import {createElement} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const project={id:'PSP-1',title:'合成支持项目',sponsor:'虚构药企A',scope:'类别支持',population:'合成成员',startsAt:'2026-09-30T16:00:00.000Z',endsAt:'2026-12-31T15:59:59.000Z',period:'2026-10',cutoffAt:'2026-10-13T02:00:00.000Z',contactTargets:{high:2,medium:24},configVersion:1,status:'active'};
const window={periodStart:project.startsAt,periodEnd:'2026-10-31T16:00:00.000Z',cutoffAt:project.cutoffAt};
const content={title:'固定交付报告',notice:'模板草稿，待人工审核',chapters:['项目范围','数据说明','服务执行','患者反馈','质量与限制','下一期服务安排','审核与交付'].map(title=>({title,paragraphs:['固定保护正文'],facts:title==='服务执行'?[{metricKey:'questionnaire_completion',label:'问卷完成',definition:'固定保护口径',unit:'forms',status:'suppressed',sampleN:999,value:999,numerator:999,denominator:999}]:[]}))};
const report={id:'R1',projectId:project.id,status:'delivered',version:5,seedVersion:1,authorizationVersion:2,authorizationGate:{status:'eligible',reason:null},gate:{status:'available',reason:null},revision:1,window,templateVersion:'psp-report-template-v1',algorithmVersion:'psp-metrics-v1',protectionVersion:'psp-k5-v1',contentDigest:'body-digest',content,nextActions:[],signatures:[{role:'data_reviewer',occurredAt:project.cutoffAt},{role:'medical_reviewer',occurredAt:project.cutoffAt}],delivery:{deliveredAt:project.cutoffAt,artifactDigest:'artifact-digest'},artifact:{text:'固定保护正文',digest:'artifact-digest'}};
const revoked={id:report.id,projectId:project.id,status:'delivered',version:5,seedVersion:1,authorizationVersion:3,authorizationGate:{status:'revoked',reason:'来源授权已撤回'},gate:{status:'revoked',reason:'当前授权已停止此报告访问'}};
const overview=(item:unknown=report,authorizationVersion=2,seedVersion=1)=>({project,allowedMembers:{status:'available',value:14},metrics:[],reports:[item],seedVersion,authorizationVersion,agentMode:'template',serverNow:project.cutoffAt});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const defer=()=>{let resolve!:(r:Response)=>void;const promise=new Promise<Response>(r=>resolve=r);return {promise,resolve};};
async function mount(){const {PharmaReport}=await import('@/components/psp/PharmaReport');return render(createElement(PharmaReport,{projectId:project.id,reportId:report.id}));}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('binds the external read/download to seed, project, report, period and authorization, and retries the exact customer acceptance',async()=>{
 const requests:string[]=[],reads:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){requests.push(options.body as string);return Promise.resolve(json({},503));}reads.push(url);return Promise.resolve(json(url.includes('/reports/')?report:overview()));});await mount();await screen.findByText('固定交付报告');
 const detail=reads.find(url=>url.includes('/reports/'))!,query=new URL(detail,'http://example.test').searchParams;
 expect(Object.fromEntries(query)).toEqual({role:'pharma_owner',actorId:'pharma-owner-a',seedVersion:'1',authorizationVersion:'2',periodStart:window.periodStart,periodEnd:window.periodEnd});expect(detail).toContain('/api/pharma/projects/PSP-1/reports/R1?');
 expect(screen.queryByText(/999/)).toBeNull();expect(screen.getByText('已保护 · 不展示精确结果')).toBeTruthy();
 const link=screen.getByRole('link',{name:'下载固定文本'}) as HTMLAnchorElement;expect(new URL(link.href).searchParams.get('format')).toBe('text');
 fireEvent.change(screen.getByLabelText('客户意见'),{target:{value:'  已核对服务范围  '}});fireEvent.click(screen.getByRole('button',{name:'验收此版本'}));await screen.findByRole('button',{name:'重试同一次操作'});
 expect(JSON.parse(requests[0])).toMatchObject({action:'accept',comment:'已核对服务范围',meta:{expectedVersion:5,seedVersion:1,role:'pharma_owner',actorId:'pharma-owner-a'}});expect(screen.getByLabelText('客户意见').matches(':disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'重试同一次操作'}));await waitFor(()=>expect(requests).toHaveLength(2));expect(requests[1]).toBe(requests[0]);
});
it('requires a customer change reason and keeps feedback outside the fixed delivered body',async()=>{
 const requests:string[]=[];let current=report;vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){requests.push(options.body as string);current={...report,status:'client_changes_requested',version:6,...{feedback:{action:'request_changes',occurredAt:project.cutoffAt,comment:'请补充安排'}}};return Promise.resolve(json({}));}return Promise.resolve(json(url.includes('/reports/')?current:overview(current)));});await mount();await screen.findByText('固定交付报告');
 expect(screen.getByRole('button',{name:'请求修改'}).matches(':disabled')).toBe(true);fireEvent.change(screen.getByLabelText('客户意见'),{target:{value:'  请补充安排  '}});fireEvent.click(screen.getByRole('button',{name:'请求修改'}));await waitFor(()=>expect(requests).toHaveLength(1));expect(JSON.parse(requests[0])).toMatchObject({action:'request_changes',reason:'请补充安排'});await screen.findByText('请补充安排',{selector:'p'});expect(screen.getByTestId('psp-pharma-report-content').textContent).not.toContain('请补充安排');expect(screen.getByRole('button',{name:'验收此版本'}).matches(':disabled')).toBe(true);
});
it('a newer overview gate hides existing content and links before an older detail response arrives',async()=>{
 const delayed=defer();let detailReads=0,withdrawn=false;
 vi.stubGlobal('fetch',(url:string)=>url.includes('/reports/')?(++detailReads===2?delayed.promise:Promise.resolve(json(report))):Promise.resolve(json(withdrawn?overview(revoked,3):overview())));await mount();await screen.findByText('固定交付报告');
 fireEvent.click(screen.getByRole('button',{name:'刷新当前报告内容'}));await waitFor(()=>expect(detailReads).toBe(2));withdrawn=true;fireEvent.click(screen.getByRole('button',{name:'刷新交付报告'}));await screen.findByText('当前授权已停止此报告访问');expect(screen.queryByText('固定交付报告')).toBeNull();expect(screen.queryByRole('link',{name:'下载固定文本'})).toBeNull();
 await act(async()=>delayed.resolve(json(report)));expect(screen.queryByText('固定交付报告')).toBeNull();expect(screen.getByText('当前授权已停止此报告访问')).toBeTruthy();
});
it('a structured stale-authorization read clears content and refreshes the parent gate',async()=>{
 let withdrawn=false;
 vi.stubGlobal('fetch',(url:string)=>Promise.resolve(url.includes('/reports/')?(withdrawn?json({code:'stale_authorization',seedVersion:1,authorizationVersion:3},409):json(report)):json(withdrawn?overview(revoked,3):overview())));await mount();await screen.findByText('固定交付报告');withdrawn=true;fireEvent.click(screen.getByRole('button',{name:'刷新当前报告内容'}));await screen.findByText('当前授权已停止此报告访问');expect(screen.queryByText('固定交付报告')).toBeNull();expect(screen.queryByRole('button',{name:'验收此版本'})).toBeNull();
});
it('switching report identity clears the previous body while the new scope is loading',async()=>{
 const next=defer();vi.stubGlobal('fetch',(url:string)=>url.includes('/reports/')?Promise.resolve(json(report)):url.includes('PSP-2')?next.promise:Promise.resolve(json(overview())));const view=await mount();await screen.findByText('固定交付报告');const {PharmaReport}=await import('@/components/psp/PharmaReport');view.rerender(createElement(PharmaReport,{projectId:'PSP-2',reportId:'R2'}));expect(screen.queryByText('固定交付报告')).toBeNull();expect(screen.queryByRole('link',{name:'下载固定文本'})).toBeNull();
});
it('failed feedback with newer authorization hides content and downloads while the parent gate refresh is pending',async()=>{
 const parent=defer();let posted=false,overviewReads=0;
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){posted=true;return Promise.resolve(json({code:'source_unusable',seedVersion:1,authorizationVersion:3},403));}if(url.includes('/reports/'))return Promise.resolve(json(report));overviewReads++;return posted?parent.promise:Promise.resolve(json(overview()));});
 await mount();await screen.findByText('固定交付报告');fireEvent.click(screen.getByRole('button',{name:'验收此版本'}));await waitFor(()=>expect(overviewReads).toBe(2));
 expect(screen.queryByText('固定交付报告')).toBeNull();expect(screen.queryByRole('link',{name:'下载固定文本'})).toBeNull();expect(screen.queryByRole('button',{name:'验收此版本'})).toBeNull();expect(screen.queryByRole('button',{name:'重试同一次操作'})).toBeNull();
 await act(async()=>parent.resolve(json(overview(revoked,3))));await screen.findByText('当前授权已停止此报告访问');
});

it.each([
 {source:'failed feedback',barrier:{seedVersion:1,authorizationVersion:3},recover:{seedVersion:1,authorizationVersion:3}},
 {source:'failed feedback',barrier:{seedVersion:2,authorizationVersion:1},recover:{seedVersion:3,authorizationVersion:1}},
 {source:'detail read',barrier:{seedVersion:1,authorizationVersion:3},recover:{seedVersion:1,authorizationVersion:3}},
 {source:'detail read',barrier:{seedVersion:2,authorizationVersion:1},recover:{seedVersion:3,authorizationVersion:1}},
])('retains $source barrier $barrier through failed parent refresh and rejects remount until $recover',async({source,barrier,recover})=>{
 let phase='initial',overviewReads=0,detailReads=0;
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){phase='parent-error';return Promise.resolve(json({...barrier,code:'source_unusable'},403));}
  if(url.includes('/reports/')){detailReads++;return Promise.resolve(json(phase==='observe'?{...report,...barrier}:phase==='recover'?{...report,...recover}:report));}
  overviewReads++;return Promise.resolve(phase==='parent-error'||phase==='observe'?json({},503):json(phase==='recover'?overview({...report,...recover},recover.authorizationVersion,recover.seedVersion):overview()));
 });
 await mount();await screen.findByText('固定交付报告');
 if(source==='detail read'){phase='observe';fireEvent.click(screen.getByRole('button',{name:'刷新当前报告内容'}));}
 else fireEvent.click(screen.getByRole('button',{name:'验收此版本'}));
 await screen.findByText('加载失败（503），请重试。');expect(overviewReads).toBe(2);
 const readsBeforeStale=detailReads;phase='stale';
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'刷新交付报告'}));});
 expect(overviewReads).toBe(3);expect(detailReads).toBe(readsBeforeStale);
 expect(screen.queryByTestId('psp-pharma-report-content')).toBeNull();expect(screen.queryByRole('link',{name:'下载固定文本'})).toBeNull();expect(screen.queryByRole('button',{name:'验收此版本'})).toBeNull();
 phase='recover';fireEvent.click(screen.getByRole('button',{name:'刷新交付报告'}));await screen.findByText('固定交付报告');
 expect(screen.getByTestId('psp-pharma-report-content')).toBeTruthy();
 const link=screen.getByRole('link',{name:'下载固定文本'}) as HTMLAnchorElement;expect(new URL(link.href).searchParams.get('seedVersion')).toBe(String(recover.seedVersion));expect(new URL(link.href).searchParams.get('authorizationVersion')).toBe(String(recover.authorizationVersion));
});
it.each(['project','report'])('retires a parent barrier when switching the %s visit',async mode=>{
 let failed=false;
 const next={...report,id:mode==='report'?'R2':report.id,projectId:mode==='project'?'PSP-2':project.id};
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){failed=true;return Promise.resolve(json({seedVersion:2,authorizationVersion:1},403));}
  const isNext=url.includes(mode==='project'?'PSP-2':'/reports/R2');
  if(url.includes('/reports/'))return Promise.resolve(json(isNext?next:report));
  if(!failed)return Promise.resolve(json(overview()));
  return Promise.resolve(url.includes('PSP-2')||mode==='report'?json(overview(next)):json({},503));
 });
 const view=await mount();await screen.findByText('固定交付报告');fireEvent.click(screen.getByRole('button',{name:'验收此版本'}));
 if(mode==='project')await screen.findByText('加载失败（503），请重试。');else await waitFor(()=>expect(screen.queryByTestId('psp-pharma-report-content')).toBeNull());
 const {PharmaReport}=await import('@/components/psp/PharmaReport');view.rerender(createElement(PharmaReport,{projectId:next.projectId,reportId:next.id}));
 await screen.findByText('固定交付报告');expect(screen.getByRole('link',{name:'下载固定文本'}).getAttribute('href')).toContain(`/projects/${next.projectId}/reports/${next.id}/`);
});
