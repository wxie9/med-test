import {test,expect,type APIRequestContext,type Page,type Route} from '@playwright/test';
import type {CommandMeta} from '@/lib/psp/types';
import type {CommandResult} from '@/lib/psp/transaction';
import type {PspReportDetail,PspReportList,PspReportVersion} from '@/lib/psp/reportTypes';
import type {PspSnapshotList,PspServiceSnapshot} from '@/lib/psp/snapshotTypes';
import type {PatientProjectsView} from '@/lib/psp/views';

const PROJECT='PSP-BC-ENDO-001';
const reportsEndpoint=`/api/psp/projects/${PROJECT}/reports`;
const snapshotsEndpoint=`/api/psp/projects/${PROJECT}/snapshots`;
const deskPath=`/governance/projects/${PROJECT}/reports`;
const manager={role:'project_manager',actorId:'project-manager-psp'} as const;
const identity=new URLSearchParams(manager).toString();
const fixedNow='2026-10-13T10:00:00+08:00';
const window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:fixedNow};
type ActionBody={action:'submit'|'review';kind?:'data'|'medical';decision?:'approve'|'return';reason?:string;meta:CommandMeta};
type ActionReceipt={body:ActionBody;result:CommandResult<PspReportVersion>};
const actionEndpoint=(id:string)=>`/api/psp/reports/${encodeURIComponent(id)}/actions`;

async function list(request:APIRequestContext){
 const response=await request.get(`${reportsEndpoint}?${identity}`);
 expect(response.ok()).toBe(true);
 expect(response.headers()['cache-control']).toBe('no-store');
 return await response.json() as PspReportList;
}
async function detail(request:APIRequestContext,id:string,seedVersion:number){
 const response=await request.get(`/api/psp/reports/${encodeURIComponent(id)}?${identity}&seedVersion=${seedVersion}`);
 expect(response.ok()).toBe(true);
 expect(response.headers()['cache-control']).toBe('no-store');
 return await response.json() as PspReportDetail;
}
async function setup(request:APIRequestContext){
 const currentResponse=await request.get(`${snapshotsEndpoint}?${identity}`);
 expect(currentResponse.ok()).toBe(true);
 const current=await currentResponse.json() as PspSnapshotList;
 expect(Date.parse(current.serverNow)).toBe(Date.parse(fixedNow));
 const frozen=await request.post(snapshotsEndpoint,{data:{window,meta:{...manager,seedVersion:current.seedVersion,expectedVersion:current.ledgerRevision,clientRequestId:crypto.randomUUID()}}});
 expect(frozen.ok()).toBe(true);
 const snapshot=(await frozen.json() as CommandResult<PspServiceSnapshot>).data;
 const ledger=await list(request);
 const body={snapshotId:snapshot.id,nextActions:[],meta:{...manager,seedVersion:ledger.seedVersion,expectedVersion:ledger.ledgerRevision,clientRequestId:crypto.randomUUID()}};
 const created=await request.post(reportsEndpoint,{data:body});
 expect(created.ok()).toBe(true);
 return {snapshot,body,receipt:await created.json() as CommandResult<PspReportVersion>};
}
async function submit(request:APIRequestContext,report:PspReportVersion){
 const response=await request.post(actionEndpoint(report.id),{data:{action:'submit',meta:{...manager,seedVersion:report.seedVersion,expectedVersion:report.version,clientRequestId:crypto.randomUUID()}}});
 expect(response.ok()).toBe(true);
 return await response.json() as CommandResult<PspReportVersion>;
}
async function openReport(page:Page,id:string,role='project_manager'){
 await page.goto(deskPath);
 const desk=page.getByTestId('psp-report-draft-desk');
 if(role!=='project_manager')await desk.getByLabel('报告工作身份').selectOption(role);
 await desk.getByLabel('选择报告版本').selectOption(id);
 await expect(desk.getByTestId('psp-report-review-panel')).toBeVisible();
 return desk;
}
async function switchRole(page:Page,id:string,role:string){
 const desk=page.getByTestId('psp-report-draft-desk');
 await desk.getByLabel('报告工作身份').selectOption(role);
 await desk.getByLabel('选择报告版本').selectOption(id);
 await expect(desk.getByTestId('psp-report-review-panel')).toBeVisible();
 return desk;
}
async function withdraw(request:APIRequestContext){
 const response=await request.get('/api/psp/patients/P-A/projects?role=patient&actorId=P-A');
 expect(response.ok()).toBe(true);
 const patient=await response.json() as PatientProjectsView;
 const enrollment=patient.projects.find(project=>project.project.id===PROJECT)!.enrollment;
 const result=await request.post(`/api/psp/enrollments/${encodeURIComponent(enrollment.id)}/permissions`,{data:{scope:'aggregate',action:'withdraw',meta:{role:'patient',actorId:'P-A',seedVersion:patient.seedVersion,expectedVersion:enrollment.version,clientRequestId:crypto.randomUUID()}}});
 expect(result.ok()).toBe(true);
}
async function passThrough(route:Route,receipts:ActionReceipt[]){
 const response=await route.fetch();
 expect(response.ok()).toBe(true);
 const result=await response.json() as CommandResult<PspReportVersion>;
 receipts.push({body:route.request().postDataJSON() as ActionBody,result});
 await route.fulfill({response,body:JSON.stringify(result)});
}
function unchangedBody(actual:PspReportVersion,original:PspReportVersion){
 expect(actual).toEqual({...original,status:actual.status,version:actual.version});
}
function sameSubmission(review:PspReportDetail){
 const {submission,dataReview,medicalReview}=review.workflow;
 expect(submission).not.toBeNull();
 for(const signature of [dataReview,medicalReview]){
  expect(signature).toMatchObject({submissionId:submission!.id,submittedVersion:2,reportVersionId:review.report.id,revision:review.report.revision,snapshotId:review.report.snapshotId,snapshotDigest:review.report.snapshotDigest,contentDigest:review.report.contentDigest,algorithmVersion:review.report.algorithmVersion,protectionVersion:review.report.protectionVersion});
 }
}

test.beforeEach(async({request})=>{expect((await request.post('/api/reset')).ok()).toBe(true);});
test.afterAll(async({request})=>{expect((await request.post('/api/reset')).ok()).toBe(true);});

test('PM submits an empty plan, medical returns it, and a structured revision receives new medical then data signatures',async({page,request},testInfo)=>{
 const {snapshot,body,receipt}=await setup(request),first=receipt.data,receipts:ActionReceipt[]=[];
 await page.route('**/api/psp/reports/*/actions',route=>passThrough(route,receipts));
 const desk=await openReport(page,first.id),workflow=desk.getByTestId('psp-report-workflow');
 await expect(desk.getByTestId('psp-report-content')).toContainText('下一期服务安排尚未补充');
 await desk.getByRole('button',{name:'提交报告审核',exact:true}).click();
 await expect(workflow).toContainText('待补签：数据审核、医学审核');
 await switchRole(page,first.id,'data_reviewer');
 await desk.getByRole('button',{name:'通过数据审核',exact:true}).click();
 await expect(workflow).toContainText('待补签：医学审核');
 const firstSignature=receipts.find(item=>item.body.kind==='data')!;
 await switchRole(page,first.id,'medical_reviewer');
 await expect(desk.getByRole('button',{name:'退回补充',exact:true})).toBeDisabled();
 await desk.getByLabel('退回理由').fill('  请补充下一期医学复核安排及负责角色  ');
 await desk.getByRole('button',{name:'退回补充',exact:true}).click();
 await expect(workflow).toContainText('已退回，待修订');
 await expect(workflow).toContainText('退回理由：请补充下一期医学复核安排及负责角色');
 await expect(desk.getByTestId('psp-report-content')).not.toContainText('请补充下一期医学复核安排及负责角色');
 const returned=await detail(request,first.id,snapshot.seedVersion);
 expect(returned.report).toMatchObject({status:'changes_requested',version:4,nextActions:[]});
 unchangedBody(returned.report,first);
 expect(returned.workflow.dataReview).toMatchObject({clientRequestId:firstSignature.body.meta.clientRequestId,kind:'data',decision:'approve'});
 await switchRole(page,first.id,'project_manager');
 await desk.getByRole('button',{name:'以此版本创建修订',exact:true}).click();
 await expect(desk.getByLabel('父版本（留空为初稿）')).toHaveValue(first.id);
 await desk.getByRole('button',{name:'添加下一期安排',exact:true}).click();
 await desk.getByLabel('安排1：类别').selectOption('medical_review');
 await desk.getByLabel('安排1：上海时间',{exact:true}).fill('2026-10-14T11:30');
 await desk.getByRole('button',{name:'生成模板草稿',exact:true}).click();
 await expect(desk.getByRole('heading',{name:'已保存报告（2）',exact:true})).toBeVisible();
 const revised=(await list(request)).summaries.find(item=>item.id!==first.id)!;
 await desk.getByLabel('选择报告版本').selectOption(revised.id);
 const draft=await detail(request,revised.id,snapshot.seedVersion);
 expect(draft.report).toMatchObject({revision:2,parentVersionId:first.id,status:'draft',version:1,nextActions:[{category:'medical_review',responsibleRole:'doctor',dueAt:'2026-10-14T03:30:00.000Z',status:'planned'}]});
 expect(draft.workflow).toMatchObject({submission:null,dataReview:null,medicalReview:null,returnReview:null,history:[]});
 expect(draft.report.contentDigest).not.toBe(first.contentDigest);
 await desk.getByRole('button',{name:'提交报告审核',exact:true}).click();
 await expect(workflow).toContainText('待补签：数据审核、医学审核');
 await switchRole(page,revised.id,'medical_reviewer');
 await desk.getByRole('button',{name:'通过医学审核',exact:true}).click();
 await expect(workflow).toContainText('待补签：数据审核');
 await switchRole(page,revised.id,'data_reviewer');
 await desk.getByRole('button',{name:'通过数据审核',exact:true}).click();
 await expect(workflow).toContainText('双签审核通过（尚未交付）');
 const approved=await detail(request,revised.id,snapshot.seedVersion);
 expect(approved.report).toMatchObject({status:'approved',version:4});
 sameSubmission(approved);
 unchangedBody(approved.report,draft.report);
 expect((await detail(request,first.id,snapshot.seedVersion)).report).toEqual(returned.report);
 const originalReplay=await request.post(reportsEndpoint,{data:body});
 expect(originalReplay.ok()).toBe(true);
 expect(await originalReplay.json()).toEqual(receipt);
 const signedReplay=await request.post(actionEndpoint(first.id),{data:firstSignature.body});
 expect(signedReplay.ok()).toBe(true);
 expect(await signedReplay.json()).toEqual(firstSignature.result);
 for(const width of [390,640,755,800,1024,1280,1440,1920]){
  await page.setViewportSize({width,height:1100});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(desk.getByTestId('psp-report-review-panel')).toBeVisible();
  if(width===390||width===1440){await page.screenshot({path:testInfo.outputPath(`psp-review-${width}.png`)});await workflow.screenshot({path:testInfo.outputPath(`psp-approved-workflow-${width}.png`)});}
 }
});

test('two browser reviewers race the same report CAS, then the loser acknowledges fresh state and adds the second signature',async({page,context,request})=>{
 const {snapshot,receipt}=await setup(request),first=receipt.data;
 await submit(request,first);
 const other=await context.newPage();
 const dataDesk=await openReport(page,first.id,'data_reviewer'),medicalDesk=await openReport(other,first.id,'medical_reviewer');
 const attempts:{body:ActionBody;status:number}[]=[];
 let arrivals=0,release!:()=>void;
 const bothArrived=new Promise<void>(resolve=>{release=resolve;});
 const race=async(route:Route)=>{
  const body=route.request().postDataJSON() as ActionBody;
  if(++arrivals===2)release();
  if(arrivals<=2)await bothArrived;
  const response=await route.fetch(),result=await response.json();
  attempts.push({body,status:response.status()});
  await route.fulfill({response,body:JSON.stringify(result)});
 };
 await page.route(`**${actionEndpoint(first.id)}`,race);
 await other.route(`**${actionEndpoint(first.id)}`,race);
 await Promise.all([dataDesk.getByRole('button',{name:'通过数据审核',exact:true}).click(),medicalDesk.getByRole('button',{name:'通过医学审核',exact:true}).click()]);
 await expect.poll(()=>attempts.length).toBe(2);
 expect(attempts.map(item=>item.status).sort()).toEqual([200,409]);
 expect(attempts.map(item=>item.body.meta.expectedVersion)).toEqual([2,2]);
 const failed=attempts.find(item=>item.status===409)!,loser=failed.body.kind==='data'?dataDesk:medicalDesk;
 const approve=loser.getByRole('button',{name:failed.body.kind==='data'?'通过数据审核':'通过医学审核',exact:true});
 await expect(loser.getByRole('button',{name:'已核对最新审核状态，继续',exact:true})).toBeVisible();
 await expect(loser.getByLabel('选择报告版本')).toBeDisabled();
 await expect(approve).toBeDisabled();
 const one=await detail(request,first.id,snapshot.seedVersion);
 expect(one.report).toMatchObject({status:'in_review',version:3});
 expect(one.workflow.history).toHaveLength(2);
 await loser.getByRole('button',{name:'已核对最新审核状态，继续',exact:true}).click();
 await approve.click();
 await expect(loser.getByTestId('psp-report-workflow')).toContainText('双签审核通过（尚未交付）');
 expect(attempts).toHaveLength(3);
 expect(attempts[2].body.meta.expectedVersion).toBe(3);
 expect(attempts[2].body.meta.clientRequestId).not.toBe(failed.body.meta.clientRequestId);
 const final=await detail(request,first.id,snapshot.seedVersion);
 sameSubmission(final);
 expect(final.workflow.history).toHaveLength(3);
 unchangedBody(final.report,first);
 await other.close();
});

test('a committed submit with a lost 503 response locks all report writes and retries the exact historical receipt',async({page,request})=>{
 const {snapshot,receipt}=await setup(request),first=receipt.data,bodies:string[]=[],replies:CommandResult<PspReportVersion>[]=[];
 await page.route(`**${actionEndpoint(first.id)}`,async route=>{
  bodies.push(route.request().postData()!);
  const response=await route.fetch();
  expect(response.ok()).toBe(true);
  const result=await response.json() as CommandResult<PspReportVersion>;
  replies.push(result);
  if(bodies.length===1)await route.fulfill({status:503,contentType:'application/json',body:'{}'});
  else await route.fulfill({response,body:JSON.stringify(result)});
 });
 const desk=await openReport(page,first.id);
 await desk.getByRole('button',{name:'以此版本创建修订',exact:true}).click();
 await desk.getByRole('button',{name:'添加下一期安排',exact:true}).click();
 await desk.getByLabel('安排1：上海时间',{exact:true}).fill('2026-10-14T11:30');
 await desk.getByRole('button',{name:'提交报告审核',exact:true}).click();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toBeVisible();
 for(const label of ['用于报告的冻结快照','父版本（留空为初稿）','选择报告版本','安排1：类别','安排1：负责角色','安排1：上海时间','安排1：状态'])await expect(desk.getByLabel(label)).toBeDisabled();
 for(const name of ['生成模板草稿','添加下一期安排','移除安排1','以此版本创建修订','提交报告审核'])await expect(desk.getByRole('button',{name,exact:true})).toBeDisabled();
 const committed=await detail(request,first.id,snapshot.seedVersion);
 expect(committed.report).toMatchObject({status:'in_review',version:2});
 expect(committed.workflow.history).toHaveLength(1);
 await desk.getByRole('button',{name:'重试同一次操作',exact:true}).click();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toHaveCount(0);
 await expect(desk.getByLabel('选择报告版本')).toBeEnabled();
 await expect(desk.getByTestId('psp-report-workflow')).toContainText('待补签：数据审核、医学审核');
 expect(bodies).toHaveLength(2);
 expect(bodies[1]).toBe(bodies[0]);
 expect(replies[1]).toEqual(replies[0]);
 expect(await detail(request,first.id,snapshot.seedVersion)).toEqual(committed);
 expect((await list(request)).ledgerRevision).toBe(replies[0].ledgerRevision);
});

test('role changes discard a delayed review failure and reset discards the pending old-seed review command',async({page,request})=>{
 const {receipt}=await setup(request),first=receipt.data;
 await submit(request,first);
 const bodies:ActionBody[]=[];
 let delivered=0;
 let release!:()=>void;
 const delayed=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`**${actionEndpoint(first.id)}`,async route=>{
  bodies.push(route.request().postDataJSON() as ActionBody);
  if(bodies.length===1)await delayed;
  await route.fulfill({status:503,contentType:'application/json',body:'{}'});
  delivered++;
 });
 const desk=await openReport(page,first.id,'data_reviewer');
 await desk.getByLabel('退回理由').fill('旧身份待核对理由');
 await desk.getByRole('button',{name:'通过数据审核',exact:true}).click();
 await expect.poll(()=>bodies.length).toBe(1);
 await switchRole(page,first.id,'medical_reviewer');
 release();
 await expect.poll(()=>delivered).toBe(1);
 await expect(desk.getByLabel('退回理由')).toHaveValue('');
 await expect(desk.getByRole('button',{name:'通过医学审核',exact:true})).toBeEnabled();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toHaveCount(0);
 await desk.getByRole('button',{name:'通过医学审核',exact:true}).click();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toBeVisible();
 expect(bodies).toHaveLength(2);
 expect((await request.post('/api/reset')).ok()).toBe(true);
 await desk.getByRole('button',{name:'刷新报告状态',exact:true}).click();
 await expect(desk.getByRole('heading',{name:'已保存报告（0）',exact:true})).toBeVisible();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toHaveCount(0);
 await expect(desk.getByTestId('psp-report-review-panel')).toHaveCount(0);
 await expect(desk.getByLabel('选择报告版本')).toHaveValue('');
 const stale=await request.post(actionEndpoint(first.id),{data:bodies[1]});
 expect(stale.status()).toBe(409);
 expect(stale.headers()['cache-control']).toBe('no-store');
 expect(await stale.json()).toMatchObject({code:'stale_seed'});
 expect((await list(request)).summaries).toHaveLength(0);
});

test('aggregate withdrawal blocks a fresh submit while already submitted frozen reports still accept both internal reviews',async({page,request})=>{
 const draft=await setup(request);
 await withdraw(request);
 const desk=await openReport(page,draft.receipt.data.id);
 await expect(desk.getByRole('button',{name:'提交报告审核',exact:true})).toBeDisabled();
 const blocked=await request.post(actionEndpoint(draft.receipt.data.id),{data:{action:'submit',meta:{...manager,seedVersion:draft.snapshot.seedVersion,expectedVersion:1,clientRequestId:crypto.randomUUID()}}});
 expect(blocked.status()).toBe(403);
 expect(await blocked.json()).toMatchObject({code:'source_unusable'});
 expect((await detail(request,draft.receipt.data.id,draft.snapshot.seedVersion)).report).toEqual(draft.receipt.data);
 expect((await request.post('/api/reset')).ok()).toBe(true);
 const submitted=await setup(request);
 await submit(request,submitted.receipt.data);
 await withdraw(request);
 await openReport(page,submitted.receipt.data.id,'medical_reviewer');
 await expect(desk.getByText('医学审核者 · 草稿安排只读',{exact:true})).toBeVisible();
 await desk.getByRole('button',{name:'通过医学审核',exact:true}).click();
 await expect(desk.getByTestId('psp-report-workflow')).toContainText('待补签：数据审核');
 await switchRole(page,submitted.receipt.data.id,'data_reviewer');
 await desk.getByRole('button',{name:'通过数据审核',exact:true}).click();
 await expect(desk.getByTestId('psp-report-workflow')).toContainText('双签审核通过（尚未交付）');
 const approved=await detail(request,submitted.receipt.data.id,submitted.snapshot.seedVersion);
 sameSubmission(approved);
 unchangedBody(approved.report,submitted.receipt.data);
 expect(approved.createGate.canCreate).toBe(false);
});
