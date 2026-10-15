import {test,expect} from '@playwright/test';
import {connectedStory,PROJECT,deskPath} from './helpers/pspStory';
test.use({trace:'on'});
test('eight widths keep workbench, deep report, source navigation, patient bridges and public timeline accessible',async({page,request},info)=>{
 test.setTimeout(300000);expect((await request.post('/api/reset')).ok()).toBe(true);const story=await connectedStory(page,request);
 for(const width of [390,640,755,800,1024,1280,1440,1920]){
  await page.setViewportSize({width,height:1100});
  for(const [name,path,testId] of [['workbench',deskPath,'psp-report-draft-desk'],['detail',`${deskPath}/${encodeURIComponent(story.childId)}`,'psp-report-detail'],['sources',`/governance/projects/${PROJECT}/snapshots?snapshotId=${encodeURIComponent(story.snapshotId)}`,'psp-snapshot-detail'],['public',`/pharma/projects/${PROJECT}/reports/${encodeURIComponent(story.childId)}`,'psp-pharma-report-content']] as const){
   await page.goto(path);await expect(page.getByTestId(testId)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${name} at ${width}`).toBeLessThanOrEqual(width);const clipped=await page.locator('button,input,select,textarea,a').evaluateAll(nodes=>nodes.filter(node=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node);return r.width>0&&r.height>0&&style.visibility!=='hidden'&&(r.left < -1||r.right>innerWidth+1);}).map(node=>node.textContent?.trim()||node.getAttribute('aria-label')||node.tagName));expect(clipped,`${name} interactive controls at ${width}`).toEqual([]);
   if(name==='workbench'){const acceptedCard=page.getByRole('article').filter({has:page.getByRole('heading',{name:'修订 2 · 客户已验收',exact:true})});await expect(acceptedCard).toContainText('下一步：查看固定交付与客户验收记录');await expect(acceptedCard).not.toContainText('下一步：仅双签审核通过版本可交付');}if(name==='detail'){await expect(page.getByLabel('选择报告指标的内部来源')).toBeVisible();await expect(page.getByTestId('psp-report-review-panel')).toBeVisible();const nav=page.getByRole('navigation',{name:'报告章节导航'});await expect(nav).toBeVisible();const timeline=nav.getByRole('link',{name:'签署时间线',exact:true});await timeline.focus();await expect(timeline).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByRole('region',{name:'批次签署与版本时间线'})).toBeInViewport();await expect(page.getByRole('region',{name:'批次签署与版本时间线'}).getByRole('listitem')).toHaveCount(10);}
   if(width===390||width===1440)await page.screenshot({path:info.outputPath(`${name}-${width}.png`),fullPage:true});
  }
  for(const path of ['/patient/plan?patient=P-A','/patient/messages?patient=P-A']){await page.goto(path);const link=page.getByRole('link',{name:'阅读教育资料',exact:true});await expect(link).toHaveAttribute('href',story.educationHref);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 }
});
test('empty workbench explains missing snapshot and controlled read failure offers recovery',async({page,request})=>{
 expect((await request.post('/api/reset')).ok()).toBe(true);await page.goto(deskPath);const desk=page.getByTestId('psp-report-draft-desk');await expect(desk).toContainText('尚无保存的报告');await expect(desk.getByRole('button',{name:'生成模板草稿',exact:true})).toBeDisabled();
 await page.route(`**/api/psp/projects/${PROJECT}/reports?*`,route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));await page.reload();await expect(desk.getByRole('status')).toContainText(/无法|失败|503/);await expect(desk.getByRole('button',{name:/重新加载|刷新/}).first()).toBeVisible();await page.unroute(`**/api/psp/projects/${PROJECT}/reports?*`);await desk.getByRole('button',{name:/重新加载|刷新/}).first().click();await expect(desk).toContainText('尚无保存的报告');
});
