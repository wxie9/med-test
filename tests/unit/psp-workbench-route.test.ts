// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NOT_FOUND');}}));
it('decodes one encoded internal report path and retains the known reviewer preset',async()=>{
 const {default:Page}=await import('@/app/governance/projects/[projectId]/reports/[reportVersionId]/page');
 const result=await Page({params:Promise.resolve({projectId:'PSP%3Aone',reportVersionId:'psp-report%3Aone'}),searchParams:Promise.resolve({role:'medical_reviewer'})});
 expect(result.props).toMatchObject({projectId:'PSP:one',initialReportId:'psp-report:one',initialRole:'medical_reviewer'});
});
it('malformed internal path fails closed and double encoding decodes only once',async()=>{
 const {default:Page}=await import('@/app/governance/projects/[projectId]/reports/[reportVersionId]/page');
 await expect(Page({params:Promise.resolve({projectId:'%',reportVersionId:'r'}),searchParams:Promise.resolve({role:'patient'})})).rejects.toThrow('NOT_FOUND');
 const result=await Page({params:Promise.resolve({projectId:'PSP',reportVersionId:'psp%253Ar'}),searchParams:Promise.resolve({role:'unknown'})});
 expect(result.props).toMatchObject({initialReportId:'psp%3Ar',initialRole:'project_manager'});
});
