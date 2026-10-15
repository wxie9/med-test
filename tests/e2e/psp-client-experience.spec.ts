import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {PspReportVersion} from '@/lib/psp/reportTypes';
import {AcceptanceApi,PROJECT,meta,reportsUrl,snapshotsUrl,reportUrl,publicReportUrl,window as reportWindow} from './helpers/pspAcceptance';
import {openPublicReportBody} from './helpers/pharmaReading';
const path=(id:string)=>`/pharma/projects/${PROJECT}/reports/${encodeURIComponent(id)}`;
const states={suppressed:'已保护 · 本项不展示精确结果',unknown:'证据不足 · 本项暂不能判断',no_applicable:'本阶段无适用样本'};
const keys=['questionnaire_completion','contact_completion','education_completion','service_completion'];
async function actualDownload(page:Page,name:string){
 const pending=page.waitForEvent('download');await page.getByRole('link',{name,exact:true}).click();
 const file=await(await pending).path();expect(file).not.toBeNull();return readFile(file!);
}
async function assertFits(page:Page,width:number){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 const clipped=await page.locator('button,a,input,textarea,select').evaluateAll(nodes=>nodes.filter(node=>{
  const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
  return rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&(rect.left< -1||rect.right>innerWidth+1);
 }).map(node=>node.textContent||node.getAttribute('aria-label')));
 expect(clipped).toEqual([]);
}
test.beforeEach(async({request})=>{await new AcceptanceApi(request).reset();});

test('scope: only actual delivery appears after draft and dual signatures',async({page,request})=>{
 const api=new AcceptanceApi(request);
 const snapshots=await api.snapshots();
 const snapshot=await api.command<{id:string}>(snapshotsUrl,{window:reportWindow,meta:meta(snapshots.seedVersion,snapshots.ledgerRevision)});
 const list=await api.reports();let report=await api.command<PspReportVersion>(reportsUrl,{snapshotId:snapshot.id,nextActions:[],meta:meta(list.seedVersion,list.ledgerRevision)});
 for(const stage of ['draft','approved']){
  if(stage==='approved')for(const [body,role] of [[{action:'submit'},'project_manager'],[{action:'review',kind:'data',decision:'approve'},'data_reviewer'],[{action:'review',kind:'medical',decision:'approve'},'medical_reviewer']] as const)
   report=await api.command<PspReportVersion>(`${reportUrl(report.id)}/actions`,{...body,meta:meta(report.seedVersion,report.version,role)});
  await page.goto(`/pharma/projects/${PROJECT}`);
  await expect(page.getByText('本阶段尚无已交付报告。完成双审核并由项目经理交付后可在此查看。')).toBeVisible();
  await expect(page.getByRole('heading',{name:'本阶段交付构成',exact:true})).toBeVisible();
  await expect(page.locator('a[href*="/reports/"]')).toHaveCount(0);expect((await api.pharma()).reports).toEqual([]);
 }
 await api.command(`${reportUrl(report.id)}/actions`,{action:'deliver',meta:meta(report.seedVersion,report.version)});
 await page.getByRole('button',{name:'刷新项目与授权',exact:true}).click();
 await expect(page.getByRole('link',{name:'查看本次交付 · 修订 1',exact:true})).toHaveAttribute('href',path(report.id));
});

test('reading: current frozen facts, all chapters, original definitions and historical notice remain reachable',async({page,request})=>{
 const api=new AcceptanceApi(request),{report}=await api.delivered(),dto=await api.external(report);
 if(!('content' in dto))throw new Error('Expected readable report');
 await page.goto(path(report.id));const summary=page.getByTestId('psp-pharma-reading-summary');await expect(summary).toBeVisible();
 await expect(page.getByTestId('psp-pharma-report-content')).toHaveCount(0);
 const facts=dto.content.chapters.flatMap(chapter=>chapter.facts);
 expect(facts).toHaveLength(40);expect(new Set(facts.map(fact=>fact.metricKey)).size).toBe(40);
 for(const key of keys){const fact=facts.find(fact=>fact.metricKey===key)!;const row=summary.getByRole('listitem').filter({has:page.getByRole('heading',{name:fact.label,exact:true})});
  await expect(row).toHaveCount(1);
  if(fact.status==='available'){
   const value=fact.numerator!==undefined&&fact.denominator!==undefined?`${fact.numerator} / ${fact.denominator}`:new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(fact.value!);
   await expect(row).toContainText(value);if(fact.sampleN!==undefined)await expect(row).toContainText(`适用样本 ${fact.sampleN}`);
  }else await expect(row).toContainText(states[fact.status]);
 }
 await expect(page.getByTestId('psp-pharma-next-actions')).toContainText('本版未列下一期服务安排');
 await expect(page.getByText(dto.content.notice,{exact:true})).toHaveCount(0);
 await openPublicReportBody(page);const body=page.getByTestId('psp-pharma-report-content');
 await expect(body.getByRole('heading',{level:3})).toHaveCount(7);
 for(const fact of facts){const row=body.getByTestId(`psp-report-fact-${fact.metricKey}`);await expect(row).toBeVisible();
  await row.getByRole('button',{name:`查看口径：${fact.label}`,exact:true}).click();await expect(row.getByText(fact.definition,{exact:true})).toBeVisible();
 }
 await page.getByRole('button',{name:'原文生成记录',exact:true}).click();await expect(page.getByText(dto.content.notice,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'核对资料',exact:true}).click();await expect(page.getByText(`内容校验码：${dto.contentDigest}`,{exact:true})).toBeVisible();
 const shanghai=(value:string)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
 expect(dto.window.periodEnd).not.toBe(dto.window.cutoffAt);
 await expect(page.getByText(`完整统计窗口：${shanghai(dto.window.periodStart)} 至 ${shanghai(dto.window.periodEnd)}（上海时间，结束边界不含）；阶段截止：${shanghai(dto.window.cutoffAt)}。`,{exact:true})).toBeVisible();
});

for(const action of ['accept','request_changes'] as const)test(`fixed files: readonly browsing then ${action} keeps content and both download formats byte-identical`,async({page,request},info)=>{
 const api=new AcceptanceApi(request),{report}=await api.delivered(),before=await api.external(report);
 if(!('artifact' in before))throw new Error('Expected readable report');
 const query=api.publicQuery(report,(await api.pharma()).authorizationVersion);
 const downloads=async()=>{
  const result:Record<string,Buffer>={};for(const format of ['text','html']){const response=await request.get(`${publicReportUrl(report.id)}/download?${query}&format=${format}`);expect(response.ok()).toBe(true);result[format]=await response.body();}return result;
 };
 const filesBefore=await downloads(),ledgerBefore=(await api.reports()).ledgerRevision,detailBefore=await api.detail(report);
 const writes:string[]=[];page.on('request',r=>{if(r.method()==='POST')writes.push(r.postData()!);});
 await page.goto(path(report.id));await openPublicReportBody(page);
 await page.getByRole('button',{name:'核对资料',exact:true}).click();await page.getByRole('button',{name:'原文生成记录',exact:true}).click();
 await page.getByRole('button',{name:'刷新当前报告内容',exact:true}).click();await expect(page.getByTestId('psp-pharma-reading-summary')).toBeVisible();
 expect(await actualDownload(page,'下载固定文本')).toEqual(filesBefore.text);expect(await actualDownload(page,'下载固定HTML')).toEqual(filesBefore.html);
 expect(filesBefore.text.toString()).toBe(before.artifact.text);expect(createHash('sha256').update(filesBefore.text).digest('hex')).toBe(before.artifact.digest);
 expect(writes).toEqual([]);expect((await api.reports()).ledgerRevision).toBe(ledgerBefore);
 const readonlyDetail=await api.detail(report);expect(readonlyDetail.timeline).toEqual(detailBefore.timeline);expect(readonlyDetail.workflow.history).toEqual(detailBefore.workflow.history);
 const checklist=page.getByTestId('psp-pharma-delivery-checklist');await expect(checklist.getByRole('link')).toHaveCount(3);await expect(checklist.getByRole('checkbox')).toHaveCount(0);
 if(action==='accept')await page.getByRole('button',{name:'验收此版本',exact:true}).click();
 else{await expect(page.getByRole('button',{name:'请求修改',exact:true})).toBeDisabled();await page.getByLabel('客户意见',{exact:true}).fill('请补充下一期安排\n'+'较长核对意见'.repeat(40));await page.getByRole('button',{name:'请求修改',exact:true}).click();}
 await expect(page.getByRole('heading',{name:action==='accept'?'客户已验收 · 修订 1':'客户已请求修改 · 修订 1',exact:true})).toBeVisible();
 const after=await api.external(report);if(!('artifact' in after))throw new Error('Expected readable feedback');
 expect(after.content).toEqual(before.content);expect(after.contentDigest).toBe(before.contentDigest);expect(after.artifact).toEqual(before.artifact);expect(await downloads()).toEqual(filesBefore);
 expect(writes).toHaveLength(1);expect(JSON.parse(writes[0])).toMatchObject({action,meta:{expectedVersion:before.version,seedVersion:before.seedVersion}});
 await expect(page.getByRole('button',{name:'验收此版本',exact:true})).toBeDisabled();
 if(action==='accept')await expect(page.getByText('本版本已验收。下期安排继续按实际进度执行，验收不代表安排已完成。')).toBeVisible();
 await page.screenshot({path:info.outputPath(`customer-${action}.png`),fullPage:true});
});

test('layout: status and first summary fact lead desktop viewports and reflow in all four widths',async({page,request},info)=>{
 const api=new AcceptanceApi(request),{report}=await api.delivered();
 for(const [width,height] of [[1280,720],[1440,900]] as const){
  await page.setViewportSize({width,height});await page.goto(path(report.id));
  await expect(page.getByRole('heading',{name:'已交付，待客户反馈 · 修订 1',exact:true})).toBeInViewport();
  await expect(page.getByText(/^阶段数据：/)).toBeInViewport();
  await expect(page.getByRole('heading',{name:'本版阅读提要',exact:true})).toBeInViewport();
  await expect(page.getByTestId('psp-pharma-reading-summary').getByRole('listitem').first()).toBeInViewport();
  expect(await page.evaluate(()=>scrollY)).toBe(0);await expect(page.getByText(/^内容校验码：/)).toHaveCount(0);
  await page.screenshot({path:info.outputPath(`first-viewport-${width}x${height}.png`)});
 }
 for(const width of [390,755,1440,1920]){
  await page.setViewportSize({width,height:900});await page.goto(path(report.id));await expect(page.getByTestId('psp-pharma-reading-summary')).toBeVisible();await assertFits(page,width);
  await page.screenshot({path:info.outputPath(`reading-default-${width}.png`),fullPage:true});
  await page.getByLabel('客户意见',{exact:true}).fill('长意见'+ 'A'.repeat(600));
  await openPublicReportBody(page);await page.getByRole('button',{name:'核对资料',exact:true}).click();await assertFits(page,width);
  await page.screenshot({path:info.outputPath(`reading-expanded-${width}.png`),fullPage:true});
 }
});

test('keyboard: disclosures and original hashes reveal their targets through same-hash and browser history',async({page,request})=>{
 const {report}=await new AcceptanceApi(request).delivered(),url=path(report.id);
 const writes:string[]=[];page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
 await page.goto(url);
 const toggle=page.getByRole('button',{name:'展开完整报告',exact:true});await expect(toggle).toHaveAttribute('aria-expanded','false');
 for(let step=0;step<80&&!await toggle.evaluate(node=>node===document.activeElement);step++)await page.keyboard.press('Tab');
 await expect(toggle).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();
 const opened=page.getByRole('button',{name:'收起完整报告',exact:true});await expect(opened).toBeFocused();await expect(opened).toHaveAttribute('aria-expanded','true');
 await page.keyboard.press('Enter');await expect(page.getByTestId('psp-pharma-report-content')).toHaveCount(0);await expect(toggle).toHaveAttribute('aria-expanded','false');
 const nav=page.getByRole('navigation',{name:'交付报告章节导航'});
 await nav.getByRole('link',{name:'固定正文',exact:true}).click();await expect(page.locator('#public-report-body-heading')).toBeFocused();
 await page.getByRole('button',{name:'收起完整报告',exact:true}).click();await nav.getByRole('link',{name:'固定正文',exact:true}).click();await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();await expect(page.locator('#public-report-body-heading')).toBeFocused();
 await nav.getByRole('link',{name:'签署时间线',exact:true}).click();await expect(page.locator('#public-report-timeline')).toBeFocused();
 await nav.getByRole('link',{name:'核对本次交付',exact:true}).click();await expect(page.locator('#public-report-feedback')).toBeFocused();
 await page.goBack();await expect(page.locator('#public-report-timeline')).toBeFocused();await page.goBack();await expect(page.locator('#public-report-body-heading')).toBeFocused();await page.goForward();await expect(page.locator('#public-report-timeline')).toBeFocused();
 await page.goto(url+'#public-report-body');await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();await expect(page.locator('#public-report-body-heading')).toBeFocused();
 // Check every report disclosure; the Next development-tools portal is outside this product surface.
 const disclosures=page.locator('[data-testid="psp-pharma-reading-summary"] button[aria-controls], [data-testid="psp-pharma-reading-evidence"] button[aria-controls]');
 await expect(disclosures).toHaveCount(54);
 expect(await disclosures.evaluateAll(buttons=>buttons.filter(button=>document.getElementById(button.getAttribute('aria-controls')!)===null).map(button=>({name:button.getAttribute('aria-label')||button.textContent,target:button.getAttribute('aria-controls')})))).toEqual([]);
 expect(writes).toEqual([]);
});
