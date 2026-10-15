import {openPublicReportBody} from './helpers/pharmaReading';
import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {CommandMeta} from '@/lib/psp/types';
import type {CommandResult} from '@/lib/psp/transaction';
import type {PspReportDetail,PspReportList,PspReportVersion} from '@/lib/psp/reportTypes';
import type {PspSnapshotList,PspServiceSnapshot} from '@/lib/psp/snapshotTypes';
import type {PatientProjectsView} from '@/lib/psp/views';
import type {PharmaProjectView,PharmaReportView,PharmaActionReceipt} from '@/lib/psp/pharmaView';

const PROJECT='PSP-BC-ENDO-001',manager={role:'project_manager',actorId:'project-manager-psp'} as const;
const staffQuery=new URLSearchParams(manager).toString(),reports=`/api/psp/projects/${PROJECT}/reports`,snapshots=`/api/psp/projects/${PROJECT}/snapshots`,overview=`/api/pharma/projects/${PROJECT}`;
const deskPath=`/governance/projects/${PROJECT}/reports`,pharmaPath=`/pharma/projects/${PROJECT}`;
const window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:'2026-10-13T10:00:00+08:00'};
const internalActions=(id:string)=>`/api/psp/reports/${encodeURIComponent(id)}/actions`;
const external=(id:string)=>`${overview}/reports/${encodeURIComponent(id)}`;
const meta=(seedVersion:number,expectedVersion:number,role:CommandMeta['role']='project_manager'):CommandMeta=>({seedVersion,expectedVersion,role,actorId:role==='pharma_owner'?'pharma-owner-a':role==='project_manager'?'project-manager-psp':role.replace('_','-')+'-psp',clientRequestId:crypto.randomUUID()});
async function json<T>(response:Awaited<ReturnType<APIRequestContext['get']>>):Promise<T>{expect(response.ok(),await response.text()).toBe(true);expect(response.headers()['cache-control']).toBe('no-store');return response.json() as Promise<T>;}
const list=(request:APIRequestContext)=>request.get(`${reports}?${staffQuery}`).then(json<PspReportList>);
const project=(request:APIRequestContext)=>request.get(overview).then(json<PharmaProjectView>);
const detail=(request:APIRequestContext,r:PspReportVersion)=>request.get(`/api/psp/reports/${encodeURIComponent(r.id)}?${staffQuery}&seedVersion=${r.seedVersion}`).then(json<PspReportDetail>);
async function freeze(request:APIRequestContext){const current=await request.get(`${snapshots}?${staffQuery}`).then(json<PspSnapshotList>);expect(Date.parse(current.serverNow)).toBe(Date.parse(window.cutoffAt));return (await request.post(snapshots,{data:{window,meta:meta(current.seedVersion,current.ledgerRevision)}}).then(json<CommandResult<PspServiceSnapshot>>)).data;}
async function create(request:APIRequestContext,snapshot:PspServiceSnapshot){const current=await list(request);return (await request.post(reports,{data:{snapshotId:snapshot.id,nextActions:[],meta:meta(current.seedVersion,current.ledgerRevision)}}).then(json<CommandResult<PspReportVersion>>)).data;}
async function action(request:APIRequestContext,r:PspReportVersion,body:Record<string,unknown>,role:CommandMeta['role']='project_manager'){const current=(await detail(request,r)).report;return request.post(internalActions(r.id),{data:{...body,meta:meta(r.seedVersion,current.version,role)}}).then(json<CommandResult<PspReportVersion>>);}
async function approve(request:APIRequestContext,r:PspReportVersion){await action(request,r,{action:'submit'});await action(request,r,{action:'review',kind:'data',decision:'approve'},'data_reviewer');await action(request,r,{action:'review',kind:'medical',decision:'approve'},'medical_reviewer');return (await detail(request,r)).report;}
async function ready(request:APIRequestContext,delivered=false){const snapshot=await freeze(request),report=await approve(request,await create(request,snapshot));if(delivered)await action(request,report,{action:'deliver'});return {snapshot,report};}
function query(report:PspReportVersion,authorizationVersion:number){return new URLSearchParams({role:'pharma_owner',actorId:'pharma-owner-a',seedVersion:String(report.seedVersion),authorizationVersion:String(authorizationVersion),periodStart:report.window.periodStart,periodEnd:report.window.periodEnd});}
async function publicReport(request:APIRequestContext,r:PspReportVersion){const p=await project(request);return request.get(`${external(r.id)}?${query(r,p.authorizationVersion)}`).then(json<PharmaReportView>);}
function available(view:PharmaReportView){expect(view.gate.status).toBe('available');if(!('artifact' in view))throw new Error('Expected available report');return view;}
function noInternal(value:unknown,r:PspReportVersion){const text=JSON.stringify(value);for(const forbidden of [r.snapshotId,r.snapshotDigest,...r.factIds,r.createdBy,'P-A','ENR-01','data-reviewer-psp','medical-reviewer-psp'])expect(text).not.toContain(forbidden);const visit=(v:unknown)=>{if(!v||typeof v!=='object')return;for(const [key,child] of Object.entries(v)){expect(['snapshotId','snapshotDigest','sourceRefs','factIds','patientId','enrollmentId','actorId','createdBy','submittedBy','locator']).not.toContain(key);visit(child);}};visit(value);}
function protectedFacts(view:ReturnType<typeof available>){const facts=view.content.chapters.flatMap(c=>c.facts),hidden=facts.filter(f=>f.status==='suppressed');expect(hidden.length).toBeGreaterThan(0);for(const f of hidden)for(const key of ['value','sampleN','numerator','denominator'])expect(f).not.toHaveProperty(key);for(const c of view.content.chapters){expect(c).not.toHaveProperty('id');for(const f of c.facts)expect(f).not.toHaveProperty('id');}}
function statusOnly(receipt:CommandResult<PharmaActionReceipt>,r:PspReportVersion){expect(Object.keys(receipt.data).sort()).toEqual(['event','id','projectId','status','version']);expect(Object.keys(receipt.data.event).sort()).toEqual(['action','id','occurredAt']);noInternal(receipt,r);}
async function openDesk(page:Page,id:string){await page.goto(deskPath);const desk=page.getByTestId('psp-report-draft-desk');await desk.getByLabel('选择报告版本').selectOption(id);await expect(desk.getByTestId('psp-report-review-panel')).toBeVisible();return desk;}
async function deliverUi(page:Page,id:string){const desk=await openDesk(page,id);await expect(desk.getByRole('button',{name:'交付此报告版本',exact:true})).toBeEnabled();await desk.getByRole('button',{name:'交付此报告版本',exact:true}).click();await expect(desk.getByTestId('psp-report-workflow')).toContainText('已交付');return desk;}
async function customer(page:Page,id:string){
 const seen:{url:string;ids:string[]}[]=[];
 const capture=async(route:import('@playwright/test').Route)=>{const response=await route.fetch(),body=await response.json();seen.push({url:route.request().url(),ids:body.reports?.map((r:{id:string})=>r.id)??[]});await route.fulfill({response,body:JSON.stringify(body)});};
 await page.route(`**${overview}`,capture);
 await page.goto(pharmaPath);const link=page.locator(`a[href="${pharmaPath}/reports/${encodeURIComponent(id)}"]`);await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(`${pharmaPath}/reports/${encodeURIComponent(id)}`);
 try{await openPublicReportBody(page);await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();}catch(error){const html=await (await page.request.get(page.url())).text();console.log('CUSTOMER_DIAGNOSTIC',JSON.stringify({url:page.url(),expectedId:id,seen,reportProps:html.match(/reportId.{0,140}/g)}));throw error;}
 await page.unroute(`**${overview}`,capture);
}
async function withdraw(request:APIRequestContext){const patient=await request.get('/api/psp/patients/P-A/projects?role=patient&actorId=P-A').then(json<PatientProjectsView>);const enrollment=patient.projects.find(p=>p.project.id===PROJECT)!.enrollment;await request.post(`/api/psp/enrollments/${encodeURIComponent(enrollment.id)}/permissions`,{data:{scope:'aggregate',action:'withdraw',meta:{...meta(patient.seedVersion,enrollment.version),role:'patient',actorId:'P-A'}}}).then(json);}
async function savedDownload(page:Page,name:string){const pending=page.waitForEvent('download');await page.getByRole('link',{name,exact:true}).click();const download=await pending,path=await download.path();expect(path).not.toBeNull();return readFile(path!,'utf8');}
async function revisionUi(page:Page,request:APIRequestContext,parent:PspReportVersion,snapshot?:PspServiceSnapshot){const desk=await openDesk(page,parent.id);if(snapshot){await desk.getByLabel('父版本（留空为初稿）').selectOption(parent.id);await desk.getByLabel('用于报告的冻结快照').selectOption(snapshot.id);}else await desk.getByRole('button',{name:'以此版本创建修订',exact:true}).click();await desk.getByRole('button',{name:'添加下一期安排',exact:true}).click();await desk.getByLabel('安排1：类别').selectOption('medical_review');await desk.getByLabel('安排1：上海时间',{exact:true}).fill('2026-10-14T11:30');await desk.getByRole('button',{name:'生成模板草稿',exact:true}).click();await expect(desk.getByRole('heading',{name:'已保存报告（2）',exact:true})).toBeVisible();const child=(await list(request)).summaries.find(r=>r.id!==parent.id)!;await desk.getByLabel('选择报告版本').selectOption(child.id);await desk.getByRole('button',{name:'提交报告审核',exact:true}).click();await expect(desk.getByTestId('psp-report-workflow')).toContainText('待补签');for(const [role,name] of [['data_reviewer','通过数据审核'],['medical_reviewer','通过医学审核']]){await desk.getByLabel('报告工作身份').selectOption(role);await desk.getByLabel('选择报告版本').selectOption(child.id);await desk.getByRole('button',{name,exact:true}).click();await expect(desk.getByTestId('psp-report-workflow')).toContainText(role==='data_reviewer'?'待补签：医学审核':'双签审核通过');}return (await detail(request,{...parent,id:child.id})).report;}

test.beforeEach(async({request})=>{expect((await request.post('/api/reset')).ok()).toBe(true);});
test.afterAll(async({request})=>{expect((await request.post('/api/reset')).ok()).toBe(true);});

test('PM delivers, customer downloads protected fixed files and requests changes, then accepts a newly dual-reviewed revision',async({page,request},testInfo)=>{
 // A real 1/14 completion supplies a non-vacuous small-cell protection check.
 const seed=(await list(request)).seedVersion;
 await request.post(`/api/psp/assignments/${encodeURIComponent(`${PROJECT}:ENR-01:PRO:2026-10`)}/pro`,{data:{patientId:'P-A',scaleId:'endocrine_monthly_v1',items:{关节痛:3,潮热:1,情绪:1,睡眠:1},flags:{stopIntent:true,missedDoses14d:4},meta:{...meta(seed,1),role:'patient',actorId:'P-A'}}}).then(json);
 const {report}=await ready(request);
 expect((await project(request)).reports).toEqual([]);
 expect(await publicReport(request,report)).toMatchObject({status:'approved',gate:{status:'blocked',reason:'报告尚未交付'}});
 await page.goto(`${pharmaPath}/reports/${encodeURIComponent(report.id)}`);await expect(page.getByTestId('psp-pharma-report-content')).toHaveCount(0);for(const id of ['psp-pharma-reading-summary','psp-pharma-next-actions','psp-pharma-delivery-checklist','psp-pharma-reading-evidence'])await expect(page.getByTestId(id)).toHaveCount(0);
 await deliverUi(page,report.id);await customer(page,report.id);
 const original=available(await publicReport(request,report));noInternal(original,report);protectedFacts(original);noInternal(await project(request),report);
 expect(await savedDownload(page,'下载固定文本')).toBe(original.artifact.text);
 expect(createHash('sha256').update(original.artifact.text).digest('hex')).toBe(original.artifact.digest);
 const html=await savedDownload(page,'下载固定HTML');expect(html).toContain('<!doctype html>');expect(html).toContain(original.artifact.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));noInternal(html,report);
 await expect(page.getByRole('button',{name:'请求修改',exact:true})).toBeDisabled();
 let feedback:CommandResult<PharmaActionReceipt>|undefined;
 await page.route(`**${external(report.id)}/actions`,async route=>{const response=await route.fetch();feedback=await response.json();await route.fulfill({response,body:JSON.stringify(feedback)});});
 await page.getByLabel('客户意见').fill('  请补充下一期医学复核安排  ');await page.getByRole('button',{name:'请求修改',exact:true}).click();await expect(page.getByRole('heading',{name:/客户已请求修改/})).toBeVisible();statusOnly(feedback!,report);
 expect(available(await publicReport(request,report)).artifact).toEqual(original.artifact);
 const child=await revisionUi(page,request,report);expect(child).toMatchObject({parentVersionId:report.id,revision:2,status:'approved'});
 const signed=await detail(request,child);expect(signed.workflow.dataReview?.submissionId).toBe(signed.workflow.submission?.id);expect(signed.workflow.medicalReview?.submissionId).toBe(signed.workflow.submission?.id);
 await deliverUi(page,child.id);await customer(page,child.id);await page.getByLabel('客户意见').fill('已核对本次阶段交付范围');await page.getByRole('button',{name:'验收此版本',exact:true}).click();await expect(page.getByRole('heading',{name:/客户已验收/})).toBeVisible();await expect(page.getByRole('button',{name:'验收此版本',exact:true})).toBeDisabled();
 expect(available(await publicReport(request,report)).artifact).toEqual(original.artifact);expect((await detail(request,report)).report.status).toBe('client_changes_requested');
 for(const width of [390,640,755,800,1024,1280,1440,1920]){await page.setViewportSize({width,height:1100});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await openPublicReportBody(page);await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();if(width===390||width===1440)await page.screenshot({path:testInfo.outputPath(`psp-delivery-accepted-${width}.png`),fullPage:true});}
});

test('committed PM delivery masked as 503 locks every report write and retries exact command into one artifact',async({page,request})=>{
 const {report}=await ready(request),bodies:string[]=[],receipts:CommandResult<PspReportVersion>[]=[];
 await page.route(`**${internalActions(report.id)}`,async route=>{bodies.push(route.request().postData()!);const response=await route.fetch();expect(response.ok()).toBe(true);const result=await response.json();receipts.push(result);await route.fulfill(bodies.length===1?{status:503,contentType:'application/json',body:'{}'}:{response,body:JSON.stringify(result)});});
 const desk=await openDesk(page,report.id);await desk.getByRole('button',{name:'添加下一期安排',exact:true}).click();await desk.getByRole('button',{name:'交付此报告版本',exact:true}).click();await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toBeVisible();
 for(const label of ['用于报告的冻结快照','父版本（留空为初稿）','选择报告版本','安排1：类别','安排1：负责角色','安排1：上海时间','安排1：状态'])await expect(desk.getByLabel(label)).toBeDisabled();
 for(const name of ['生成模板草稿','添加下一期安排','移除安排1','以此版本创建修订','提交报告审核','交付此报告版本'])await expect(desk.getByRole('button',{name,exact:true})).toBeDisabled();
 const before=await detail(request,report),artifact=available(await publicReport(request,report)).artifact;expect(before.workflow.history.filter(e=>e.action==='deliver')).toHaveLength(1);
 await desk.getByRole('button',{name:'重试同一次操作',exact:true}).click();await expect.poll(()=>receipts.length).toBe(2);await expect(desk.getByTestId('psp-report-workflow')).toContainText('已交付');await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toHaveCount(0);expect(bodies).toHaveLength(2);expect(bodies[1]).toBe(bodies[0]);expect(receipts[1]).toEqual(receipts[0]);expect(await detail(request,report)).toEqual(before);expect((await project(request)).reports).toHaveLength(1);expect(available(await publicReport(request,report)).artifact).toEqual(artifact);
});

test('customer exact retry retains a safe historical receipt, then withdrawal clears retry, body and downloads',async({page,request})=>{
 const {report}=await ready(request,true),bodies:string[]=[],receipts:CommandResult<PharmaActionReceipt>[]=[];
 await page.route(`**${external(report.id)}/actions`,async route=>{bodies.push(route.request().postData()!);const response=await route.fetch();expect(response.ok()).toBe(true);const result=await response.json();statusOnly(result,report);receipts.push(result);await route.fulfill({status:503,contentType:'application/json',body:'{}'});});
 await customer(page,report.id);await page.getByLabel('客户意见').fill('已核对');await page.getByRole('button',{name:'验收此版本',exact:true}).click();await expect(page.getByRole('button',{name:'重试同一次操作',exact:true})).toBeVisible();await expect(page.getByLabel('客户意见')).toBeDisabled();await expect(page.getByRole('button',{name:'验收此版本',exact:true})).toBeDisabled();await page.getByRole('button',{name:'重试同一次操作',exact:true}).click();await expect.poll(()=>receipts.length).toBe(2);await expect(page.getByRole('button',{name:'重试同一次操作',exact:true})).toBeVisible();expect(bodies[1]).toBe(bodies[0]);expect(receipts[1]).toEqual(receipts[0]);
 await withdraw(request);await page.getByRole('button',{name:'刷新交付报告',exact:true}).click();await expect(page.getByText('当前授权已停止此报告访问',{exact:true})).toBeVisible();await expect(page.getByTestId('psp-pharma-report-content')).toHaveCount(0);for(const id of ['psp-pharma-reading-summary','psp-pharma-next-actions','psp-pharma-delivery-checklist','psp-pharma-reading-evidence'])await expect(page.getByTestId(id)).toHaveCount(0);await expect(page.getByRole('link',{name:/下载固定/})).toHaveCount(0);await expect(page.getByRole('button',{name:'重试同一次操作',exact:true})).toHaveCount(0);
 const replay=await request.post(`${external(report.id)}/actions`,{data:JSON.parse(bodies[0])}).then(json<CommandResult<PharmaActionReceipt>>);expect(replay).toEqual(receipts[0]);statusOnly(replay,report);
 const p=await project(request),revoked=await publicReport(request,report);expect(revoked).toMatchObject({status:'accepted',gate:{status:'revoked'}});expect(Object.keys(revoked).sort()).toEqual(['authorizationGate','authorizationVersion','gate','id','projectId','seedVersion','status','version']);noInternal(revoked,report);
 for(const format of ['text','html']){const blocked=await request.get(`${external(report.id)}/download?${query(report,p.authorizationVersion)}&format=${format}`);expect(blocked.status()).toBe(403);expect(blocked.headers()['cache-control']).toBe('no-store');expect(await blocked.json()).toEqual(revoked);}
});

test('a captured old report body delivered after a new revoked overview never reappears',async({page,request},testInfo)=>{
 const {report}=await ready(request,true);await customer(page,report.id);
 let consume!:(value:{gate:{status:string};bodyUsed:boolean})=>void;
 const consumed=new Promise<{gate:{status:string};bodyUsed:boolean}>(resolve=>{consume=resolve;});
 await page.exposeFunction('task5LateWithdrawalConsumed',consume);
 await page.evaluate(pathname=>{
  const original=Response.prototype.json;let observed=false;
  Response.prototype.json=function(this:Response){return original.call(this).then(body=>{
   if(!observed&&new URL(this.url).pathname===pathname){observed=true;void (window as typeof window&{task5LateWithdrawalConsumed:(value:unknown)=>Promise<void>}).task5LateWithdrawalConsumed({gate:body.gate,bodyUsed:this.bodyUsed});}
   return body;
  });};
 },external(report.id));
 let release!:()=>void,captured!:()=>void;const held=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>captured=r);let delayed=false;
 await page.route(`**${external(report.id)}?*`,async route=>{if(delayed){await route.continue();return;}delayed=true;const response=await route.fetch(),body=await response.json();expect(body.gate.status).toBe('available');captured();await held;await route.fulfill({response,body:JSON.stringify(body)});});
 await page.getByRole('button',{name:'刷新当前报告内容',exact:true}).click();await seen;await withdraw(request);await page.getByRole('button',{name:'刷新交付报告',exact:true}).click();await expect(page.getByText('当前授权已停止此报告访问',{exact:true})).toBeVisible();const late=page.waitForResponse(response=>response.url().includes(external(report.id)+'?'));release();expect(await (await late).finished()).toBeNull();expect(await consumed).toMatchObject({gate:{status:'available'},bodyUsed:true});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(page.getByTestId('psp-pharma-report-content')).toHaveCount(0);for(const id of ['psp-pharma-reading-summary','psp-pharma-next-actions','psp-pharma-delivery-checklist','psp-pharma-reading-evidence'])await expect(page.getByTestId(id)).toHaveCount(0);await expect(page.getByRole('link',{name:/下载固定/})).toHaveCount(0);await expect(page.getByText('当前授权已停止此报告访问',{exact:true})).toBeVisible();await page.screenshot({path:testInfo.outputPath('psp-delivery-revoked-after-late-body.png'),fullPage:true});
});

test('withdrawal preserves accepted history while a new policy snapshot of 13 yields a freshly reviewed and delivered child',async({page,request})=>{
 const {report}=await ready(request,true);await customer(page,report.id);await page.getByRole('button',{name:'验收此版本',exact:true}).click();await expect(page.getByRole('heading',{name:/客户已验收/})).toBeVisible();const accepted=(await detail(request,report)).report;
 await withdraw(request);const fresh=await freeze(request);expect(fresh.aggregateAuthorizationPolicy).toBe('current_grants_v1');expect(fresh.aggregateMetrics.find(m=>m.key==='period_members')?.value).toBe(13);
 const child=await revisionUi(page,request,report,fresh);expect(child.snapshotId).toBe(fresh.id);expect(child.parentVersionId).toBe(report.id);await deliverUi(page,child.id);await customer(page,child.id);expect(available(await publicReport(request,child)).authorizationGate.status).toBe('eligible');
 expect((await detail(request,report)).report).toEqual(accepted);expect(await publicReport(request,report)).toMatchObject({status:'accepted',gate:{status:'revoked'}});const p=await project(request);expect(p.reports).toHaveLength(2);expect(p.reports.find(r=>r.id===child.id)?.gate.status).toBe('available');expect(p.reports.find(r=>r.id===report.id)?.gate.status).toBe('revoked');
});

test('strict public scope, identity and reset barriers refuse bypasses and discard a pending customer command',async({page,request})=>{
 const {report}=await ready(request,true),p=await project(request),valid=query(report,p.authorizationVersion),url=external(report.id);
 for(const mutation of [(q:URLSearchParams)=>q.delete('role'),(q:URLSearchParams)=>q.set('role','project_manager'),(q:URLSearchParams)=>q.set('actorId','P-A'),(q:URLSearchParams)=>q.set('scope','internal'),(q:URLSearchParams)=>q.append('role','pharma_owner'),(q:URLSearchParams)=>q.set('periodEnd','2026-12-01T00:00:00+08:00')]){const q=new URLSearchParams(valid);mutation(q);const denied=await request.get(`${url}?${q}`);expect(denied.ok()).toBe(false);expect(denied.headers()['cache-control']).toBe('no-store');const body=await denied.json();expect(body).not.toHaveProperty('content');expect(body).not.toHaveProperty('artifact');noInternal(body,report);}
 expect((await request.post(`${url}/actions`,{data:{action:'deliver',meta:meta(report.seedVersion,5,'pharma_owner')}})).status()).toBe(400);
 expect((await request.post(`${url}/actions`,{data:{action:'accept',meta:meta(report.seedVersion,5)}})).status()).toBe(403);
 expect((await request.get(`${url}/download?${valid}`)).status()).toBe(400);
 const stale=new URLSearchParams(valid);stale.set('authorizationVersion',String(p.authorizationVersion+1));const denied=await request.get(`${url}?${stale}`);expect(denied.status()).toBe(409);expect(Object.keys(await denied.json()).sort()).toEqual(['authorizationVersion','code','error','seedVersion']);
 const sent:string[]=[];await page.route(`**${url}/actions`,async route=>{sent.push(route.request().postData()!);await route.fulfill({status:503,contentType:'application/json',body:'{}'});});await customer(page,report.id);await page.getByRole('button',{name:'验收此版本',exact:true}).click();await expect(page.getByRole('button',{name:'重试同一次操作',exact:true})).toBeVisible();await request.post('/api/reset');await page.getByRole('button',{name:'刷新交付报告',exact:true}).click();await expect(page.getByTestId('psp-pharma-report-content')).toHaveCount(0);for(const id of ['psp-pharma-reading-summary','psp-pharma-next-actions','psp-pharma-delivery-checklist','psp-pharma-reading-evidence'])await expect(page.getByTestId(id)).toHaveCount(0);await expect(page.getByRole('button',{name:'重试同一次操作',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:/下载固定/})).toHaveCount(0);expect(sent).toHaveLength(1);expect((await request.get(`${url}?${valid}`)).status()).toBe(409);
});
