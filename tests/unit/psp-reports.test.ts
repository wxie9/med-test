import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {createReportDraft,readInternalReport,listInternalReports} from '@/lib/psp/reports';
import {renderReportContent} from '@/lib/psp/reportTemplate';
import {reportContentDigest,validatePspReports} from '@/lib/psp/reportValidation';
import {proposeCorrection,verifyCorrection} from '@/lib/psp/corrections';
import {recordPermission} from '@/lib/psp/permissions';
import {submitProjectPro} from '@/lib/psp/commands';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
import type {PspReportVersion} from '@/lib/psp/reportTypes';
import type {CommandMeta} from '@/lib/psp/types';
const projectId='PSP-BC-ENDO-001';
const window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW};
const meta=(id:string,overrides:Partial<CommandMeta>={}):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.ledgerRevision,clientRequestId:id,actorId:'project-manager-psp',role:'project_manager',...overrides});
const freeze=(id='freeze')=>freezePspSnapshot(projectId,window,meta(id)).data;
const action={category:'overdue_followup' as const,responsibleRole:'case_manager' as const,dueAt:'2026-10-14T09:00:00+08:00',status:'planned' as const};
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it('creates deterministic protected seven-chapter draft with separate workflow and ledger CAS',()=>{
 const s=freeze(),before=getStore().psp.ledgerRevision,auth=getStore().psp.authorizationVersion;
 const result=createReportDraft(s.id,{nextActions:[]},meta('draft')),r=result.data;
 expect(result.objectVersion).toBe(before+1);expect(result.ledgerRevision).toBe(before+1);expect(r.version).toBe(1);expect(r.revision).toBe(1);expect(getStore().psp.authorizationVersion).toBe(auth);
 expect(r.content.chapters.map(c=>c.title)).toEqual(['项目范围','数据说明','服务执行','患者反馈','质量与限制','下一期服务安排','审核与交付']);
 expect(r.content).toEqual(renderReportContent(s,[]));expect(r.factIds).toEqual(r.content.chapters.flatMap(c=>c.facts.map(f=>f.id)));expect(r.factIds.length).toBe(s.protectedMetrics.length);
 expect(r.contentDigest).toBe(reportContentDigest(r));
 const detail=readInternalReport(r.id,'data_reviewer','data-reviewer-psp',result.seedVersion);
 expect(detail.workflow).toMatchObject({status:'draft',dataReview:null,medicalReview:null,delivery:null,acceptance:null});expect(detail.warnings).toEqual(['下一期服务安排尚未补充，待人工审核']);expect(detail.createGate.canCreate).toBe(false);
 const text=JSON.stringify(r.content);for(const forbidden of ['P-A','sourceRefs','applicability','患者姓名','internalMetrics','ROI','DOT'])expect(text).not.toContain(forbidden);
 const polluted=structuredClone(s);for(const m of [...polluted.aggregateMetrics,...polluted.internalMetrics]){m.label='PHI_987654';m.applicability='患者姓名PHI_987654';}for(const source of polluted.sources)source.value.note='PHI_987654';expect(renderReportContent(polluted,[])).toEqual(r.content);
 expect(listInternalReports(projectId,'medical_reviewer','medical-reviewer-psp').summaries[0].id).toBe(r.id);
});
it('revises latest parent using new same-period snapshot while retaining old draft and receipt',async()=>{
 const first=createReportDraft(freeze().id,{nextActions:[]},meta('one')),secondSnap=freeze('second');
 const request=meta('two'),input={parentVersionId:first.data.id,nextActions:[action]},second=createReportDraft(secondSnap.id,input,request);
 expect(second.data.batchId).toBe(first.data.batchId);expect(second.data.revision).toBe(2);expect(second.data.nextActions[0].dueAt).toBe('2026-10-14T01:00:00.000Z');
 expect(getStore().psp.reportVersions![0]).toEqual(first.data);
 expect(()=>createReportDraft(secondSnap.id,{nextActions:[]},meta('duplicate'))).toThrow();expect(()=>createReportDraft(secondSnap.id,input,meta('branch'))).toThrow();
 expect(createReportDraft(secondSnap.id,{...input,nextActions:[{...action,dueAt:'2026-10-14T01:00:00.000Z'}]},request)).toEqual(second);
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(getStore())));expect(createReportDraft(secondSnap.id,input,request)).toEqual(second);expect(Object.isFrozen(getStore().psp.reportVersions![0].content)).toBe(true);expect(Object.isFrozen(getStore().psp.reportVersions![0].nextActions)).toBe(true);
 expect(()=>createReportDraft(secondSnap.id,{...input,nextActions:[]},request)).toThrow();
});
it.each([
 undefined,[{...action,name:'患者'}],[{...action,category:'free_text'}],[{...action,responsibleRole:'patient'}],[{...action,responsibleRole:'doctor'}],[{...action,status:'completed'}],[{...action,dueAt:'2026-10-14T09:00:00'}],[{...action,dueAt:PSP_TEST_NOW}],[{...action,dueAt:'2027-01-01T00:00:00Z'}],Array.from({length:13},()=>action),
])('rejects malformed structured arrangements %j',(nextActions)=>{const s=freeze();expect(()=>createReportDraft(s.id,{nextActions} as never,meta('bad'))).toThrow();expect(getStore().psp.reportVersions).toBeUndefined();});
it('rejects unauthorized callers/stale seed/CAS and cross-period parents',()=>{
 const s=freeze(),request=meta('draft');expect(()=>createReportDraft(s.id,{nextActions:[]},{...request,expectedVersion:request.expectedVersion-1})).toThrow();
 for(const [role,actorId] of [['data_reviewer','data-reviewer-psp'],['medical_reviewer','medical-reviewer-psp'],['patient','P-A'],['pharma_owner','pharma-owner-a']] as const)expect(()=>createReportDraft(s.id,{nextActions:[]},meta(role,{role,actorId}))).toThrow();
 const r=createReportDraft(s.id,{nextActions:[]},request).data;expect(()=>readInternalReport(r.id,'patient','P-A',getStore().seedVersion)).toThrow();expect(()=>readInternalReport(r.id,'project_manager','project-manager-psp',getStore().seedVersion+1)).toThrow();
 const other=freezePspSnapshot(projectId,{...window,periodEnd:'2026-12-01T00:00:00Z'},meta('other')).data;expect(()=>createReportDraft(other.id,{parentVersionId:r.id,nextActions:[]},meta('wrong'))).toThrow();
});
it('blocks new drafts from withdrawn used intervals even after regrant or refreeze; retains exact receipt/history',async()=>{
 const s=freeze(),request=meta('one'),first=createReportDraft(s.id,{nextActions:[]},request);
 const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 const permission=(id:string,action:'grant'|'withdraw')=>recordPermission(e.id,'aggregate',action,meta(id,{role:'patient',actorId:e.patientId,expectedVersion:getStore().psp.enrollments.find(x=>x.id===e.id)!.version}));
 permission('withdraw','withdraw');expect(createReportDraft(s.id,{nextActions:[]},request)).toEqual(first);
 expect(()=>createReportDraft(s.id,{parentVersionId:first.data.id,nextActions:[]},meta('new'))).toThrow();permission('regrant','grant');
 const fresh=freeze('again');expect(()=>createReportDraft(fresh.id,{parentVersionId:first.data.id,nextActions:[]},meta('still-old'))).toThrow();
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));expect(restored.psp.reportVersions![0]).toEqual(first.data);
});
it('service-only withdrawal and unrelated authorization version changes preserve historical aggregate usability',()=>{
 const s=freeze(),e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 recordPermission(e.id,'service','withdraw',meta('service',{role:'patient',actorId:e.patientId,expectedVersion:e.version}));expect(createReportDraft(s.id,{nextActions:[]},meta('allowed')).data.status).toBe('draft');
});
it('rejects malicious rehashed content and chains at persistence boundary; old schema remains optional',async()=>{
 expect((await decodeDemoStore(await encodeDemoStore(getStore()))).psp.reportVersions).toBeUndefined();createReportDraft(freeze().id,{nextActions:[]},meta('draft'));
 for(const mutate of [(r:PspReportVersion)=>{r.content.chapters[1].facts[0].value=999999;},(r:PspReportVersion)=>{r.content.chapters.pop();},(r:PspReportVersion)=>{r.factIds[0]='wrong';},(r:PspReportVersion)=>{r.parentVersionId=r.id;},(r:PspReportVersion)=>{r.templateVersion='unknown' as never;}]){
  const altered=structuredClone(getStore());mutate(altered.psp.reportVersions![0]);altered.psp.reportVersions![0].contentDigest=reportContentDigest(altered.psp.reportVersions![0]);(altered.psp.commandReceipts.at(-1)!.result as {data:PspReportVersion}).data=structuredClone(altered.psp.reportVersions![0]);await expect(encodeDemoStore(altered)).rejects.toThrow();
 }
 const receipt=structuredClone(getStore()),saved=receipt.psp.commandReceipts.at(-1)!.result as {data:PspReportVersion};saved.data.id='wrong';expect(()=>validatePspReports(receipt.psp,receipt.seedVersion)).toThrow();
});
it('renders dates consistently in Shanghai while preserving normalized UTC action storage',()=>{const r=createReportDraft(freeze().id,{nextActions:[action]},meta('dates')).data;expect(r.content.chapters[5].paragraphs[0]).toContain('2026-10-14 09:00:00（上海时间）');expect(r.content.chapters[1].paragraphs[0]).toContain('2026-10-13 10:00:00（上海时间）');expect(r.content.chapters[4].paragraphs.join('')).not.toContain('suppressed');expect(r.nextActions[0].dueAt).toBe('2026-10-14T01:00:00.000Z');});

it('preserves group-protected facts after one real questionnaire result without hidden numeric fields',()=>{
 const assignmentId=`${projectId}:ENR-01:PRO:2026-10`;
 submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}},meta('pro',{role:'patient',actorId:'P-A',expectedVersion:1}));
 const s=freeze(),r=createReportDraft(s.id,{nextActions:[]},meta('protected')).data,facts=r.content.chapters.flatMap(c=>c.facts);
 expect(s.aggregateMetrics.find(m=>m.key==='questionnaire_completion')).toMatchObject({numerator:1,denominator:14});expect(facts.find(f=>f.metricKey==='questionnaire_completion')?.status).toBe('suppressed');
 for(const fact of facts){const protectedFact=s.protectedMetrics.find(m=>m.key===fact.metricKey)!;expect(fact.status).toBe(protectedFact.status);if(protectedFact.status==='available'){expect(fact.value).toBe(protectedFact.value);expect(fact.sampleN).toBe(protectedFact.sampleN);}else for(const field of ['value','sampleN','numerator','denominator'])expect(fact).not.toHaveProperty(field);}
 const changed={...r,status:'future_workflow',version:2,workflow:{dataReview:'future-signature'}};expect(reportContentDigest(changed)).toBe(r.contentDigest);
});
it('old frozen reports are independent of later clinical data and source ledger changes',async()=>{
 const r=createReportDraft(freeze().id,{nextActions:[]},meta('old')).data;const assignmentId=`${projectId}:ENR-01:PRO:2026-10`;
 submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}},meta('later-pro',{role:'patient',actorId:'P-A',expectedVersion:1}));
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));expect(restored.psp.reportVersions![0]).toEqual(r);expect(restored.snapshots).toEqual(getStore().snapshots);
});
it('rejects invalid report bindings, revision topology, creation and receipt metadata on restore',async()=>{
 const first=createReportDraft(freeze().id,{nextActions:[]},meta('first')).data;createReportDraft(first.snapshotId,{parentVersionId:first.id,nextActions:[action]},meta('second'));
 const mutations:Array<(s:ReturnType<typeof getStore>)=>void>=[
  s=>{s.psp.reportVersions![1].parentVersionId='absent';},s=>{s.psp.reportVersions![1].revision=1;},s=>{s.psp.reportVersions![0].snapshotId='absent';},s=>{s.psp.reportVersions![0].seedVersion++;},
  s=>{s.psp.reportVersions![0].content.chapters[1].facts[0].unit='hours';},s=>{s.psp.reportVersions![0].createdBy='patient';},s=>{s.psp.reportVersions![1].creationLedgerRevision=s.psp.reportVersions![0].creationLedgerRevision;},
  s=>{s.psp.commandReceipts.at(-1)!.bodyDigest='0'.repeat(64);},s=>{s.psp.commandReceipts.pop();},s=>{s.psp.commandReceipts.at(-1)!.objectVersion++;},s=>{s.psp.commandReceipts.at(-1)!.scopeKey=JSON.stringify([s.seedVersion,projectId,'create_report','patient','x']);},
 ];
 for(const mutate of mutations){const bad=structuredClone(getStore());mutate(bad);await expect(encodeDemoStore(bad)).rejects.toThrow();}
});
it('rejects a forged creation ledger collision even when report and receipt agree',()=>{
 const s1=freeze(),s2=freezePspSnapshot(projectId,{...window,periodEnd:'2026-12-01T00:00:00+08:00'},meta('second-period')).data;
 const r1=createReportDraft(s1.id,{nextActions:[]},meta('first')).data,r2=createReportDraft(s2.id,{nextActions:[]},meta('second')).data;
 const bad=structuredClone(getStore()),report=bad.psp.reportVersions!.find(r=>r.id===r2.id)!;report.creationLedgerRevision=r1.creationLedgerRevision;
 const receipt=bad.psp.commandReceipts.at(-1)!;receipt.ledgerRevision=r1.creationLedgerRevision;receipt.objectVersion=r1.creationLedgerRevision;receipt.result={data:report,seedVersion:bad.seedVersion,objectVersion:r1.creationLedgerRevision,ledgerRevision:r1.creationLedgerRevision};
 expect(()=>validatePspReports(bad.psp,bad.seedVersion)).toThrow();
});

it.each(['permission','verification'] as const)('rejects a report creation sequence colliding with actual %s history even with a matching receipt',async kind=>{
 const report=createReportDraft(freeze().id,{nextActions:[]},meta('create')).data;let sequence:number;
 if(kind==='permission'){
  recordPermission('ENR-01','aggregate','withdraw',meta('withdraw',{role:'patient',actorId:'P-A',expectedVersion:getStore().psp.enrollments.find(e=>e.id==='ENR-01')!.version}));sequence=getStore().psp.permissionEvents.at(-1)!.sequence;
 }else{
  const source=getStore().psp.serviceEvents[0],enrollment=getStore().psp.enrollments.find(e=>e.id===source.enrollmentId)!;
  const correction=proposeCorrection({sourceRef:{kind:'contact',id:source.id},correctedValue:{kind:'contact',channel:'message',outcome:'reached'},occurredAt:source.occurredAt,reason:'合成核验'},meta('proposal',{role:'case_manager',actorId:'case-manager-chen',expectedVersion:enrollment.version})).data;
  verifyCorrection(correction.id,meta('verify',{role:'data_reviewer',actorId:'data-reviewer-psp',expectedVersion:correction.version}));sequence=getStore().psp.corrections![0].verificationSequence!;
 }
 const bad=structuredClone(getStore()),saved=bad.psp.reportVersions![0];saved.creationLedgerRevision=sequence;
 const receipt=bad.psp.commandReceipts.find(r=>(r.result as {data?:{id?:string}})?.data?.id===report.id)!;receipt.ledgerRevision=sequence;receipt.objectVersion=sequence;receipt.result={data:structuredClone(saved),seedVersion:bad.seedVersion,objectVersion:sequence,ledgerRevision:sequence};
 await expect((async()=>{const restored=await decodeDemoStore(await encodeDemoStore(bad));return restored.psp.reportVersions![0].creationLedgerRevision;})()).rejects.toThrow();
},15000);
