import {test,expect,type Page} from '@playwright/test';
import {PROJECT,projects,services} from './helpers/pspStory';
test.use({trace:'on',viewport:{width:390,height:400}});
const patientRead='**/api/psp/patients/P-A/projects?*';
async function delayPatientRead(page:Page){await page.route(patientRead,async route=>{if(route.request().method()==='GET')await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});}
async function exactTarget(page:Page,id:string){const target=page.locator(`[id="${id}"]`);await expect(target).toBeInViewport({ratio:1});await expect(target).toBeFocused();}
test('actual questionnaire return waits for the exact plan after delayed patient GET',async({page,request},info)=>{
 expect((await request.post('/api/reset')).ok()).toBe(true);const assignment=(await projects(request)).projects[0].assignments.find(a=>a.kind==='questionnaire')!;
 await page.goto('/patient/plan?patient=P-A');await page.getByRole('link',{name:'填写项目问卷',exact:true}).click();await expect(page.getByRole('link',{name:'返回固定计划',exact:true})).toBeVisible();await delayPatientRead(page);
 const back=page.getByRole('link',{name:'返回固定计划',exact:true});await back.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(new RegExp(`#assignment-${encodeURIComponent(assignment.id)}$`));await exactTarget(page,`assignment-${assignment.id}`);await page.screenshot({path:info.outputPath('questionnaire-plan-390x400.png')});
});
test('actual education returns wait for exact message and plan after delayed patient GET',async({page,request},info)=>{
 expect((await request.post('/api/reset')).ok()).toBe(true);const view=await services(request),education=view.education.find(e=>!e.sentAt)!;
 await page.goto('/clinic/patients/P-A');await page.getByLabel('切换身份').selectOption('个案管理师小陈');const card=page.getByTestId(`psp-education-${education.assignmentId}`);await card.getByLabel('已批准的合成内容版本').selectOption(view.approvedContents[0].id);await card.getByRole('button',{name:'发送教育资料',exact:true}).click();await expect(card.getByText(/尚未确认阅读/)).toBeVisible();
 await page.goto('/patient/messages?patient=P-A');await page.getByTestId('psp-message-education').getByRole('link',{name:'阅读教育资料',exact:true}).click();await expect(page.getByRole('link',{name:'返回服务消息',exact:true})).toBeVisible();await delayPatientRead(page);await page.getByRole('link',{name:'返回服务消息',exact:true}).click();await exactTarget(page,`education-${education.assignmentId}`);await page.screenshot({path:info.outputPath('education-message-390x400.png')});
 await page.getByRole('link',{name:'查看此服务计划',exact:true}).click();await exactTarget(page,`assignment-${education.assignmentId}`);await page.screenshot({path:info.outputPath('education-plan-390x400.png')});
});
test('actual service desk bridge reaches the clinical workflow after delayed clinical GET',async({page,request},info)=>{
 expect((await request.post('/api/reset')).ok()).toBe(true);await page.goto(`/clinic/projects/${PROJECT}/services`);await page.getByLabel('切换身份').selectOption('个案管理师小陈');const member=page.getByTestId('psp-member').filter({hasText:'P-A'});await expect(member).toBeVisible();
 await page.route('**/api/patients/P-A',async route=>{if(route.request().method()==='GET')await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});await member.getByRole('link',{name:'联系、复核与教育',exact:true}).click();await expect(page).toHaveURL(/\/clinic\/patients\/P-A#psp-service-workflow$/);await expect(page.getByTestId('psp-service-workflow').getByText(/当前患者：/)).toBeVisible();await expect(page.getByTestId('psp-service-workflow')).toBeInViewport();await page.screenshot({path:info.outputPath('clinical-bridge-390x400.png')});
});
