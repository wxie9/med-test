import {expect,type Page} from '@playwright/test';
export async function openPublicReportBody(page:Page):Promise<void>{
 await expect(page.getByTestId('psp-pharma-reading-summary')).toBeVisible();
 const toggle=page.locator('#public-report-body').getByRole('button',{name:/^(展开|收起)完整报告$/});
 if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();
}
