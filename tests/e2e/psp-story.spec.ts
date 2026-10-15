import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connectedStory,PROJECT,read} from './helpers/pspStory';
import type {PharmaReportView} from '@/lib/psp/pharmaView';
test.use({trace:'on'});
test('S1–S11 joins UI questionnaire, clinical care, education, frozen evidence, revised dual signatures and customer acceptance',async({page,request},info)=>{
 test.setTimeout(300000);expect((await request.post('/api/reset')).ok()).toBe(true);
 const writes:string[]=[];page.on('request',r=>{if(r.method()==='POST')writes.push(new URL(r.url()).pathname);});
 const story=await connectedStory(page,request);
 const overview=await read<{authorizationVersion:number}>(request,`/api/pharma/projects/${PROJECT}`);
 const q=new URLSearchParams({role:'pharma_owner',actorId:'pharma-owner-a',seedVersion:String(story.seed),authorizationVersion:String(overview.authorizationVersion),periodStart:story.report.window.periodStart,periodEnd:story.report.window.periodEnd});
 const external=await read<PharmaReportView>(request,`/api/pharma/projects/${PROJECT}/reports/${encodeURIComponent(story.childId)}?${q}`);expect(external.gate.status).toBe('available');if(!('artifact'in external))throw new Error('Expected gated public artifact');
 const forbidden=[...story.internalProvenance,story.reason,'P-A','ENR-01','data-reviewer-psp','medical-reviewer-psp'];const safe=(value:unknown)=>{const text=typeof value==='string'?value:JSON.stringify(value);for(const id of forbidden)expect(text).not.toContain(id);};safe(external);const visit=(value:unknown)=>{if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){expect(['patientId','enrollmentId','actorId','createdBy','submittedBy','sourceRefs','factIds','locator','snapshotId','snapshotDigest']).not.toContain(key);visit(child);}};visit(external);
 for(const fact of external.content.chapters.flatMap(c=>c.facts).filter(f=>f.status!=='available'))for(const key of ['value','sampleN','numerator','denominator'])expect(fact).not.toHaveProperty(key);
 for(const name of ['下载固定文本','下载固定HTML']){const pending=page.waitForEvent('download');await page.getByRole('link',{name,exact:true}).click();const path=await(await pending).path();expect(path).not.toBeNull();const body=await readFile(path!,'utf8');safe(body);if(name==='下载固定文本'){expect(body).toBe(external.artifact.text);expect(createHash('sha256').update(body).digest('hex')).toBe(external.artifact.digest);}else {expect(body).toContain('<!doctype html>');expect(body).toContain(external.artifact.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'));}}
 for(const width of [390,1440]){await page.setViewportSize({width,height:1100});await page.screenshot({path:info.outputPath(`story-accepted-${width}.png`),fullPage:true});}
 expect(writes.some(path=>path.includes('/assignments/')&&path.endsWith('/pro'))).toBe(true);expect(writes.some(path=>path.endsWith('/api/agent'))).toBe(true);await info.attach('ui-write-paths',{body:JSON.stringify(writes,null,2),contentType:'application/json'});await info.attach('joined-report-evidence',{body:JSON.stringify(story,null,2),contentType:'application/json'});
});
