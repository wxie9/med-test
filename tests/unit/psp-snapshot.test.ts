import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
import {freezePspSnapshot,listPspSnapshots,getPspSnapshot,getMetricEvidence} from '@/lib/psp/snapshot';
import type {CommandMeta} from '@/lib/psp/types';
import {snapshotDigest} from '@/lib/psp/snapshotValidation';
import {createSnapshotSourceGraph} from '@/lib/psp/snapshotSourceGraph';
import {recordInteraction,actOnProjectAlert} from '@/lib/psp/contact';
import {submitProjectPro} from '@/lib/psp/commands';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
import {proposeCorrection,verifyCorrection} from '@/lib/psp/corrections';
import {sendEducation,recordEducationOpened,recordEducationFeedback} from '@/lib/psp/education';
import {recordPermission,recordEnrollmentState} from '@/lib/psp/permissions';
import type {PspServiceSnapshot} from '@/lib/psp/snapshotTypes';

const projectId='PSP-BC-ENDO-001';
const window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW};
const meta=(id:string,overrides:Partial<CommandMeta>={}):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.ledgerRevision,clientRequestId:id,actorId:'project-manager-psp',role:'project_manager',...overrides});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});

it('freezes both scopes at one source revision and keeps a slim immutable value copy',()=>{
 const before=getStore().psp.ledgerRevision,authorization=getStore().psp.authorizationVersion,memberVersion=getStore().psp.enrollments[0].version,result=freezePspSnapshot(projectId,window,meta('freeze-1'));
 expect(result.data.sourceLedgerRevision).toBe(before);
 expect(result.ledgerRevision).toBe(before+1);
 expect(getStore().psp.authorizationVersion).toBe(authorization);
 expect(getStore().psp.enrollments[0].version).toBe(memberVersion);
 expect(result.data.internalMetrics.every(m=>m.window.ledgerRevision===before&&m.window.scope==='internal')).toBe(true);
 expect(result.data.aggregateMetrics.every(m=>m.window.ledgerRevision===before&&m.window.scope==='aggregate')).toBe(true);
 expect(result.data.internalMetrics.find(m=>m.key==='contact_completion')).toMatchObject({numerator:10,denominator:18});
 expect(result.data.aggregateMetrics.find(m=>m.key==='contact_completion')).toMatchObject({numerator:8,denominator:14});
 expect(result.data.protectedMetrics.length).toBe(result.data.aggregateMetrics.length);
 expect(result.data.sources.some(s=>s.kind==='educationResult'&&s.locator.startsWith('psp.educationResults[assignmentId='))).toBe(true);
 expect(result.data.sources.filter(s=>s.kind==='assignment').every(s=>!('status' in s.value)&&!('latestValidResponseId' in s.value))).toBe(true);
 expect(result.data).not.toHaveProperty('patients');
 expect(JSON.stringify(result.data)).not.toContain('commandReceipts');
 expect(getStore().psp.snapshots).toHaveLength(1);
 expect(Object.isFrozen(getStore().psp.snapshots![0].sources)).toBe(true);
});

it('replays exact command result across hydrate and enforces project ledger compare-and-swap',async()=>{
 const request=meta('same'),first=freezePspSnapshot(projectId,window,request);
 expect(freezePspSnapshot(projectId,window,request)).toEqual(first);
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(getStore())));
 expect(freezePspSnapshot(projectId,window,request)).toEqual(first);
 expect(getStore().psp.snapshots).toHaveLength(1);
 expect(()=>freezePspSnapshot(projectId,{...window,periodEnd:'2026-12-01T00:00:00+08:00'},request)).toThrow();
 expect(()=>freezePspSnapshot(projectId,window,{...request,clientRequestId:'other'})).toThrow();
 expect(()=>freezePspSnapshot('wrong',window,meta('wrong'))).toThrow();
 expect(()=>freezePspSnapshot(projectId,window,meta('role',{role:'medical_reviewer',actorId:'medical-reviewer-psp'}))).toThrow();
 expect(()=>freezePspSnapshot(projectId,window,{...request,seedVersion:request.seedVersion+1})).toThrow();
});

it('returns actual frozen source locators and disallows other roles',()=>{
 const snap=freezePspSnapshot(projectId,window,meta('sources')).data;
 const list=listPspSnapshots(projectId,'medical_reviewer','medical-reviewer-psp');
 expect(list.summaries.map(s=>s.id)).toEqual([snap.id]);
 expect(list.summaries[0]).not.toHaveProperty('sources');
 const detail=getPspSnapshot(snap.id,'data_reviewer','data-reviewer-psp',getStore().seedVersion);
 expect(detail.snapshot.id).toBe(snap.id);
 const evidence=getMetricEvidence(snap.id,'contact_completion','internal','project_manager','project-manager-psp',getStore().seedVersion);
 expect(evidence.metric.numerator).toBe(10);
 expect(evidence.sources.length).toBeGreaterThan(0);
 expect(evidence.sources.every(source=>source.locator.startsWith('psp.'))).toBe(true);
 const aggregate=getMetricEvidence(snap.id,'contact_completion','aggregate','project_manager','project-manager-psp',getStore().seedVersion);
 expect(aggregate.supportingRefs.length).toBeGreaterThan(0);
 expect(aggregate.sources.some(source=>source.kind==='enrollment')).toBe(true);
 expect(aggregate.sources.some(source=>source.kind==='permission')).toBe(true);
 const outcome=getMetricEvidence(snap.id,'interaction_successes','internal','project_manager','project-manager-psp',getStore().seedVersion);
 expect(outcome.supportingRefs.length).toBeGreaterThan(0);
 expect(outcome.sources.some(source=>source.kind==='enrollment')).toBe(true);
 expect(()=>getMetricEvidence(snap.id,'contact_completion','internal','patient','P-A')).toThrow();
 expect(()=>getPspSnapshot(snap.id,'pharma_owner','pharma-owner-a')).toThrow();
 expect(()=>getPspSnapshot(snap.id,'project_manager','project-manager-psp',getStore().seedVersion+1)).toThrow();
});

it('round-trips old and frozen states, and rejects altered frozen evidence on encode',async()=>{
 const old=getStore();expect((await decodeDemoStore(await encodeDemoStore(old))).psp.snapshots).toBeUndefined();
 const id=freezePspSnapshot(projectId,window,meta('durable')).data.id;
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.psp.snapshots![0].id).toBe(id);
 expect(Object.isFrozen(restored.psp.snapshots![0].internalMetrics[0].sourceRefs)).toBe(true);
 const altered=structuredClone(restored);
 altered.psp.snapshots![0].internalMetrics[0].value=123456;
 expect(await encodeDemoStore(altered).then(()=>false,()=>true)).toBe(true);
 const leaked=structuredClone(restored),copy=leaked.psp.snapshots![0];
 copy.sources[0].value.patientName='forbidden';
 const {contentDigest,...body}=copy;void contentDigest;copy.contentDigest=snapshotDigest(body);
 await expect(encodeDemoStore(leaked)).rejects.toThrow();
});

it('keeps the first frozen values after a real later contact and a second freeze',async()=>{
 const old=freezePspSnapshot(projectId,window,meta('before-contact')).data;
 const plan=getStore().psp.assignments.find(a=>a.kind==='contact'&&a.status==='open'&&getStore().psp.enrollments.find(e=>e.id===a.enrollmentId)?.status==='active')!;
 expect(plan).toBeDefined();
 recordInteraction({enrollmentId:plan.enrollmentId,assignmentId:plan.id,channel:'phone',outcome:'reached',alertIds:[]},{seedVersion:getStore().seedVersion,expectedVersion:plan.version,clientRequestId:'after-freeze-contact',role:'case_manager',actorId:'case-manager-chen'});
 const next=freezePspSnapshot(projectId,window,meta('after-contact')).data;
 expect(next.id).not.toBe(old.id);
 expect(next.sourceLedgerRevision).toBeGreaterThan(old.sourceLedgerRevision);
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.psp.snapshots![0].contentDigest).toBe(old.contentDigest);
 expect(restored.psp.snapshots![0].internalMetrics).toEqual(old.internalMetrics);
 expect(Object.isFrozen(restored.psp.snapshots![0].sources[0].value)).toBe(true);
});

it('rejects a snapshot bound to another seed during a later service transaction',()=>{
 freezePspSnapshot(projectId,window,meta('seed-binding'));
 const forged=structuredClone(getStore()),snapshot=forged.psp.snapshots![0];snapshot.seedVersion++;
 const {contentDigest,...body}=snapshot;void contentDigest;snapshot.contentDigest=snapshotDigest(body);
 installPspTestStore(forged);
 const plan=getStore().psp.assignments.find(a=>a.kind==='contact'&&a.status==='open'&&getStore().psp.enrollments.find(e=>e.id===a.enrollmentId)?.status==='active')!;
 expect(()=>recordInteraction({enrollmentId:plan.enrollmentId,assignmentId:plan.id,channel:'phone',outcome:'reached',alertIds:[]},{seedVersion:getStore().seedVersion,expectedVersion:plan.version,clientRequestId:'seed-mismatch-command',role:'case_manager',actorId:'case-manager-chen'})).toThrow('snapshot seed');
});

it('locates real questionnaire alerts inside their frozen evidence copy',()=>{
 const assignmentId=`${projectId}:ENR-01:PRO:2026-10`;
 const pro=submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((symptom,i)=>[symptom,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'snapshot-real-pro',role:'patient',actorId:'P-A'});
 expect(pro.data.alertIds).toHaveLength(2);
 const snap=freezePspSnapshot(projectId,window,meta('snapshot-alert-birth')).data;
 for(const alertId of pro.data.alertIds){
  const birth=snap.sources.find(s=>s.ref===alertId);
  expect(birth?.kind).toBe('alertBirth');
  expect(birth?.locator).toContain(`.alerts[id=${alertId}]`);
  expect(snap.sources.some(s=>s.kind==='questionnaireEvidence'&&s.ref===birth?.value.questionnaireEvidenceId)).toBe(true);
 }
});

it('keeps both the original contact and its verified correction in source evidence',()=>{
 const original=getStore().psp.serviceEvents.find(e=>e.enrollmentId==='ENR-01')!;
 const proposal=proposeCorrection({sourceRef:{kind:'contact',id:original.id},correctedValue:{kind:'contact',channel:'phone',outcome:'reached'},reason:'原始电话记录复核',occurredAt:'2026-10-12T12:00:00+08:00'},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'snapshot-propose',role:'case_manager',actorId:'case-manager-chen'});
 verifyCorrection(proposal.data.id,{seedVersion:getStore().seedVersion,expectedVersion:proposal.data.version,clientRequestId:'snapshot-verify',role:'data_reviewer',actorId:'data-reviewer-psp'});
 const snap=freezePspSnapshot(projectId,window,meta('snapshot-correction')).data;
 const corrected=snap.sources.find(s=>s.ref===proposal.data.id),origin=snap.sources.find(s=>s.ref===original.id);
 expect(corrected?.kind).toBe('correction');expect(origin?.kind).toBe('contact');
 expect(corrected?.value.sourceRef).toEqual({kind:'contact',id:original.id});
 expect(corrected?.locator).toBe(`psp.corrections[id=${proposal.data.id}]`);
 const metric=getMetricEvidence(snap.id,'contact_completion','internal','data_reviewer','data-reviewer-psp',getStore().seedVersion);
 expect(metric.sources.map(s=>s.ref)).toContain(proposal.data.id);
 expect(metric.sources.map(s=>s.ref)).toContain(original.id);
});

it('preserves legacy questionnaire uncertainty without inventing a missing response source',()=>{
 const assignmentId=`${projectId}:ENR-01:PRO:2026-10`;
 submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(symptom=>[symptom,1])),flags:{stopIntent:true}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'legacy-pro',role:'patient',actorId:'P-A'});
 const legacy=structuredClone(getStore());delete legacy.psp.questionnaireEvidence;installPspTestStore(legacy);
 const snap=freezePspSnapshot(projectId,window,meta('legacy-freeze')).data;
 expect(snap.internalMetrics.find(m=>m.key==='questionnaire_completion')?.status).toBe('unknown');
 expect(snap.sources.some(s=>s.kind==='questionnaireEvidence')).toBe(false);
 expect(snap.sources.find(s=>s.ref===assignmentId)?.value.birthEvidence).toBe('seed_fixed');
});

it('freezes the real typed send and open stages supporting education feedback',async()=>{
 const assignmentId=`${projectId}:ENR-01:EDUCATION:2026-10`;
 const educationMeta=(id:string,patient=false):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.assignments.find(a=>a.id===assignmentId)!.version,clientRequestId:id,role:patient?'patient':'case_manager',actorId:patient?'P-A':'case-manager-chen'});
 sendEducation(assignmentId,'EDU-SYNTHETIC-001',educationMeta('source-graph-send'));
 recordEducationOpened(assignmentId,educationMeta('source-graph-open',true));
 recordEducationFeedback(assignmentId,{understood:true,needsHelp:false},educationMeta('source-graph-feedback',true));
 const snap=freezePspSnapshot(projectId,window,meta('source-graph-freeze')).data;
 const expected=getStore().psp.educationEvents!.filter(e=>e.assignmentId===assignmentId);
 const evidence=getMetricEvidence(snap.id,'education_completion','internal','project_manager','project-manager-psp',getStore().seedVersion);
 expect(evidence.sources.filter(s=>s.kind==='educationEvent'&&s.value.assignmentId===assignmentId).map(s=>s.value.action).sort()).toEqual(['feedback','open','send']);
 expect(evidence.sourceRefs).toContain(expected.find(e=>e.action==='feedback')!.id);
 expect(evidence.supportingRefs).toEqual(expect.arrayContaining(expected.filter(e=>e.action!=='feedback').map(e=>e.id)));
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.psp.snapshots![0].evidence.find(e=>e.scope==='internal'&&e.metricKey==='education_completion')?.supportingRefs).toEqual(evidence.supportingRefs);
});

it('freezes real education-help and doctor-close followups with their actual opposite ledger orders',async()=>{
 const old=freezePspSnapshot(projectId,window,meta('dynamic-before')).data;
 const educationId=`${projectId}:ENR-01:EDUCATION:2026-10`;
 const educationMeta=(id:string,patient=false):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.assignments.find(a=>a.id===educationId)!.version,clientRequestId:id,role:patient?'patient':'case_manager',actorId:patient?'P-A':'case-manager-chen'});
 sendEducation(educationId,'EDU-SYNTHETIC-001',educationMeta('dynamic-send'));
 recordEducationOpened(educationId,educationMeta('dynamic-open',true));
 recordEducationFeedback(educationId,{understood:false,needsHelp:true},educationMeta('dynamic-feedback',true));
 const feedback=getStore().psp.educationEvents!.find(e=>e.assignmentId===educationId&&e.action==='feedback')!;
 const educationPlan=getStore().psp.assignments.find(a=>a.id===feedback.followupAssignmentId)!;
 expect(educationPlan.assignedSequence).toBeLessThan(feedback.sequence);
 const proId=`${projectId}:ENR-01:PRO:2026-10`;
 const pro=submitProjectPro({assignmentId:proId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((symptom,i)=>[symptom,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'dynamic-pro',role:'patient',actorId:'P-A'});
 const alertId=pro.data.alertIds[0];
 const call=recordInteraction({enrollmentId:'ENR-01',channel:'phone',outcome:'reached',alertIds:[alertId]},{seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id==='ENR-01')!.version,clientRequestId:'dynamic-alert-call',role:'case_manager',actorId:'case-manager-chen'});
 const alertMeta=(id:string,role:'case_manager'|'doctor'='case_manager'):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().alerts.find(a=>a.id===alertId)!.version??1,clientRequestId:id,role,actorId:role==='doctor'?'doctor-zhang':'case-manager-chen'});
 actOnProjectAlert(alertId,{action:'accept'},alertMeta('dynamic-accept'));
 actOnProjectAlert(alertId,{action:'start'},alertMeta('dynamic-start'));
 actOnProjectAlert(alertId,{action:'submit_review',disposition:{category:'support',summary:'实际联系后复核',interactionIds:[call.data.interactionId]}},alertMeta('dynamic-review'));
 const closed=actOnProjectAlert(alertId,{action:'close',note:'安排复评',followupTask:{type:'复评',owner:'张医生',dueAt:'2026-10-15T17:30:00+08:00'}},alertMeta('dynamic-close','doctor')).data;
 const alertPlan=getStore().psp.assignments.find(a=>a.id===closed.followupAssignmentId)!;
 expect(closed.sequence).toBeLessThan(alertPlan.assignedSequence!);
 const next=freezePspSnapshot(projectId,window,meta('dynamic-after')).data;
 expect(next.sources.map(s=>s.ref)).toEqual(expect.arrayContaining([feedback.id,educationPlan.id,closed.id,alertPlan.id]));
 const review=getStore().psp.alertActions!.find(a=>a.alertId===alertId&&a.action==='submit_review')!;
 const alertEvidence=getMetricEvidence(next.id,'alert_review_completion','internal','project_manager','project-manager-psp',getStore().seedVersion);
 expect(alertEvidence.sources.map(s=>s.ref)).toEqual(expect.arrayContaining([closed.id,review.id,call.data.id]));
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.psp.snapshots![0].contentDigest).toBe(old.contentDigest);
 expect(restored.psp.snapshots![1].contentDigest).toBe(next.contentDigest);
 const altered=structuredClone(getStore()),corrupt=altered.psp.snapshots![1];
 corrupt.sources=corrupt.sources.filter(s=>s.ref!==review.id);
 const {contentDigest,...body}=corrupt;void contentDigest;corrupt.contentDigest=snapshotDigest(body);
 await expect(encodeDemoStore(altered)).rejects.toThrow();
 const wrongCall=structuredClone(getStore()),wrongReview=wrongCall.psp.snapshots![1];
 (wrongReview.sources.find(s=>s.ref===review.id)!.value.disposition as {interactionIds:string[]}).interactionIds=['foreign-interaction'];
 const {contentDigest:wrongDigest,...wrongBody}=wrongReview;void wrongDigest;wrongReview.contentDigest=snapshotDigest(wrongBody);
 await expect(encodeDemoStore(wrongCall)).rejects.toThrow();
});

it('retains both scopes of the early-plan cohort even when no plan is completed',async()=>{
 const early={...window,cutoffAt:'2026-10-02T10:00:00+08:00'};
 const snap=freezePspSnapshot(projectId,early,meta('early-cohort')).data;
 for(const scope of ['internal','aggregate'] as const)for(const key of ['questionnaire_early_completed','contact_early_completed','education_early_completed']){
  const evidence=getMetricEvidence(snap.id,key,scope,'project_manager','project-manager-psp',getStore().seedVersion);
  expect(evidence.metric).toMatchObject({sampleN:scope==='internal'?18:14,value:0,sourceRefs:[]});
  expect(evidence.cohortRefs).toHaveLength(evidence.metric.sampleN!);
  expect(evidence.sources.filter(s=>s.kind==='assignment')).toHaveLength(evidence.metric.sampleN!);
 }
 await decodeDemoStore(await encodeDemoStore(getStore()));
});

it('rejects a rehashed aggregate early cohort swapped for a real service-only member',async()=>{
 const snap=freezePspSnapshot(projectId,{...window,cutoffAt:'2026-10-02T10:00:00+08:00'},meta('aggregate-swap-base')).data;
 const altered=structuredClone(getStore()),copy=altered.psp.snapshots![0];
 const evidence=copy.evidence.find(e=>e.scope==='aggregate'&&e.metricKey==='contact_early_completed')!;
 const replacement=`${projectId}:ENR-15:CONTACT:2026-10`;
 expect(evidence.cohortRefs).not.toContain(replacement);
 expect(copy.sources.map(s=>s.ref)).toContain(replacement);
 evidence.cohortRefs=[...evidence.cohortRefs.filter(r=>!r.includes(':ENR-01:')),replacement].sort();
 const graph=createSnapshotSourceGraph(copy.sources,{projectId:copy.projectId,projectStartsAt:copy.project.startsAt,projectEndsAt:copy.project.endsAt,window:copy.window,sourceLedgerRevision:copy.sourceLedgerRevision});
 evidence.supportingRefs=graph.closure([...evidence.sourceRefs,...evidence.cohortRefs]).filter(ref=>!evidence.sourceRefs.includes(ref));
 const {contentDigest,...body}=copy;void contentDigest;copy.contentDigest=snapshotDigest(body);
 expect(snap.aggregateMetrics.find(m=>m.key==='contact_early_completed')?.sampleN).toBe(14);
 expect(await encodeDemoStore(altered).then(()=>false,()=>true)).toBe(true);
});

it('retains an aggregate early plan through its real result before same-clock authorization withdrawal',async()=>{
 process.env.DEMO_FIXED_NOW='2026-10-02T02:00:00.000Z';
 const assignment=getStore().psp.assignments.find(a=>a.id===`${projectId}:ENR-01:CONTACT:2026-10`)!;
 const result=recordInteraction({enrollmentId:'ENR-01',assignmentId:assignment.id,channel:'phone',outcome:'reached',alertIds:[]},{seedVersion:getStore().seedVersion,expectedVersion:assignment.version,clientRequestId:'result-before-withdraw',role:'case_manager',actorId:'case-manager-chen'}).data;
 recordPermission('ENR-01','aggregate','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'withdraw-after-result',role:'patient',actorId:'P-A'});
 const snap=freezePspSnapshot(projectId,{...window,cutoffAt:'2026-10-02T10:00:00+08:00'},meta('historical-result-freeze')).data;
 const evidence=getMetricEvidence(snap.id,'contact_early_completed','aggregate','project_manager','project-manager-psp',getStore().seedVersion);
 expect(evidence.cohortRefs).toContain(assignment.id);
 expect(evidence.cohortQualifications.find(q=>q.ref===assignment.id)).toEqual({ref:assignment.id,basis:'historical_result',sourceRef:result.id});
 expect(evidence.sources.map(s=>s.ref)).toContain(result.id);
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.psp.snapshots![0].contentDigest).toBe(snap.contentDigest);
 const wrongType=structuredClone(getStore()),copy=wrongType.psp.snapshots![0];
 const witness=copy.evidence.find(e=>e.scope==='aggregate'&&e.metricKey==='contact_early_completed')!.cohortQualifications.find(q=>q.ref===assignment.id)!;
 if(witness.basis!=='historical_result')throw new Error('Historical result qualification expected');
 witness.sourceRef=assignment.id;
 const {contentDigest,...body}=copy;void contentDigest;copy.contentDigest=snapshotDigest(body);
 expect(await encodeDemoStore(wrongType).then(()=>false,()=>true)).toBe(true);
});

it('accepts verified reached correction as historical aggregate result before same-clock withdrawal',async()=>{
 process.env.DEMO_FIXED_NOW='2026-10-02T02:00:00.000Z';
 const assignment=getStore().psp.assignments.find(a=>a.id===`${projectId}:ENR-01:CONTACT:2026-10`)!;
 const call=recordInteraction({enrollmentId:'ENR-01',assignmentId:assignment.id,channel:'phone',outcome:'no_answer',alertIds:[]},{seedVersion:getStore().seedVersion,expectedVersion:assignment.version,clientRequestId:'corrected-call',role:'case_manager',actorId:'case-manager-chen'}).data;
 const correction=proposeCorrection({sourceRef:{kind:'contact',id:call.id},correctedValue:{kind:'contact',channel:'phone',outcome:'reached'},reason:'复核联系结果',occurredAt:'2026-10-02T02:00:00.000Z'},{seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id==='ENR-01')!.version,clientRequestId:'corrected-proposal',role:'case_manager',actorId:'case-manager-chen'}).data;
 verifyCorrection(correction.id,{seedVersion:getStore().seedVersion,expectedVersion:correction.version,clientRequestId:'corrected-verify',role:'data_reviewer',actorId:'data-reviewer-psp'});
 recordPermission('ENR-01','aggregate','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id==='ENR-01')!.version,clientRequestId:'corrected-withdraw',role:'patient',actorId:'P-A'});
 const snap=freezePspSnapshot(projectId,{...window,cutoffAt:'2026-10-02T10:00:00+08:00'},meta('corrected-history-freeze')).data;
 const evidence=getMetricEvidence(snap.id,'contact_early_completed','aggregate','project_manager','project-manager-psp',getStore().seedVersion);
 expect(evidence.cohortQualifications.find(q=>q.ref===assignment.id)).toEqual({ref:assignment.id,basis:'historical_result',sourceRef:correction.id});
 expect(evidence.sources.map(s=>s.ref)).toEqual(expect.arrayContaining([correction.id,call.id]));
 const restored=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(restored.psp.snapshots![0].contentDigest).toBe(snap.contentDigest);
});

it('preserves an aggregate early legacy questionnaire gap as unknown after authorization withdrawal',async()=>{
 process.env.DEMO_FIXED_NOW='2026-10-02T02:00:00.000Z';
 const assignmentId=`${projectId}:ENR-01:PRO:2026-10`;
 submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(symptom=>[symptom,1])),flags:{stopIntent:false}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'legacy-first-response',role:'patient',actorId:'P-A'});
 recordPermission('ENR-01','aggregate','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'legacy-withdraw',role:'patient',actorId:'P-A'});
 const legacy=structuredClone(getStore()),assignment=legacy.psp.assignments.find(a=>a.id===assignmentId)!;
 delete legacy.psp.questionnaireEvidence;
 installPspTestStore(legacy);
 const snap=freezePspSnapshot(projectId,{...window,cutoffAt:'2026-10-02T10:00:00+08:00'},meta('legacy-gap-freeze')).data;
 const evidence=getMetricEvidence(snap.id,'questionnaire_early_completed','aggregate','project_manager','project-manager-psp',getStore().seedVersion);
 expect(evidence.metric.status).toBe('unknown');
 expect(evidence.cohortRefs).toContain(assignment.id);
 expect(evidence.cohortQualifications.find(q=>q.ref===assignment.id)).toMatchObject({ref:assignment.id,basis:'legacy_gap',firstValidSubmittedAt:assignment.firstValidSubmittedAt});
 expect(evidence.sources.find(s=>s.ref===assignment.id)?.value).toMatchObject({legacyFirstValidSubmittedAt:assignment.firstValidSubmittedAt,legacyEvidenceGap:true});
 await decodeDemoStore(await encodeDemoStore(getStore()));
});

it('retains the whole early cohort after one real partial contact completion and rejects a rehashed missing cohort root',async()=>{
 process.env.DEMO_FIXED_NOW='2026-10-02T02:00:00.000Z';
 const assignment=getStore().psp.assignments.find(a=>a.id===`${projectId}:ENR-01:CONTACT:2026-10`)!;
 recordInteraction({enrollmentId:assignment.enrollmentId,assignmentId:assignment.id,channel:'phone',outcome:'reached',alertIds:[]},{seedVersion:getStore().seedVersion,expectedVersion:assignment.version,clientRequestId:'partial-early-call',role:'case_manager',actorId:'case-manager-chen'});
 const snap=freezePspSnapshot(projectId,{...window,cutoffAt:'2026-10-02T10:00:00+08:00'},meta('partial-early-freeze')).data;
 for(const scope of ['internal','aggregate'] as const){
  const evidence=getMetricEvidence(snap.id,'contact_early_completed',scope,'project_manager','project-manager-psp',getStore().seedVersion);
  expect(evidence.metric).toMatchObject({sampleN:scope==='internal'?18:14,value:1});
  expect(evidence.sourceRefs).toContain(assignment.id);
  expect(evidence.cohortRefs).toHaveLength(evidence.metric.sampleN!);
  expect(evidence.sources.filter(s=>s.kind==='assignment')).toHaveLength(evidence.metric.sampleN!);
 }
 await decodeDemoStore(await encodeDemoStore(getStore()));
 const altered=structuredClone(getStore()),copy=altered.psp.snapshots![0];
 copy.evidence.find(e=>e.scope==='internal'&&e.metricKey==='contact_early_completed')!.cohortRefs.pop();
 const {contentDigest,...body}=copy;void contentDigest;copy.contentDigest=snapshotDigest(body);
 await expect(encodeDemoStore(altered)).rejects.toThrow();
 const wrongWindow=structuredClone(getStore()),wrong=wrongWindow.psp.snapshots![0];
 wrong.sources.find(s=>s.ref===assignment.id)!.value.dueAt='2026-10-02T02:00:00.000Z';
 const {contentDigest:wrongDigest,...wrongBody}=wrong;void wrongDigest;wrong.contentDigest=snapshotDigest(wrongBody);
 await expect(encodeDemoStore(wrongWindow)).rejects.toThrow();
});

it('freezes real first-activation fixed plans with their membership birth source',async()=>{
 const enrollmentId='ENR-19';
 const enrollmentMeta=(id:string,role:'patient'|'doctor'|'case_manager',expectedVersion:number):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion,clientRequestId:id,role,actorId:role==='patient'?'P-0040':role==='doctor'?'doctor-zhang':'case-manager-chen'});
 recordPermission(enrollmentId,'service','grant',enrollmentMeta('new-grant','patient',1));
 recordEnrollmentState(enrollmentId,{state:'invited',reason:'确认',eligibilityConfirmed:true},enrollmentMeta('new-confirm','doctor',2));
 recordEnrollmentState(enrollmentId,{state:'active',reason:'加入'},enrollmentMeta('new-activate','case_manager',3));
 const plans=getStore().psp.assignments.filter(a=>a.enrollmentId===enrollmentId);
 const activated=getStore().psp.membershipEvents.find(e=>e.enrollmentId===enrollmentId&&e.status==='active')!;
 expect(plans).toHaveLength(3);
 expect(plans.every(a=>a.assignedSequence!>activated.sequence)).toBe(true);
 const snap=freezePspSnapshot(projectId,window,meta('new-member-freeze')).data;
 expect(snap.sources.filter(s=>s.kind==='assignment'&&s.value.enrollmentId===enrollmentId).map(s=>s.ref)).toEqual(expect.arrayContaining(plans.map(a=>a.id)));
 expect(snap.sources.map(s=>s.ref)).toContain(activated.id);
 await decodeDemoStore(await encodeDemoStore(getStore()));
 const altered=structuredClone(getStore()),copy=altered.psp.snapshots![0];
 copy.sources.find(s=>s.ref===plans[0].id)!.value.dueAt='2026-12-20T01:00:00.000Z';
 const {contentDigest,...body}=copy;void contentDigest;copy.contentDigest=snapshotDigest(body);
 await expect(encodeDemoStore(altered)).rejects.toThrow();
});

it('keeps all alert births as cohort roots when pending and overdue numerators are subsets',async()=>{
 const assignmentId=`${projectId}:ENR-01:PRO:2026-10`;
 const pro=submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((symptom,i)=>[symptom,i===0?2:1])),flags:{stopIntent:true,missedDoses14d:4}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'alert-subset-pro',role:'patient',actorId:'P-A'});
 expect(pro.data.alertIds).toHaveLength(2);
 process.env.DEMO_FIXED_NOW='2026-10-13T05:00:00.000Z';
 const snap=freezePspSnapshot(projectId,{...window,cutoffAt:'2026-10-13T05:00:00.000Z'},meta('alert-subset-freeze')).data;
 for(const key of ['alert_pending','alert_due_uncontacted'])for(const scope of ['internal','aggregate'] as const){
  const evidence=getMetricEvidence(snap.id,key,scope,'project_manager','project-manager-psp',getStore().seedVersion);
  expect(evidence.metric.sampleN).toBe(2);
  expect(evidence.metric.value).toBe(1);
  expect(evidence.cohortRefs).toEqual([...pro.data.alertIds].sort());
  expect(evidence.sources.filter(s=>s.kind==='alertBirth')).toHaveLength(2);
 }
 await decodeDemoStore(await encodeDemoStore(getStore()));
});

it('rejects a rehashed frozen graph with missing links, supports, cross-member stages, or future legacy time',async()=>{
 const assignmentId=`${projectId}:ENR-01:EDUCATION:2026-10`;
 const educationMeta=(id:string,patient=false):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.assignments.find(a=>a.id===assignmentId)!.version,clientRequestId:id,role:patient?'patient':'case_manager',actorId:patient?'P-A':'case-manager-chen'});
 sendEducation(assignmentId,'EDU-SYNTHETIC-001',educationMeta('corrupt-send'));
 recordEducationOpened(assignmentId,educationMeta('corrupt-open',true));
 recordEducationFeedback(assignmentId,{understood:true,needsHelp:false},educationMeta('corrupt-feedback',true));
 freezePspSnapshot(projectId,window,meta('corrupt-freeze'));
 const changes:[string,(snapshot:PspServiceSnapshot)=>void][]=[
  ['missing content',s=>{s.sources.find(x=>x.kind==='educationEvent')!.value.contentVersionId='absent';}],
  ['missing supports',s=>{for(const e of s.evidence)e.supportingRefs=[];}],
  ['cross member',s=>{const x=s.sources.find(x=>x.kind==='educationEvent'&&x.value.action==='feedback')!;x.value.enrollmentId='ENR-02';x.value.assignmentId=`${projectId}:ENR-02:EDUCATION:2026-10`;}],
  ['future legacy send',s=>{s.sources.find(x=>x.kind==='educationResult')!.value.sentAt='2026-12-31T02:00:00.000Z';}],
 ];
 for(const [label,change] of changes){
  const altered=structuredClone(getStore()),snapshot=altered.psp.snapshots![0];change(snapshot);
  const {contentDigest,...body}=snapshot;void contentDigest;snapshot.contentDigest=snapshotDigest(body);
  const accepted=await encodeDemoStore(altered).then(async bytes=>{await decodeDemoStore(bytes);return true;},()=>false);
  expect(accepted,label).toBe(false);
 }
});
