import {test,expect,type Page} from '@playwright/test';
import {AcceptanceApi} from './helpers/pspAcceptance';
import {connectedStory,PROJECT,deskPath,role,detail} from './helpers/pspStory';
async function fits(page:Page,width:number){expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
test.beforeEach(async({request})=>{await new AcceptanceApi(request).reset();});
test('queue filters retain unrelated work and real links naturally reveal asynchronously loaded targets',async({page,request},info)=>{
 const api=new AcceptanceApi(request),initial=await api.internal();
 await page.goto(`/clinic/projects/${PROJECT}/services`);await page.getByLabel('切换身份').selectOption('个案管理师小陈');
 const queue=page.getByRole('region',{name:'待处理事项'});await expect(queue).toBeVisible();
 const filter=queue.getByLabel('事项类型');await filter.focus();await expect(filter).toBeFocused();await filter.selectOption('overdue_questionnaire');await expect(filter).toHaveValue('overdue_questionnaire');
 const item=initial.exceptions.find(r=>r.patientId==='P-A'&&r.kind==='overdue_questionnaire')!;expect(item).toBeDefined();
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});await fits(page,width);await queue.screenshot({path:info.outputPath(`queue-${width}.png`)});await page.screenshot({path:info.outputPath(`queue-viewport-${width}.png`)});}
 const link=queue.locator(`a[href="${item.target.href}"]`);await link.focus();await expect(link).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(new RegExp('/clinic/patients/P-A#'));
 const target=page.locator(`[id="assignment-${item.target.id}"]`);await expect(target).toBeVisible();await expect(target).toBeInViewport();
 expect((await api.internal()).exceptions.map(r=>r.id)).toEqual(initial.exceptions.map(r=>r.id));
});
test('revision review joins the real care story with explicit parent feedback, same-snapshot facts and current signatures',async({page,request},info)=>{
 test.setTimeout(300000);const story=await connectedStory(page,request,'运营验收内部退回：请补充下一期医学复核安排及负责角色。\n'+'需核对安排的类别、负责角色、上海时间及计划状态；字段变化不能证明问题已充分解决。'.repeat(6)),api=new AcceptanceApi(request);
 const current=await detail(request,story.childId,story.seed),comparison=current.revisionComparison;
 expect(comparison.status).toBe('compared');if(comparison.status!=='compared')throw new Error('Expected explicit comparison');
 expect(comparison.parent.id).toBe(story.firstId);expect(comparison.parent.workflow.returnReview?.reason).toBe(story.reason);expect(comparison.snapshot.idChanged).toBe(false);expect(comparison.metrics).toHaveLength(40);expect(comparison.metrics.map(m=>m.metricKey).sort()).toEqual(current.report.content.chapters.flatMap(c=>c.facts.map(f=>f.metricKey)).sort());expect(comparison.metrics.every(m=>m.change==='unchanged')).toBe(true);expect(comparison.nextActions.added).toHaveLength(1);expect(comparison.nextActions.removed).toEqual([]);
 const external=await api.external(story.report);const serialized=JSON.stringify(external);for(const forbidden of ['revisionComparison','exceptions',story.reason,story.firstId])expect(serialized).not.toContain(forbidden);
 await page.goto(deskPath);await role(page,story.childId,'data_reviewer');const desk=page.getByTestId('psp-report-draft-desk'),review=desk.getByTestId('psp-report-revision-review');await expect(review).toContainText(story.reason);await expect(review).toContainText('可展示指标未变');await expect(review).toContainText('同一快照');await expect(review).toContainText('数据审核：已签署');await expect(review).toContainText('医学审核：已签署');
 const disclosure=review.locator('summary').filter({hasText:'新增安排（1）'});await disclosure.focus();await expect(disclosure).toBeFocused();await page.keyboard.press('Enter');await expect(review).toContainText('2026/10/14');
 for(const identity of ['medical_reviewer','project_manager']){await desk.getByLabel('报告工作身份').selectOption(identity);await expect(desk.getByLabel('选择报告版本')).toHaveValue(story.childId);await expect(review).toContainText(story.reason);}
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});await fits(page,width);if(!await disclosure.evaluate(node=>(node.parentElement as HTMLDetailsElement).open))await disclosure.click();await review.screenshot({path:info.outputPath(`review-pack-${width}.png`)});await page.screenshot({path:info.outputPath(`review-viewport-${width}.png`)});}
 await info.attach('operations-review-evidence',{body:JSON.stringify({story,comparison},null,2),contentType:'application/json'});
});
test('queue follows actual questionnaire, partial contact recovery, doctor closure and explicit education followup completion',async({page,request},info)=>{
 test.setTimeout(300000);const api=new AcceptanceApi(request),before=await api.internal();
 const unrelated=before.exceptions.filter(r=>r.patientId!=='P-A').map(r=>r.id);
 const rows=async()=>(await api.internal()).exceptions;
 const assertUnrelated=async()=>{const ids=(await rows()).map(r=>r.id);for(const id of unrelated)expect(ids).toContain(id);};
 await page.goto('/patient/plan?patient=P-A');await page.getByRole('link',{name:'填写项目问卷',exact:true}).click();
 for(const [label,value] of [['关节痛',3],['潮热',1],['情绪',1],['睡眠',1]] as const){const slider=page.getByRole('slider',{name:label,exact:true});await slider.focus();await page.keyboard.press('Home');for(let n=0;n<value;n++)await page.keyboard.press('ArrowRight');}
 await page.getByTestId('missed-doses').fill('4');await page.getByTestId('stop-intent').check();await page.getByTestId('submit-project-pro').click();await expect(page.getByTestId('project-pro-completion')).toContainText('已完成');expect((await rows()).some(r=>r.patientId==='P-A'&&r.kind==='overdue_questionnaire')).toBe(false);await assertUnrelated();
 await page.goto('/clinic/patients/P-A');await page.getByLabel('切换身份').selectOption('个案管理师小陈');const workflow=page.getByTestId('psp-service-workflow'),form=page.getByTestId('psp-contact-form');await expect(form).toBeVisible();
 const alerts=(await api.services()).alerts;expect(alerts).toHaveLength(2);
 for(const a of alerts){const row=page.getByTestId(`psp-alert-${a.id}`);await row.getByRole('button',{name:'接单',exact:true}).click();await row.getByRole('button',{name:'开始处置',exact:true}).click();}
 for(const checkbox of await form.getByRole('checkbox').all())await checkbox.check();
 await form.getByLabel('联系结果',{exact:true}).selectOption('no_answer');await form.getByRole('button',{name:'记录本次联系',exact:true}).click();await expect(workflow.getByText('实际联系 1 次，按联系事实计数。')).toBeVisible();
 let failed=(await rows()).filter(r=>r.patientId==='P-A'&&r.kind==='failed_contact');expect(failed).toHaveLength(1);expect([failed[0].target,...failed[0].additionalTargets].filter(t=>t.kind==='alert').map(t=>t.id).sort()).toEqual(alerts.map(a=>a.id).sort());
 // First recovery covers only one alert; the other alert and fixed contact plan remain.
 await form.getByLabel('关联固定联系计划').selectOption('');const covers=form.getByRole('checkbox');await covers.nth(1).uncheck();await form.getByLabel('联系结果',{exact:true}).selectOption('reached');await form.getByRole('button',{name:'记录本次联系',exact:true}).click();await expect(workflow.getByText('实际联系 2 次，按联系事实计数。')).toBeVisible();failed=(await rows()).filter(r=>r.patientId==='P-A'&&r.kind==='failed_contact');expect(failed).toHaveLength(1);const remaining=[failed[0].target,...failed[0].additionalTargets];expect(remaining.some(t=>t.id===alerts[0].id)).toBe(false);expect(remaining.some(t=>t.id===alerts[1].id)).toBe(true);
 await covers.nth(0).uncheck();await covers.nth(1).check();const contact=(await api.services()).assignments.find(a=>a.kind==='contact'&&a.status==='open')!;await form.getByLabel('关联固定联系计划').selectOption(contact.id);await form.getByRole('button',{name:'记录本次联系',exact:true}).click();await expect(workflow.getByText('实际联系 3 次，按联系事实计数。')).toBeVisible();expect((await rows()).some(r=>r.patientId==='P-A'&&r.kind==='failed_contact')).toBe(false);await assertUnrelated();
 for(const a of alerts){const row=page.getByTestId(`psp-alert-${a.id}`);await row.getByLabel('处置类别',{exact:true}).selectOption('contacted');await row.getByLabel('处置摘要').fill('运营验收：实际成功联系，提交复核');await row.getByLabel(/复核引用联系：.*已接通/).check();await row.getByRole('button',{name:'提交本预警复核',exact:true}).click();await expect(row.getByText('待复核',{exact:true})).toBeVisible();}
 const pending=(await rows()).filter(r=>r.patientId==='P-A'&&r.kind==='pending_review');expect(pending).toHaveLength(2);for(const row of pending){expect(row.dueAt).toBeUndefined();expect(row.overdue).toBe(false);}
 await page.goto(`/clinic/projects/${PROJECT}/services`);const queue=page.getByRole('region',{name:'待处理事项'});await queue.getByLabel('事项类型').selectOption('pending_review');await expect(queue.getByText('尚未设定复核时限',{exact:true})).toHaveCount(2);for(const alert of alerts)await expect(queue.getByText(new RegExp(alert.rule.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))).toBeVisible();await queue.screenshot({path:info.outputPath('same-patient-pending-reviews.png')});
 await queue.locator(`a[href="${pending[1].target.href}"]`).click();await expect(page.locator(`[id="alert-${pending[1].target.id}"]`)).toBeInViewport();
 await page.getByLabel('切换身份').selectOption('张医生');
 for(const a of alerts){const row=page.getByTestId(`psp-alert-${a.id}`);await row.getByLabel('医生复核意见').fill('运营验收复核，另建未来复评');await row.getByLabel('未来任务责任人').fill('张医生');await row.getByLabel('未来复评时间（上海时间）').fill('2026-10-14T10:30');await row.getByRole('button',{name:'确认复核并关闭本预警',exact:true}).click();await expect(row.getByText('已关闭',{exact:true})).toBeVisible();}
 expect((await rows()).some(r=>r.patientId==='P-A'&&r.kind==='pending_review')).toBe(false);await assertUnrelated();
 await page.getByLabel('切换身份').selectOption('个案管理师小陈');const service=await api.services(),education=service.education.find(e=>!e.sentAt)!;const card=page.getByTestId(`psp-education-${education.assignmentId}`);await card.getByLabel('已批准的合成内容版本').selectOption(service.approvedContents[0].id);await card.getByRole('button',{name:'发送教育资料',exact:true}).click();await expect(card).toContainText('尚未确认阅读');
 await page.goto(`/patient/education/${encodeURIComponent(education.assignmentId)}?patient=P-A`);await page.getByRole('button',{name:'我已阅读',exact:true}).click();await page.getByLabel('仍需服务团队帮助',{exact:true}).check();await page.getByRole('button',{name:'提交阅读反馈',exact:true}).click();await expect(page.getByTestId('education-feedback-saved')).toContainText('仍需帮助');
 const help=(await rows()).filter(r=>r.patientId==='P-A'&&r.kind==='education_help');expect(help).toHaveLength(1);expect(help[0].target.kind).toBe('assignment');const followup=(await api.services()).assignments.find(a=>a.id===help[0].target.id)!;expect(followup.status).toBe('open');
 await page.goto('/clinic/patients/P-A');await page.getByLabel('切换身份').selectOption('个案管理师小陈');await form.getByLabel('关联固定联系计划').selectOption(followup.id);await form.getByLabel('联系结果',{exact:true}).selectOption('reached');await form.getByRole('button',{name:'记录本次联系',exact:true}).click();await expect(workflow.getByText('实际联系 4 次，按联系事实计数。')).toBeVisible();expect((await api.services()).assignments.find(a=>a.id===followup.id)?.status).toBe('completed');expect((await rows()).some(r=>r.patientId==='P-A'&&r.kind==='education_help')).toBe(false);await assertUnrelated();
 await info.attach('queue-transition-evidence',{body:JSON.stringify({unrelated,pending,help,final:await rows()},null,2),contentType:'application/json'});
});
