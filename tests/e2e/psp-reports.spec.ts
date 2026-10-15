import {test,expect,type APIRequestContext} from '@playwright/test';
import type {CommandMeta} from '@/lib/psp/types';
import type {CommandResult} from '@/lib/psp/transaction';
import type {NextAction,PspReportDetail,PspReportList,PspReportVersion} from '@/lib/psp/reportTypes';
import type {PspMetricEvidence,PspSnapshotList,PspServiceSnapshot} from '@/lib/psp/snapshotTypes';
import type {PatientProjectsView} from '@/lib/psp/views';

const PROJECT='PSP-BC-ENDO-001';
const reportsEndpoint=`/api/psp/projects/${PROJECT}/reports`;
const snapshotsEndpoint=`/api/psp/projects/${PROJECT}/snapshots`;
const deskPath=`/governance/projects/${PROJECT}/reports`;
const manager={role:'project_manager',actorId:'project-manager-psp'} as const;
const identity=new URLSearchParams(manager).toString();
const fixedNow='2026-10-13T10:00:00+08:00';
const window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:fixedNow};
type ReportBody={snapshotId:string;parentVersionId?:string;nextActions:NextAction[];meta:CommandMeta};

async function snapshots(request:APIRequestContext){
 const response=await request.get(`${snapshotsEndpoint}?${identity}`);
 expect(response.ok()).toBe(true);
 const data=await response.json() as PspSnapshotList;
 expect(Date.parse(data.serverNow)).toBe(Date.parse(fixedNow));
 return data;
}
async function reports(request:APIRequestContext){
 const response=await request.get(`${reportsEndpoint}?${identity}`);
 expect(response.ok()).toBe(true);
 expect(response.headers()['cache-control']).toBe('no-store');
 return await response.json() as PspReportList;
}
async function freeze(request:APIRequestContext){
 const current=await snapshots(request);
 const response=await request.post(snapshotsEndpoint,{data:{window,meta:{...manager,seedVersion:current.seedVersion,expectedVersion:current.ledgerRevision,clientRequestId:crypto.randomUUID()}}});
 expect(response.ok()).toBe(true);
 return (await response.json() as CommandResult<PspServiceSnapshot>).data;
}
async function readReport(request:APIRequestContext,id:string,seedVersion:number){
 const response=await request.get(`/api/psp/reports/${encodeURIComponent(id)}?${identity}&seedVersion=${seedVersion}`);
 expect(response.ok()).toBe(true);
 expect(response.headers()['cache-control']).toBe('no-store');
 return await response.json() as PspReportDetail;
}
async function createDraft(request:APIRequestContext,snapshotId:string){
 const current=await reports(request);
 const body:ReportBody={snapshotId,nextActions:[],meta:{...manager,seedVersion:current.seedVersion,expectedVersion:current.ledgerRevision,clientRequestId:crypto.randomUUID()}};
 const response=await request.post(reportsEndpoint,{data:body});
 expect(response.ok()).toBe(true);
 return {body,result:await response.json() as CommandResult<PspReportVersion>};
}

test.beforeEach(async({request})=>{expect((await request.post('/api/reset')).ok()).toBe(true);await snapshots(request);});
test.afterAll(async({request})=>{expect((await request.post('/api/reset')).ok()).toBe(true);});

test('a frozen protected snapshot becomes a seven-chapter empty-arrangement draft with a separate workflow',async({page,request},testInfo)=>{
 const initial=await snapshots(request);
 const pro=await request.post(`/api/psp/assignments/${encodeURIComponent(`${PROJECT}:ENR-01:PRO:2026-10`)}/pro`,{data:{patientId:'P-A',scaleId:'endocrine_monthly_v1',items:{关节痛:3,潮热:1,情绪:1,睡眠:1},flags:{stopIntent:true,missedDoses14d:4},meta:{role:'patient',actorId:'P-A',seedVersion:initial.seedVersion,expectedVersion:1,clientRequestId:crypto.randomUUID()}}});
 expect(pro.ok()).toBe(true);
 await page.goto(`/governance/projects/${PROJECT}/snapshots`);
 await page.getByRole('button',{name:'冻结阶段服务快照',exact:true}).click();
 await expect(page.getByRole('heading',{name:'已冻结版本（1）',exact:true})).toBeVisible();
 const frozen=(await snapshots(request)).summaries[0];
 await page.getByLabel('选择冻结版本').selectOption(frozen.id);
 await page.getByRole('link',{name:'从此快照生成报告草稿',exact:true}).click();
 const desk=page.getByTestId('psp-report-draft-desk');
 await expect(desk).toBeVisible();
 await expect(desk.getByLabel('用于报告的冻结快照')).toHaveValue(frozen.id);
 await desk.getByRole('button',{name:'生成模板草稿',exact:true}).click();
 await expect(desk.getByRole('heading',{name:'已保存报告（1）',exact:true})).toBeVisible();
 const saved=(await reports(request)).summaries[0];
 await desk.getByLabel('选择报告版本').selectOption(saved.id);
 const detail=desk.getByTestId('psp-report-detail'),content=detail.getByTestId('psp-report-content');
 await expect(content.getByRole('heading',{level:3})).toHaveText(['项目范围','数据说明','服务执行','患者反馈','质量与限制','下一期服务安排','审核与交付']);
 await expect(detail.getByText('下一期服务安排尚未补充，待人工审核',{exact:true})).toHaveCount(2);
 await expect(content.getByTestId('psp-report-fact-questionnaire_completion')).toContainText('已保护 · 不展示精确结果');
 await expect(content).not.toContainText(/1 \/ 14|P-A|ENR-01|sourceRefs/);
 await expect(content.getByTestId('psp-report-workflow')).toHaveCount(0);
 const workflow=detail.getByTestId('psp-report-workflow');
 await expect(workflow).toContainText('数据审核：尚未签署 · 医学审核：尚未签署');
 await expect(workflow).toContainText('交付：尚未交付 · 客户验收：尚未验收');
 const before=await readReport(request,saved.id,initial.seedVersion);
 expect(before.report).toMatchObject({snapshotId:frozen.id,revision:1,nextActions:[],status:'draft',templateVersion:'psp-report-template-v1'});
 expect(before.warnings).toEqual(['下一期服务安排尚未补充，待人工审核']);
 expect(before.report.content.chapters[6].paragraphs.join('')).not.toMatch(/尚未签署|尚未交付|尚未验收/);
 for(const width of [390,640,755,800,1024,1280,1440,1920]){
  await page.setViewportSize({width,height:1100});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(desk.getByLabel('选择报告版本')).toBeVisible();
  if(width===390||width===1440){await page.screenshot({path:testInfo.outputPath(`psp-report-draft-${width}.png`),fullPage:true});await page.screenshot({path:testInfo.outputPath(`psp-report-top-${width}.png`)});}
 }
 expect((await readReport(request,saved.id,initial.seedVersion)).report).toEqual(before.report);
});

test('structured arrangements create a new revision while staff read frozen aggregate evidence and the old body stays unchanged',async({page,request})=>{
 const snapshot=await freeze(request),created=await createDraft(request,snapshot.id);
 const first=created.result.data;
 await page.goto(deskPath);
 const desk=page.getByTestId('psp-report-draft-desk');
 await desk.getByLabel('选择报告版本').selectOption(first.id);
 await desk.getByRole('button',{name:'以此版本创建修订',exact:true}).click();
 await expect(desk.getByLabel('父版本（留空为初稿）')).toHaveValue(first.id);
 await desk.getByRole('button',{name:'添加下一期安排',exact:true}).click();
 await desk.getByLabel('安排1：类别').selectOption('medical_review');
 await expect(desk.getByLabel('安排1：负责角色')).toHaveValue('doctor');
 await desk.getByLabel('安排1：上海时间',{exact:true}).fill('2026-10-13T10:00');
 await expect(desk.getByRole('button',{name:'生成模板草稿',exact:true})).toBeDisabled();
 await desk.getByLabel('安排1：上海时间',{exact:true}).fill('2026-10-14T11:30');
 await desk.getByLabel('安排1：状态').selectOption('in_progress');
 await desk.getByRole('button',{name:'添加下一期安排',exact:true}).click();
 await desk.getByLabel('安排2：类别').selectOption('data_quality');
 await desk.getByLabel('安排2：负责角色').selectOption('project_manager');
 await desk.getByLabel('安排2：上海时间',{exact:true}).fill('2026-10-15T09:00');
 await desk.getByRole('button',{name:'生成模板草稿',exact:true}).click();
 await expect(desk.getByRole('heading',{name:'已保存报告（2）',exact:true})).toBeVisible();
 const second=(await reports(request)).summaries.find(report=>report.id!==first.id)!;
 const revised=await readReport(request,second.id,snapshot.seedVersion);
 expect(revised.report).toMatchObject({revision:2,parentVersionId:first.id,batchId:first.batchId,snapshotId:snapshot.id});
 expect(revised.report.nextActions).toEqual([{category:'medical_review',responsibleRole:'doctor',dueAt:'2026-10-14T03:30:00.000Z',status:'in_progress'},{category:'data_quality',responsibleRole:'project_manager',dueAt:'2026-10-15T01:00:00.000Z',status:'planned'}]);
 expect(revised.warnings).toEqual([]);
 expect(revised.report.contentDigest).not.toBe(first.contentDigest);
 expect((await readReport(request,first.id,snapshot.seedVersion)).report).toEqual(first);
 await desk.getByLabel('选择报告版本').selectOption(second.id);
 const content=desk.getByTestId('psp-report-content');
 await expect(content).toContainText('医学复核；负责角色：医生；安排时间：2026-10-14 11:30:00（上海时间）；状态：安排进行中。');
 await expect(content).toContainText('安排状态仅表示计划推进，不证明临床或服务事项已完成。');
 const evidenceResponse=page.waitForResponse(response=>response.url().includes(`/snapshots/${encodeURIComponent(snapshot.id)}/metrics/questionnaire_completion/sources?`)&&response.ok());
 await desk.getByLabel('选择报告指标的内部来源').selectOption('questionnaire_completion');
 const evidence=await (await evidenceResponse).json() as PspMetricEvidence;
 expect(evidence).toMatchObject({snapshotId:snapshot.id,scope:'aggregate',metric:{key:'questionnaire_completion',numerator:0,denominator:14}});
 await expect(desk.getByTestId('psp-metric-evidence')).toContainText('冻结结果：0 / 14');
 await desk.getByTestId('psp-metric-evidence').getByText('资格与内容支持来源',{exact:true}).click();
 await expect(desk.getByTestId('psp-metric-evidence').getByRole('heading',{name:'固定服务计划',exact:true})).toHaveCount(14);
 await expect(content.getByTestId('psp-metric-evidence')).toHaveCount(0);
 for(const [role,label] of [['data_reviewer','数据审核者'],['medical_reviewer','医学审核者']]){
  await desk.getByLabel('报告工作身份').selectOption(role);
  await expect(desk.getByText(`${label} · 草稿安排只读`,{exact:true})).toBeVisible();
  await expect(desk.getByRole('button',{name:'生成模板草稿',exact:true})).toHaveCount(0);
  await desk.getByLabel('选择报告版本').selectOption(second.id);
  await expect(desk.getByTestId('psp-report-content')).toContainText('医学复核；负责角色：医生');
  await expect(desk.getByRole('button',{name:'以此版本创建修订',exact:true})).toHaveCount(0);
 }
 expect((await readReport(request,first.id,snapshot.seedVersion)).report).toEqual(first);
 expect((await readReport(request,second.id,snapshot.seedVersion)).report).toEqual(revised.report);
});

test('a lost success response retries the exact report command and replays one committed draft',async({page,request})=>{
 const snapshot=await freeze(request),bodies:string[]=[];
 const replies:CommandResult<PspReportVersion>[]=[];
 await page.route(`**${reportsEndpoint}`,async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  bodies.push(route.request().postData()!);
  const response=await route.fetch();
  expect(response.ok()).toBe(true);
  const reply=await response.json() as CommandResult<PspReportVersion>;
  replies.push(reply);
  if(bodies.length===1)await route.fulfill({status:503,contentType:'application/json',body:'{}'});
  else await route.fulfill({response,json:reply});
 });
 await page.goto(`${deskPath}?snapshotId=${encodeURIComponent(snapshot.id)}`);
 const desk=page.getByTestId('psp-report-draft-desk');
 await desk.getByRole('button',{name:'生成模板草稿',exact:true}).click();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toBeVisible();
 await expect(desk.getByLabel('用于报告的冻结快照')).toBeDisabled();
 expect((await reports(request)).summaries).toHaveLength(1);
 await desk.getByRole('button',{name:'重试同一次操作',exact:true}).click();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toHaveCount(0);
 await expect(desk.getByLabel('用于报告的冻结快照')).toBeEnabled();
 expect(bodies).toHaveLength(2);
 expect(bodies[1]).toBe(bodies[0]);
 expect(replies).toHaveLength(2);
 expect(replies[1]).toEqual(replies[0]);
 const current=await reports(request);
 expect(current.summaries).toHaveLength(1);
 expect(current.ledgerRevision).toBe(replies[0].ledgerRevision);
 expect((await readReport(request,replies[0].data.id,snapshot.seedVersion)).report).toEqual(replies[0].data);
});

test('a real ledger conflict needs acknowledgement and reset discards a pending command from the old seed',async({page,request})=>{
 const snapshot=await freeze(request),bodies:ReportBody[]=[];
 let mode:'conflict'|'pass'|'unavailable'='conflict';
 await page.route(`**${reportsEndpoint}`,async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  bodies.push(route.request().postDataJSON() as ReportBody);
  if(mode==='conflict'){mode='pass';await freeze(request);}
  if(mode==='unavailable')await route.fulfill({status:503,contentType:'application/json',body:'{}'});
  else await route.continue();
 });
 await page.goto(`${deskPath}?snapshotId=${encodeURIComponent(snapshot.id)}`);
 const desk=page.getByTestId('psp-report-draft-desk');
 await desk.getByRole('button',{name:'生成模板草稿',exact:true}).click();
 await expect(desk.getByRole('button',{name:'已核对最新报告与项目账，继续',exact:true})).toBeVisible();
 await expect(desk.getByLabel('用于报告的冻结快照')).toBeDisabled();
 expect((await reports(request)).summaries).toHaveLength(0);
 expect(bodies).toHaveLength(1);
 await desk.getByRole('button',{name:'已核对最新报告与项目账，继续',exact:true}).click();
 await expect(desk.getByLabel('用于报告的冻结快照')).toBeEnabled();
 await desk.getByRole('button',{name:'生成模板草稿',exact:true}).click();
 await expect(desk.getByRole('heading',{name:'已保存报告（1）',exact:true})).toBeVisible();
 expect(bodies).toHaveLength(2);
 expect(bodies[1].meta.clientRequestId).not.toBe(bodies[0].meta.clientRequestId);
 expect(bodies[1].meta.expectedVersion).toBeGreaterThan(bodies[0].meta.expectedVersion);
 const saved=(await reports(request)).summaries[0];
 await desk.getByLabel('选择报告版本').selectOption(saved.id);
 await desk.getByRole('button',{name:'以此版本创建修订',exact:true}).click();
 mode='unavailable';
 await desk.getByRole('button',{name:'生成模板草稿',exact:true}).click();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toBeVisible();
 expect((await request.post('/api/reset')).ok()).toBe(true);
 await desk.getByRole('button',{name:'刷新报告状态',exact:true}).click();
 await expect(desk.getByRole('heading',{name:'已保存报告（0）',exact:true})).toBeVisible();
 await expect(desk.getByRole('button',{name:'重试同一次操作',exact:true})).toHaveCount(0);
 await expect(desk.getByTestId('psp-report-detail')).toHaveCount(0);
 await expect(desk.getByLabel('选择报告版本')).toHaveValue('');
 await expect(desk.getByLabel('用于报告的冻结快照')).toHaveValue('');
 await expect(desk.getByLabel('父版本（留空为初稿）')).toHaveValue('');
 await expect(desk.getByRole('button',{name:'生成模板草稿',exact:true})).toBeDisabled();
 expect(bodies).toHaveLength(3);
 const stale=await request.post(reportsEndpoint,{data:bodies[2]});
 expect(stale.status()).toBe(409);
 expect(await stale.json()).toMatchObject({code:'stale_seed'});
 expect((await reports(request)).summaries).toHaveLength(0);
});

test('aggregate withdrawal blocks a fresh revision but preserves the old report and its original receipt replay',async({page,request})=>{
 const snapshot=await freeze(request),created=await createDraft(request,snapshot.id),first=created.result.data;
 const patientResponse=await request.get('/api/psp/patients/P-A/projects?role=patient&actorId=P-A');
 expect(patientResponse.ok()).toBe(true);
 const patient=await patientResponse.json() as PatientProjectsView;
 const enrollment=patient.projects.find(project=>project.project.id===PROJECT)!.enrollment;
 const withdrawn=await request.post(`/api/psp/enrollments/${encodeURIComponent(enrollment.id)}/permissions`,{data:{scope:'aggregate',action:'withdraw',meta:{role:'patient',actorId:'P-A',seedVersion:patient.seedVersion,expectedVersion:enrollment.version,clientRequestId:crypto.randomUUID()}}});
 expect(withdrawn.ok()).toBe(true);
 const current=await reports(request);
 const fresh=await request.post(reportsEndpoint,{data:{snapshotId:snapshot.id,parentVersionId:first.id,nextActions:[],meta:{...manager,seedVersion:current.seedVersion,expectedVersion:current.ledgerRevision,clientRequestId:crypto.randomUUID()}}});
 expect(fresh.status()).toBe(403);
 expect(fresh.headers()['cache-control']).toBe('no-store');
 expect(await fresh.json()).toMatchObject({code:'source_unusable'});
 const replay=await request.post(reportsEndpoint,{data:created.body});
 expect(replay.ok()).toBe(true);
 expect(await replay.json()).toEqual(created.result);
 expect(await reports(request)).toEqual(current);
 const historical=await readReport(request,first.id,snapshot.seedVersion);
 expect(historical.report).toEqual(first);
 expect(historical.createGate.canCreate).toBe(false);
 const historicalSnapshot=await request.get(`/api/psp/snapshots/${encodeURIComponent(snapshot.id)}?${identity}&seedVersion=${snapshot.seedVersion}`);
 expect(historicalSnapshot.ok()).toBe(true);
 expect((await historicalSnapshot.json()).snapshot).toEqual(snapshot);
 await page.goto(deskPath);
 const desk=page.getByTestId('psp-report-draft-desk');
 await desk.getByLabel('选择报告版本').selectOption(first.id);
 await expect(desk.getByTestId('psp-report-content')).toBeVisible();
 await expect(desk.getByRole('button',{name:'以此版本创建修订',exact:true})).toBeDisabled();
 await expect(desk.getByTestId('psp-report-detail')).toContainText(historical.createGate.reason!);
 await expect(desk.getByTestId('psp-report-detail')).toContainText(first.contentDigest);
});
