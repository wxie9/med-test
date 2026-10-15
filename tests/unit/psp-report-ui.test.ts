// @vitest-environment jsdom
import {createElement} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {ReportContent,ReportFact,ReportWorkflowMetadata} from '@/lib/psp/reportTypes';
const project={id:'PSP-1',title:'合成支持项目',sponsor:'虚构药企A',scope:'治疗类别支持',population:'合成成员',startsAt:'2026-09-30T16:00:00.000Z',endsAt:'2026-12-31T15:59:59.000Z',period:'2026-10',cutoffAt:'2026-10-13T02:00:00.000Z',contactTargets:{high:2,medium:24},configVersion:1,status:'active'};
const window={periodStart:project.startsAt,periodEnd:'2026-10-31T16:00:00.000Z',cutoffAt:project.cutoffAt};
const fact:ReportFact={id:'S1:aggregate:contact_completion',metricKey:'contact_completion',label:'到期计划联系成功率',definition:'固定保护口径',unit:'assignments',status:'available',value:8/14,numerator:8,denominator:14,sampleN:14};
const hidden:ReportFact={...fact,id:'S1:aggregate:questionnaire_completion',metricKey:'questionnaire_completion',label:'到期问卷完成率',status:'suppressed',value:999,numerator:1999,denominator:2999,sampleN:3999};
const content:ReportContent={title:'项目服务阶段报告',notice:'模板草稿，待人工审核',chapters:['项目范围','数据说明','服务执行','患者反馈','质量与限制','下一期服务安排','审核与交付'].map((title,index)=>({id:`chapter-${index+1}`,title,paragraphs:[index===5?'下一期服务安排尚未补充，待人工审核':`固定第${index+1}章`],facts:index===2?[fact,hidden]:[]}))};
const report={id:'R1',projectId:'PSP-1',seedVersion:1,batchId:'B1',revision:1,snapshotId:'S1',snapshotDigest:'snapshot-digest',window,templateVersion:'psp-report-template-v1',algorithmVersion:'psp-metrics-v1',protectionVersion:'psp-k5-v1',content,factIds:[fact.id,hidden.id],nextActions:[],contentDigest:'body-digest',createdAt:project.cutoffAt,createdBy:'project-manager-psp',creationLedgerRevision:12,status:'draft',version:1};
const summary={id:'R1',projectId:'PSP-1',batchId:'B1',revision:1,snapshotId:'S1',window,createdAt:project.cutoffAt,createdBy:'project-manager-psp',status:'draft',contentDigest:'body-digest'};
const list={project,seedVersion:1,ledgerRevision:12,serverNow:project.cutoffAt,draftGates:[{snapshotId:'S1',canCreate:true,reason:null},{snapshotId:'S1',parentVersionId:'R1',canCreate:true,reason:null}],summaries:[summary]};
const snapshots={project,seedVersion:1,ledgerRevision:12,serverNow:project.cutoffAt,authorizationVersion:2,summaries:[{id:'S1',projectId:'PSP-1',window,createdAt:project.cutoffAt,createdBy:'project-manager-psp',sourceLedgerRevision:11}]};
const workflow:ReportWorkflowMetadata={status:'draft',label:'模板草稿，待人工审核',submission:null,dataReview:null,medicalReview:null,returnReview:null,missingReviews:['data','medical'],history:[],delivery:null,acceptance:null,clientFeedback:null};
const detail={report,workflow,createGate:{canCreate:true,reason:null},warnings:['下一期服务安排尚未补充，待人工审核'],seedVersion:1,ledgerRevision:12,serverNow:project.cutoffAt};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function response(url:string){return url.includes('/snapshots?')?snapshots:url.includes('/api/psp/reports/')?detail:list;}
async function mount(props={}){const {ReportDraftDesk}=await import('@/components/psp/ReportDraftDesk');return render(createElement(ReportDraftDesk,{projectId:'PSP-1',initialSnapshotId:'S1',...props}));}
it('creates only explicitly and preserves the empty-action draft and exact 503 request through refresh',async()=>{
 let ledger=12;const bodies:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return Promise.resolve(json({},503));}return Promise.resolve(json({...response(url),ledgerRevision:ledger}));});await mount();await screen.findByRole('button',{name:'生成模板草稿'});expect(bodies).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'生成模板草稿'}));await screen.findByRole('button',{name:'重试同一次操作'});
 expect(JSON.parse(bodies[0])).toMatchObject({snapshotId:'S1',nextActions:[],meta:{seedVersion:1,expectedVersion:12,actorId:'project-manager-psp',role:'project_manager'}});expect(screen.getByLabelText('用于报告的冻结快照').matches(':disabled')).toBe(true);ledger=13;fireEvent.click(screen.getByRole('button',{name:'刷新报告状态'}));await screen.findByText(/当前项目账版本：13/);fireEvent.click(screen.getByRole('button',{name:'重试同一次操作'}));await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[1]).toBe(bodies[0]);
});
it('409 refresh requires explicit review before creating another request',async()=>{
 let posts=0;vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){posts++;return Promise.resolve(json({},409));}return Promise.resolve(json(response(url)));});await mount();fireEvent.click(await screen.findByRole('button',{name:'生成模板草稿'}));await screen.findByRole('button',{name:'已核对最新报告与项目账，继续'});expect(posts).toBe(1);expect(screen.getByLabelText('用于报告的冻结快照').matches(':disabled')).toBe(true);fireEvent.click(screen.getByRole('button',{name:'已核对最新报告与项目账，继续'}));expect(screen.getByLabelText('用于报告的冻结快照').matches(':disabled')).toBe(false);
});
it('arrangements use fixed roles and explicit Shanghai dates without free text or patient fields',async()=>{
 const bodies:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return Promise.resolve(json({},503));}return Promise.resolve(json(response(url)));});await mount();fireEvent.click(await screen.findByRole('button',{name:'添加下一期安排'}));fireEvent.change(screen.getByLabelText('安排1：类别'),{target:{value:'medical_review'}});expect((screen.getByLabelText('安排1：负责角色') as HTMLSelectElement).value).toBe('doctor');expect(within(screen.getByLabelText('安排1：负责角色')).queryByRole('option',{name:'个案管理师'})).toBeNull();fireEvent.change(screen.getByLabelText('安排1：上海时间'),{target:{value:'2026-10-15T10:30'}});fireEvent.click(screen.getByRole('button',{name:'生成模板草稿'}));await waitFor(()=>expect(bodies).toHaveLength(1));const body=JSON.parse(bodies[0]);expect(body.nextActions).toEqual([{category:'medical_review',responsibleRole:'doctor',dueAt:'2026-10-15T02:30:00.000Z',status:'planned'}]);expect(screen.queryByRole('textbox')).toBeNull();expect(bodies[0]).not.toMatch(/patientId|name|internalNote/);
});
it('both staff reviewer roles read only and changing role drops an old unknown write response',async()=>{
 let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>options?.method==='POST'?new Promise<Response>(r=>{resolve=r;}):Promise.resolve(json(response(url))));await mount();fireEvent.click(await screen.findByRole('button',{name:'生成模板草稿'}));fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'data_reviewer'}});await screen.findByText('数据审核者 · 草稿安排只读');await act(async()=>resolve(json({},503)));expect(screen.queryByRole('button',{name:'重试同一次操作'})).toBeNull();expect(screen.queryByRole('button',{name:'生成模板草稿'})).toBeNull();fireEvent.change(screen.getByLabelText('报告工作身份'),{target:{value:'medical_reviewer'}});await screen.findByText('医学审核者 · 草稿安排只读');
});
it('shows seven protected chapters with separate truthful workflow metadata and no hidden numbers',async()=>{
 const {ReportPreview}=await import('@/components/psp/ReportPreview');render(createElement(ReportPreview,{content,workflow}));const body=screen.getByTestId('psp-report-content');expect(within(body).getAllByRole('heading',{level:3}).map(node=>node.textContent)).toEqual(content.chapters.map(chapter=>chapter.title));expect(within(body).getByText('8 / 14')).toBeTruthy();const row=within(body).getByTestId('psp-report-fact-questionnaire_completion');expect(row.textContent).toContain('已保护');expect(row.textContent).not.toMatch(/999|1999|2999|3999/);expect(within(body).queryByText('未签署')).toBeNull();const metadata=screen.getByTestId('psp-report-workflow');expect(metadata.textContent).toContain('尚未签署');expect(metadata.textContent).toContain('尚未交付');expect(metadata.textContent).toContain('尚未验收');expect(screen.queryByRole('button',{name:/批准|交付|提交审核/})).toBeNull();
});
it('revisions take an explicit parent and preserve the original report body',async()=>{
 const bodies:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return Promise.resolve(json({},503));}return Promise.resolve(json(response(url)));});await mount({initialReportId:'R1'});fireEvent.click(await screen.findByRole('button',{name:'以此版本创建修订'}));expect((screen.getByLabelText('父版本（留空为初稿）') as HTMLSelectElement).value).toBe('R1');fireEvent.click(screen.getByRole('button',{name:'生成模板草稿'}));await waitFor(()=>expect(bodies).toHaveLength(1));expect(JSON.parse(bodies[0])).toMatchObject({parentVersionId:'R1',snapshotId:'S1',nextActions:[]});expect(screen.getByText('正文摘要：body-digest')).toBeTruthy();
});
it('source withdrawal keeps old draft readable and explains why a new revision is blocked',async()=>{
 vi.stubGlobal('fetch',(url:string)=>Promise.resolve(json(url.includes('/api/psp/reports/')?{...detail,createGate:{canCreate:false,reason:'该快照汇总来源已失效，请选择新的可用快照'}}:response(url))));await mount({initialReportId:'R1'});await screen.findByText('该快照汇总来源已失效，请选择新的可用快照');expect(screen.getByRole('button',{name:'以此版本创建修订'}).matches(':disabled')).toBe(true);expect(screen.getByTestId('psp-report-content').textContent).toContain('8 / 14');
});
it('a changed seed clears report selection and pending retry',async()=>{
 let seed=1;vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?json({},503):json({...response(url),seedVersion:seed,...(url.includes('/reports?')?{summaries:seed===1?[summary]:[]}:{})})));await mount();fireEvent.click(await screen.findByRole('button',{name:'生成模板草稿'}));await screen.findByRole('button',{name:'重试同一次操作'});seed=2;fireEvent.click(screen.getByRole('button',{name:'刷新报告状态'}));await screen.findByRole('heading',{name:'已保存报告（0）'});expect(screen.getByText('尚无保存的报告。选择冻结快照后可生成第一版。')).not.toBeNull();expect(screen.queryByRole('button',{name:'重试同一次操作'})).toBeNull();expect((screen.getByLabelText('选择报告版本') as HTMLSelectElement).value).toBe('');expect(screen.queryByTestId('psp-report-content')).toBeNull();
});
it('switching selected reports discards a delayed old report response',async()=>{
 let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',(url:string)=>url.includes('/api/psp/reports/R1?')?new Promise<Response>(r=>{resolve=r;}):Promise.resolve(json(url.includes('/api/psp/reports/R2?')?{...detail,report:{...report,id:'R2',revision:2,contentDigest:'new-digest'}}:url.includes('/reports?')?{...list,summaries:[summary,{...summary,id:'R2',revision:2}]}:response(url))));await mount();fireEvent.change(await screen.findByLabelText('选择报告版本'),{target:{value:'R1'}});fireEvent.change(screen.getByLabelText('选择报告版本'),{target:{value:'R2'}});await screen.findByText('正文摘要：new-digest');await act(async()=>resolve(json(detail)));expect(screen.queryByText('正文摘要：body-digest')).toBeNull();
});

it('does not invent zero when an available report fact is missing its value',async()=>{
 const {ReportPreview}=await import('@/components/psp/ReportPreview');const missing={...fact,value:undefined,numerator:undefined,denominator:undefined};render(createElement(ReportPreview,{content:{...content,chapters:content.chapters.map(chapter=>({...chapter,facts:chapter.id==='chapter-3'?[missing]:[]}))},workflow}));expect(screen.getByTestId('psp-report-fact-contact_completion').textContent).toContain('未知');
});
it('a pending retry also locks the detail revision shortcut',async()=>{
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?json({},503):json(response(url))));await mount({initialReportId:'R1'});fireEvent.click(await screen.findByRole('button',{name:'生成模板草稿'}));await screen.findByRole('button',{name:'重试同一次操作'});expect(screen.getByRole('button',{name:'以此版本创建修订'}).matches(':disabled')).toBe(true);
});

it('revising without edits preserves seconds in an accepted action',async()=>{
 const bodies:string[]=[];const precise={category:'overdue_followup',responsibleRole:'case_manager',dueAt:'2026-10-14T01:00:45.123Z',status:'planned'};
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return Promise.resolve(json({},503));}return Promise.resolve(json(url.includes('/api/psp/reports/')?{...detail,report:{...report,nextActions:[precise]}}:response(url)));});
 await mount({initialReportId:'R1'});fireEvent.click(await screen.findByRole('button',{name:'以此版本创建修订'}));fireEvent.click(screen.getByRole('button',{name:'生成模板草稿'}));await waitFor(()=>expect(bodies).toHaveLength(1));expect(JSON.parse(bodies[0]).nextActions[0].dueAt).toBe(precise.dueAt);
});

it('project draft conflict stays locked after failed refresh and requires acknowledgement after manual recovery',async()=>{
 let posted=false,recover=false;
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){posted=true;return Promise.resolve(json({},409));}
  if(posted&&url.includes('/reports?')&&!recover)return Promise.resolve(json({},503));
  return Promise.resolve(json(response(url)));
 });
 await mount({initialReportId:'R1'});fireEvent.click(await screen.findByRole('button',{name:'生成模板草稿'}));
 await screen.findByText('加载失败（503），请重试。');
 for(const label of ['用于报告的冻结快照','选择报告版本'])expect(screen.getByLabelText(label).matches(':disabled')).toBe(true);
 expect(screen.getByRole('button',{name:'以此版本创建修订'}).matches(':disabled')).toBe(true);
 const ack=screen.getByRole('button',{name:'已核对最新报告与项目账，继续'});expect(ack.matches(':disabled')).toBe(true);
 recover=true;fireEvent.click(screen.getByRole('button',{name:'刷新报告状态'}));
 await waitFor(()=>expect(ack.matches(':disabled')).toBe(false));
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(true);
 fireEvent.click(ack);expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(false);
});
it('project draft cannot acknowledge before conflict refresh and each new conflict requires acknowledgement',async()=>{
 let posts=0;let resolve!:(value:Response)=>void;
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){posts++;return Promise.resolve(json({},409));}
  if(posts&&url.includes('/reports?'))return new Promise<Response>(r=>{resolve=r;});
  return Promise.resolve(json(response(url)));
 });
 await mount({initialReportId:'R1'});fireEvent.click(await screen.findByRole('button',{name:'生成模板草稿'}));
 let ack=await screen.findByRole('button',{name:'已核对最新报告与项目账，继续'});
 expect(ack.matches(':disabled')).toBe(true);fireEvent.click(ack);
 await act(async()=>resolve(json({...list,ledgerRevision:13})));
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(true);
 fireEvent.click(ack);fireEvent.click(screen.getByRole('button',{name:'生成模板草稿'}));
 await waitFor(()=>expect(posts).toBe(2));
 ack=await screen.findByRole('button',{name:'已核对最新报告与项目账，继续'});expect(ack.matches(':disabled')).toBe(true);
 await act(async()=>resolve(json({...list,ledgerRevision:14})));
 expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(true);
 fireEvent.click(ack);expect(screen.getByLabelText('选择报告版本').matches(':disabled')).toBe(false);
});
it('shows report window, frozen snapshot and next-step guidance before selecting detail',async()=>{
 vi.stubGlobal('fetch',(url:string)=>Promise.resolve(json(response(url))));await mount();
 expect(await screen.findByRole('heading',{name:'修订 1 · 模板草稿，待人工审核'})).toBeTruthy();
 expect(screen.getByText('冻结快照：S1')).toBeTruthy();
 expect(screen.getByRole('link',{name:'打开修订 1'}).getAttribute('href')).toContain('role=project_manager');
});

it('server tuple gate blocks draft button and forced submit and fails closed when missing',async()=>{
 let gates=[{snapshotId:'S1',canCreate:false,reason:'请选最新父版本'}];let posts=0;
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){posts++;return Promise.resolve(json({},503));}return Promise.resolve(json(url.includes('/reports?')?{...list,draftGates:gates}:response(url)));});
 await mount();const button=await screen.findByRole('button',{name:'生成模板草稿'});
 expect(button.matches(':disabled')).toBe(true);expect(screen.getByText('请选最新父版本')).toBeTruthy();fireEvent.submit(button.closest('form')!);expect(posts).toBe(0);
 gates=[];fireEvent.click(screen.getByRole('button',{name:'刷新报告状态'}));await screen.findByText('当前快照与父版本组合尚无服务端条件，请刷新列表并重新选择。');expect(button.matches(':disabled')).toBe(true);
});
it.each([503,409])('report row navigation stays locked after %s and recovers only after retry or acknowledgement',async(status)=>{
 let first=true;vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){const code=first?status:200;first=false;return Promise.resolve(json({},code));}return Promise.resolve(json(response(url)));});
 await mount();fireEvent.click(await screen.findByRole('button',{name:'生成模板草稿'}));
 const recovery=await screen.findByRole('button',{name:status===503?'重试同一次操作':'已核对最新报告与项目账，继续'});
 expect(screen.queryByRole('link',{name:'打开修订 1'})).toBeNull();expect(screen.getByRole('button',{name:'打开修订 1'}).matches(':disabled')).toBe(true);expect(screen.getByText('当前操作待完成或核对，暂不能切换报告修订。')).toBeTruthy();
 await waitFor(()=>expect(recovery.matches(':disabled')).toBe(false));fireEvent.click(recovery);await screen.findByRole('link',{name:'打开修订 1'});
});
it.each(['in_review'])('PM guidance for %s uses server delivery reason instead of reviewer-role rejection',async(status)=>{
 const {ReportWorkbenchCards}=await import('@/components/psp/ReportWorkbenchCards');
 render(createElement(ReportWorkbenchCards,{role:'project_manager',summaries:[{...summary,status,workflow:{...workflow,status,label:status},actionGates:{canSubmit:false,canApprove:false,canDeliver:false,reviewReason:'仅数据或医学审核人可审核',deliverReason:'等待服务端双签或客户处理',submitReason:'仅草稿可提交审核'},createGate:{canCreate:false,reason:'当前不可修订'}}] as never}));
 expect(screen.getByText('下一步：等待服务端双签或客户处理')).toBeTruthy();expect(screen.queryByText(/下一步：仅数据或医学/)).toBeNull();
});

it('draft eligibility follows the exact selected snapshot and parent tuple',async()=>{
 const bodies:string[]=[];vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(options.body as string);return Promise.resolve(json({},503));}return Promise.resolve(json(url.includes('/reports?')?{...list,draftGates:[{snapshotId:'S1',canCreate:false,reason:'该期间已有版本，请选择父版本'},{snapshotId:'S1',parentVersionId:'R1',canCreate:true,reason:null}]}:response(url)));});
 await mount();const button=await screen.findByRole('button',{name:'生成模板草稿'});expect(button.matches(':disabled')).toBe(true);
 fireEvent.change(screen.getByLabelText('父版本（留空为初稿）'),{target:{value:'R1'}});expect(button.matches(':disabled')).toBe(false);expect(screen.queryByText('该期间已有版本，请选择父版本')).toBeNull();fireEvent.click(button);await waitFor(()=>expect(bodies).toHaveLength(1));expect(JSON.parse(bodies[0])).toMatchObject({snapshotId:'S1',parentVersionId:'R1'});
});

it('deep-linked report has role-preserving list/snapshot/service navigation and exact section targets',async()=>{
 vi.stubGlobal('fetch',(url:string)=>Promise.resolve(json(response(url))));await mount({initialReportId:'R1',initialRole:'medical_reviewer'});await screen.findByTestId('psp-report-detail');
 expect(screen.getByRole('link',{name:'返回月报列表'}).getAttribute('href')).toBe('/governance/projects/PSP-1/reports?role=medical_reviewer');
 expect(screen.getByRole('link',{name:'返回服务快照与来源'}).getAttribute('href')).toBe('/governance/projects/PSP-1/snapshots?role=medical_reviewer&snapshotId=S1');
 expect(screen.getByRole('link',{name:'返回院内服务台'}).getAttribute('href')).toBe('/clinic/projects/PSP-1/services');
 for(const [name,id] of [['报告操作','report-actions'],['固定正文','report-body'],['签署时间线','report-timeline'],['内部来源','report-sources']]){expect(screen.getByRole('link',{name}).getAttribute('href')).toBe(`#${id}`);expect(document.getElementById(id)).toBeTruthy();}
});
it.each([503,409])('new context links cannot discard a pending/conflicted %s project command',async(status)=>{
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?json({},status):json(response(url))));await mount({initialReportId:'R1'});fireEvent.click(await screen.findByRole('button',{name:'生成模板草稿'}));await screen.findByRole('button',{name:status===503?'重试同一次操作':'已核对最新报告与项目账，继续'});
 for(const name of ['返回月报列表','返回服务快照与来源','返回院内服务台']){expect(screen.queryByRole('link',{name})).toBeNull();expect(screen.getByRole('button',{name}).matches(':disabled')).toBe(true);}
 if(status===409){fireEvent.click(screen.getByRole('button',{name:'已核对最新报告与项目账，继续'}));expect(screen.getByRole('link',{name:'返回月报列表'}).getAttribute('href')).toBe('/governance/projects/PSP-1/reports?role=project_manager');}
});
it.each([503,409])('context navigation respects exact detail command %s lock as well as project commands',async(status)=>{vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?json({},status):json(url.includes('/api/psp/reports/')?{...detail,actionGates:{canSubmit:true,canDeliver:false,canApprove:false,canReturn:false}}:response(url))));await mount({initialReportId:'R1'});fireEvent.click(await screen.findByRole('button',{name:'提交报告审核'}));await screen.findByRole('button',{name:status===503?'重试同一次操作':'已核对最新审核状态，继续'});for(const name of ['返回月报列表','返回服务快照与来源','返回院内服务台']){expect(screen.queryByRole('link',{name})).toBeNull();expect(screen.getByRole('button',{name}).matches(':disabled')).toBe(true);}});


it.each(['project_manager','data_reviewer','medical_reviewer'].flatMap(role=>[['delivered','等待客户验收，可查看固定交付'],['accepted','查看固定交付与客户验收记录']].map(([status,message])=>[role,status,message])))('terminal report cards give completed delivery guidance for %s / %s',async(role,status,message)=>{
 const {ReportWorkbenchCards}=await import('@/components/psp/ReportWorkbenchCards');
  const view=render(createElement(ReportWorkbenchCards,{role,summaries:[{...summary,status,workflow:{...workflow,status,label:status},actionGates:{canSubmit:false,canApprove:false,canDeliver:false,reviewReason:'仅数据或医学审核人可审核',deliverReason:'仅双签审核通过版本可交付'},createGate:{canCreate:false,reason:'当前不可修订'}}] as never}));
  expect(screen.getByText(`下一步：${message}`)).toBeTruthy();
  expect(screen.queryByText(/下一步：.*(交付双签版本|仅双签审核通过版本可交付|仅数据或医学审核人可审核)/)).toBeNull();
  expect(screen.getByRole('link',{name:'打开修订 1'}).getAttribute('href')).toContain(`role=${role}`);
  view.unmount();
});
it.each([
 ['canSubmit','提交审核'],['canApprove','核对后签署或退回'],['canDeliver','交付双签版本'],['canCreate','可创建修订'],
])('terminal status preserves true server %s guidance',async(gate,message)=>{
 const {ReportWorkbenchCards}=await import('@/components/psp/ReportWorkbenchCards');
 for(const status of ['delivered','accepted']){
  const view=render(createElement(ReportWorkbenchCards,{role:'project_manager',summaries:[{...summary,status,actionGates:{canSubmit:gate==='canSubmit',canApprove:gate==='canApprove',canDeliver:gate==='canDeliver'},createGate:{canCreate:gate==='canCreate',reason:null}}] as never}));
  expect(screen.getByText(`下一步：${message}`)).toBeTruthy();view.unmount();
 }
});
