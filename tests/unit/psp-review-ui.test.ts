// @vitest-environment jsdom
import {createElement} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const project={id:'PSP-1',title:'合成支持项目',sponsor:'虚构药企A',scope:'类别支持',population:'合成成员',startsAt:'2026-09-30T16:00:00.000Z',endsAt:'2026-12-31T15:59:59.000Z',period:'2026-10',cutoffAt:'2026-10-13T02:00:00.000Z',contactTargets:{high:2,medium:24},configVersion:1,status:'active'};
const window={periodStart:project.startsAt,periodEnd:'2026-10-31T16:00:00.000Z',cutoffAt:project.cutoffAt};
const content={title:'固定报告',notice:'模板草稿，待人工审核',chapters:['项目范围','数据说明','服务执行','患者反馈','质量与限制','下一期服务安排','审核与交付'].map((title,i)=>({id:`chapter-${i+1}`,title,paragraphs:['固定正文'],facts:[]}))};
const report={id:'R1',projectId:project.id,seedVersion:1,batchId:'B1',revision:1,snapshotId:'S1',snapshotDigest:'snapshot-digest',window,templateVersion:'psp-report-template-v1',algorithmVersion:'psp-metrics-v1',protectionVersion:'psp-k5-v1',content,factIds:[],nextActions:[],contentDigest:'immutable-digest',createdAt:project.cutoffAt,createdBy:'project-manager-psp',creationLedgerRevision:12,status:'draft',version:1};
const workflow={status:'draft',label:'模板草稿，待人工审核',submission:null,dataReview:null,medicalReview:null,returnReview:null,missingReviews:['data','medical'],history:[],delivery:null,acceptance:null};
const gates={canSubmit:true,canApprove:false,canReturn:false,canRevise:true,reviewKind:null,submitReason:null,reviewReason:'请先提交报告',reviseReason:null};
const detail={report,workflow,actionGates:gates,createGate:{canCreate:true,reason:null},warnings:[],seedVersion:1,ledgerRevision:20,serverNow:project.cutoffAt};
const list={project,seedVersion:1,ledgerRevision:20,serverNow:project.cutoffAt,draftGates:[{snapshotId:'S1',canCreate:true,reason:null},{snapshotId:'S1',parentVersionId:'R1',canCreate:true,reason:null}],summaries:[report]};
const snapshots={...list,summaries:[{id:'S1',projectId:project.id,window,createdAt:project.cutoffAt,createdBy:'project-manager-psp',sourceLedgerRevision:11}],authorizationVersion:2};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
const read=(url:string,value:unknown=detail)=>url.includes('/snapshots?')?snapshots:url.includes('/api/psp/reports/')?value:list;
async function mount(){const {ReportDraftDesk}=await import('@/components/psp/ReportDraftDesk');render(createElement(ReportDraftDesk,{projectId:project.id,initialSnapshotId:'S1',initialReportId:'R1'}));await screen.findByText('正文摘要：immutable-digest');}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('PM submits the selected report using report CAS while all other write controls lock on 503',async()=>{
 const bodies:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){expect(url).toBe('/api/psp/reports/R1/actions');bodies.push(options.body as string);return Promise.resolve(json({},503));}return Promise.resolve(json(read(url)));});await mount();fireEvent.click(await screen.findByRole('button',{name:'提交报告审核'}));await screen.findByRole('button',{name:'重试同一次操作'});expect(JSON.parse(bodies[0])).toMatchObject({action:'submit',meta:{expectedVersion:1,seedVersion:1,role:'project_manager',actorId:'project-manager-psp'}});expect(screen.getByLabelText('用于报告的冻结快照').matches(':disabled')).toBe(true);expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(true);expect(screen.getByRole('button',{name:'以此版本创建修订'}).matches(':disabled')).toBe(true);fireEvent.click(screen.getByRole('button',{name:'重试同一次操作'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[1]).toBe(bodies[0]);
});
it('data reviewer approves own kind and uses the report version rather than project ledger',async()=>{
 const bodies:string[]=[];const value={...detail,report:{...report,status:'in_review',version:3},workflow:{...workflow,status:'in_review',label:'审核中',missingReviews:['data']},actionGates:{...gates,canSubmit:false,canApprove:true,canReturn:true,canRevise:false,reviewKind:'data',reviewReason:null}};vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>options?.method==='POST'?(bodies.push(options.body as string),Promise.resolve(json({},503))):Promise.resolve(json(read(url,value))));await mount();fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'data_reviewer'}});fireEvent.click(await screen.findByRole('button',{name:'通过数据审核'}));await waitFor(()=>expect(bodies).toHaveLength(1));expect(JSON.parse(bodies[0])).toMatchObject({action:'review',kind:'data',decision:'approve',meta:{expectedVersion:3,role:'data_reviewer',actorId:'data-reviewer-psp'}});expect(JSON.parse(bodies[0])).not.toHaveProperty('reason');
});
it('medical return needs a nonblank reason, trims it, and keeps it out of fixed content',async()=>{
 const bodies:string[]=[];const value={...detail,report:{...report,status:'in_review',version:2},workflow:{...workflow,status:'in_review',label:'审核中'},actionGates:{...gates,canSubmit:false,canApprove:true,canReturn:true,canRevise:false,reviewKind:'medical',reviewReason:null}};vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>options?.method==='POST'?(bodies.push(options.body as string),Promise.resolve(json({},503))):Promise.resolve(json(read(url,value))));await mount();fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'medical_reviewer'}});const reason=await screen.findByLabelText('退回理由');fireEvent.change(reason,{target:{value:'  '}});expect(screen.getByRole('button',{name:'退回补充'}).matches(':disabled')).toBe(true);fireEvent.change(reason,{target:{value:'  请补充下一期逾期事项的行动说明  '}});fireEvent.click(screen.getByRole('button',{name:'退回补充'}));await waitFor(()=>expect(bodies).toHaveLength(1));expect(JSON.parse(bodies[0])).toMatchObject({action:'review',kind:'medical',decision:'return',reason:'请补充下一期逾期事项的行动说明'});expect(screen.getByTestId('psp-report-content').textContent).not.toContain('逾期事项的行动说明');expect(reason.matches(':disabled')).toBe(true);
});
it('review conflict requires acknowledgement of fresh report version and also locks draft creation',async()=>{
 let version=1;const bodies:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);version=2;return Promise.resolve(json({},409));}return Promise.resolve(json(read(url,{...detail,report:{...report,version}})));});await mount();fireEvent.click(await screen.findByRole('button',{name:'提交报告审核'}));await screen.findByRole('button',{name:'已核对最新审核状态，继续'});expect(screen.getByRole('button',{name:'提交报告审核'}).matches(':disabled')).toBe(true);expect(screen.getByLabelText('用于报告的冻结快照').matches(':disabled')).toBe(true);fireEvent.click(screen.getByRole('button',{name:'已核对最新审核状态，继续'}));fireEvent.click(screen.getByRole('button',{name:'提交报告审核'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(JSON.parse(bodies[1]).meta.expectedVersion).toBe(2);expect(JSON.parse(bodies[1]).meta.clientRequestId).not.toBe(JSON.parse(bodies[0]).meta.clientRequestId);
 await screen.findByRole('button',{name:'已核对最新审核状态，继续'});
 for(const label of ['用于报告的冻结快照','父版本（留空为初稿）','选择报告版本'])expect(screen.getByLabelText(label).matches(':disabled')).toBe(true);
 for(const name of ['提交报告审核','生成模板草稿','添加下一期安排','以此版本创建修订'])expect(screen.getByRole('button',{name}).matches(':disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'已核对最新审核状态，继续'}));
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(false);
});
it('role switch discards a delayed review response and clears its pending write',async()=>{
 let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>options?.method==='POST'?new Promise<Response>(r=>{resolve=r;}):Promise.resolve(json(read(url))));await mount();fireEvent.click(await screen.findByRole('button',{name:'提交报告审核'}));fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'medical_reviewer'}});await screen.findByText('医学审核者 · 草稿安排只读');await act(async()=>resolve(json({},503)));expect(screen.queryByRole('button',{name:'重试同一次操作'})).toBeNull();expect(screen.queryByRole('button',{name:'提交报告审核'})).toBeNull();
});

it('current return and retained signatures are outside the fixed report body',async()=>{
 const event={id:'A1',actorId:'data-reviewer-psp',recordedAt:project.cutoffAt,submittedVersion:2,submissionId:'SUB1'};
 const value={...detail,report:{...report,status:'changes_requested',version:4},workflow:{...workflow,status:'changes_requested',label:'已退回，待修订',submission:{...event,id:'SUB1',revision:1},dataReview:{...event,kind:'data',decision:'approve'},returnReview:{...event,kind:'medical',decision:'return',actorId:'medical-reviewer-psp',reason:'请补充下一期逾期事项的行动说明'},missingReviews:['medical']},actionGates:{...gates,canSubmit:false,submitReason:'请先创建修订版'}};
 vi.stubGlobal('fetch',(url:string)=>Promise.resolve(json(read(url,value))));await mount();expect(screen.getByTestId('psp-report-workflow').textContent).toContain('data-reviewer-psp');expect(screen.getByTestId('psp-report-workflow').textContent).toContain('请补充下一期逾期事项的行动说明');expect(screen.getByTestId('psp-report-content').textContent).not.toContain('data-reviewer-psp');expect(screen.getByTestId('psp-report-content').textContent).not.toContain('逾期事项');
});

it('requires a fresh acknowledgement after medical approves then returns during two data-review races',async()=>{
 let version=2;let posts=0;
 const value=()=>({...detail,report:{...report,status:version===4?'changes_requested':'in_review',version},workflow:{...workflow,status:version===4?'changes_requested':'in_review',label:version===4?'已退回，待修订':'审核中',missingReviews:['data']},actionGates:{...gates,canSubmit:false,canApprove:version<4,canReturn:version<4,canRevise:false,reviewKind:'data',reviewReason:version===4?'仅审核中的报告可签署或退回':null}});
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){posts++;version++;return Promise.resolve(json({},409));}return Promise.resolve(json(read(url,value())));});
 await mount();fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'data_reviewer'}});
 fireEvent.click(await screen.findByRole('button',{name:'通过数据审核'}));
 fireEvent.click(await screen.findByRole('button',{name:'已核对最新审核状态，继续'}));
 fireEvent.click(screen.getByRole('button',{name:'通过数据审核'}));
 await waitFor(()=>expect(posts).toBe(2));
 await screen.findByText('当前报告操作版本：4。提交及审核核对这个版本；创建修订继续使用项目账版本。');
 expect(screen.queryByRole('button',{name:'已核对最新审核状态，继续'})).not.toBeNull();
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(true);
 expect(screen.getByRole('button',{name:'通过数据审核'}).matches(':disabled')).toBe(true);
 expect(screen.getByLabelText('退回理由').matches(':disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'已核对最新审核状态，继续'}));
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(false);
 expect(screen.getByRole('button',{name:'通过数据审核'}).matches(':disabled')).toBe(true);
});

it('retains the review lock when the mandatory 409 refresh fails',async()=>{
 let posts=0,recover=false;
 const value={...detail,report:{...report,status:'in_review',version:2},workflow:{...workflow,status:'in_review',label:'审核中'},actionGates:{...gates,canSubmit:false,canApprove:true,canReturn:true,canRevise:false,reviewKind:'data',reviewReason:null}};
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){posts++;return Promise.resolve(json({},409));}
  if(posts&&!recover&&url.includes('/api/psp/reports/'))return Promise.resolve(json({},503));
  return Promise.resolve(json(read(url,value)));
 });
 await mount();fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'data_reviewer'}});
 fireEvent.click(await screen.findByRole('button',{name:'通过数据审核'}));
 await screen.findByText('加载失败（503），请重试。');
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(true);
 expect(screen.getByRole('button',{name:'通过数据审核'}).matches(':disabled')).toBe(true);
 const ack=screen.getByRole('button',{name:'已核对最新审核状态，继续'});expect(ack.matches(':disabled')).toBe(true);
 recover=true;fireEvent.click(screen.getByRole('button',{name:'刷新审核状态'}));
 await waitFor(()=>expect(ack.matches(':disabled')).toBe(false));
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(true);
 fireEvent.click(ack);expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(false);
});

it('cannot acknowledge the stale report while the mandatory 409 refresh is pending',async()=>{
 let posted=false;let resolve!:(response:Response)=>void;
 const value=(version:number)=>({...detail,report:{...report,status:'in_review',version},workflow:{...workflow,status:'in_review',label:'审核中'},actionGates:{...gates,canSubmit:false,canApprove:true,canReturn:true,canRevise:false,reviewKind:'data',reviewReason:null}});
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){posted=true;return Promise.resolve(json({},409));}
  if(posted&&url.includes('/api/psp/reports/'))return new Promise<Response>(r=>{resolve=r;});
  return Promise.resolve(json(read(url,value(2))));
 });
 await mount();fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'data_reviewer'}});
 fireEvent.click(await screen.findByRole('button',{name:'通过数据审核'}));
 const ack=await screen.findByRole('button',{name:'已核对最新审核状态，继续'});
 expect(screen.getByText('当前报告操作版本：2。提交及审核核对这个版本；创建修订继续使用项目账版本。')).not.toBeNull();
 expect(ack.matches(':disabled')).toBe(true);fireEvent.click(ack);
 await act(async()=>resolve(json(value(3))));
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(true);
 expect(screen.queryByRole('button',{name:'已核对最新审核状态，继续'})).not.toBeNull();
});

it.each([503,409])('detail action %s locks report row navigation until recovery',async(status)=>{
 let first=true;vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){const code=first?status:200;first=false;return Promise.resolve(json({},code));}return Promise.resolve(json(read(url)));});
 await mount();fireEvent.click(screen.getByRole('button',{name:'提交报告审核'}));const recovery=await screen.findByRole('button',{name:status===503?'重试同一次操作':'已核对最新审核状态，继续'});
 expect(screen.queryByRole('link',{name:'打开修订 1'})).toBeNull();expect(screen.getByRole('button',{name:'打开修订 1'}).matches(':disabled')).toBe(true);
 await waitFor(()=>expect(recovery.matches(':disabled')).toBe(false));fireEvent.click(recovery);await screen.findByRole('link',{name:'打开修订 1'});
});

it('retains a manually selected report through role switch and retires the old role request',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',(url:string)=>{calls.push(url);return Promise.resolve(json(read(url)));});
 const {ReportDraftDesk}=await import('@/components/psp/ReportDraftDesk');render(createElement(ReportDraftDesk,{projectId:project.id}));fireEvent.change(await screen.findByLabelText('选择报告版本'),{target:{value:'R1'}});await screen.findByText('正文摘要：immutable-digest');
 fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'data_reviewer'}});await screen.findByText('数据审核者 · 草稿安排只读');await screen.findByText('正文摘要：immutable-digest');expect((screen.getByLabelText('选择报告版本') as HTMLSelectElement).value).toBe('R1');expect(calls.some(url=>url.includes('/reports/R1?role=data_reviewer'))).toBe(true);
});
it('failed read hides comparison and sources but preserves exact pending 503 retry',async()=>{
 let fail=false;const bodies:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return Promise.resolve(json({},503));}return Promise.resolve(fail&&url.includes('/api/psp/reports/')?json({},503):json(read(url,{...detail,revisionComparison:{status:'initial'}})));});
 await mount();fireEvent.click(screen.getByRole('button',{name:'提交报告审核'}));await screen.findByRole('button',{name:'重试同一次操作'});fail=true;fireEvent.click(screen.getByRole('button',{name:'刷新审核状态'}));await screen.findByText('加载失败（503），请重试。');expect(screen.queryByTestId('psp-report-revision-review')).toBeNull();expect(screen.queryByTestId('psp-report-content')).toBeNull();expect(screen.queryByLabelText('选择报告指标的内部来源')).toBeNull();expect(screen.getByRole('button',{name:'提交报告审核'}).matches(':disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'重试同一次操作'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[0]).toBe(bodies[1]);
});
it('list read failure suppresses comparison and keeps exact pending report retry ownership',async()=>{
 let fail=false;const bodies:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return Promise.resolve(json({},503));}return Promise.resolve(fail&&url.includes('/projects/')&&url.includes('/reports?')?json({},403):json(read(url,{...detail,revisionComparison:{status:'initial'}})));});
 await mount();expect(screen.getByTestId('psp-report-revision-review')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'提交报告审核'}));await screen.findByRole('button',{name:'重试同一次操作'});fail=true;fireEvent.click(screen.getByRole('button',{name:'刷新报告状态'}));await screen.findByText('加载失败（403），请重试。');expect(screen.queryByTestId('psp-report-revision-review')).toBeNull();expect(screen.queryByTestId('psp-report-content')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'重试同一次操作'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[0]).toBe(bodies[1]);
});
it('snapshot read failure disables creation without leaving a stale review pack visible',async()=>{
 let fail=false;vi.stubGlobal('fetch',(url:string)=>Promise.resolve(fail&&url.includes('/snapshots?')?json({},503):json(read(url,{...detail,revisionComparison:{status:'initial'}}))));await mount();fail=true;fireEvent.click(screen.getByRole('button',{name:'刷新报告状态'}));await waitFor(()=>expect(screen.queryByTestId('psp-report-revision-review')).toBeNull());expect(screen.getByRole('button',{name:'生成模板草稿'}).matches(':disabled')).toBe(true);expect(screen.getByText('加载失败（503），请重试。')).toBeTruthy();expect(screen.getByText('冻结快照读取失败，请点击“刷新报告状态”重新读取；成功后再核对报告与创建条件。')).toBeTruthy();fail=false;fireEvent.click(screen.getByRole('button',{name:'刷新报告状态'}));await screen.findByTestId('psp-report-revision-review');expect(screen.queryByText('加载失败（503），请重试。')).toBeNull();
});

it('starts selected report with review context before metadata and revision/navigation controls',async()=>{
 vi.stubGlobal('fetch',(url:string)=>Promise.resolve(json(read(url,{...detail,revisionComparison:{status:'initial'}}))));await mount();
 const section=screen.getByTestId('psp-report-detail'),pack=screen.getByTestId('psp-report-revision-review');
 expect(section.firstElementChild).toBe(pack);
 const metadata=screen.getByText('正文摘要：immutable-digest').closest('details');expect(metadata).not.toBeNull();expect(metadata?.hasAttribute('open')).toBe(false);
 for(const target of [screen.getByText('正文摘要：immutable-digest'),screen.getByRole('button',{name:'以此版本创建修订'}),screen.getByRole('navigation',{name:'报告章节导航'})])expect(pack.compareDocumentPosition(target)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
