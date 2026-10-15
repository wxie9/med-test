import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {computePspMetrics} from '@/lib/psp/metrics';
import {importLegacySelfReports} from '@/lib/psp/selfReport';
import {submitProjectAdherence} from '@/lib/psp/selfReport';
import {proposeCorrection,verifyCorrection} from '@/lib/psp/corrections';
import {recordPermission} from '@/lib/psp/permissions';
import {recordEnrollmentState} from '@/lib/psp/permissions';
import {cancelProjectAssignment} from '@/lib/psp/assignmentCancellation';
import {submitProjectPro} from '@/lib/psp/commands';
import {recordInteraction} from '@/lib/psp/contact';
import {sendEducation,recordEducationOpened,recordEducationFeedback} from '@/lib/psp/education';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
import type {CommandMeta,PspState} from '@/lib/psp/types';
import type {Metric,MetricOptions} from '@/lib/psp/metricTypes';

beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
const options=(state:PspState,scope:MetricOptions['scope']='internal'):MetricOptions=>({projectId:state.project.id,periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW,scope,ledgerRevision:state.ledgerRevision});
const byKey=(metrics:Metric[],key:string)=>{const found=metrics.find(m=>m.key===key);expect(found,`missing metric ${key}`).toBeDefined();return found!;};
const result=(state:PspState,scope:MetricOptions['scope']='internal')=>computePspMetrics(state,options(state,scope));

it('keeps legacy missing-first evidence and the complete old metric view stable after a typed revision',async()=>{
 process.env.DEMO_FIXED_NOW='2026-10-12T02:00:00.000Z';
 const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10';
 const input={assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1' as const,items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}};
 const meta=(id:string):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.assignments.find(a=>a.id===assignmentId)!.version,clientRequestId:id,role:'patient',actorId:'P-A'});
 const first=submitProjectPro(input,meta('legacy-first'));
 const oldStore=structuredClone(getStore());delete oldStore.psp.questionnaireEvidence;
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(oldStore)));
 const state=getStore().psp,oldOptions={...options(state),ledgerRevision:state.ledgerRevision};
 const before=computePspMetrics(state,oldOptions);
 expect(byKey(before,'questionnaire_completion').value).toBeNull();
 expect(byKey(before,'quality_questionnaire_evidence')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(before,'quality_questionnaire_stop_intent')).toMatchObject({status:'unknown',value:null,sampleN:null});
 expect(byKey(before,'quality_questionnaire_stop_intent')).not.toHaveProperty('denominator');
 expect(byKey(before,'alert_contact_coverage')).toMatchObject({status:'unknown',value:null,sampleN:null});
 expect(byKey(before,'alert_contact_coverage')).not.toHaveProperty('denominator');
 process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;
 submitProjectPro({...input,revisionOf:first.data.proId},meta('legacy-typed-revision'));
 const current=getStore().psp;
 expect(computePspMetrics(current,oldOptions)).toEqual(before);
 const now=computePspMetrics(current,{...oldOptions,ledgerRevision:current.ledgerRevision});
 expect(byKey(now,'questionnaire_completion')).toMatchObject({numerator:1,denominator:18,value:1/18});
 expect(byKey(now,'questionnaire_on_time')).toMatchObject({status:'unknown',value:null,denominator:18});
 expect(byKey(now,'quality_questionnaire_evidence')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(now,'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
});

it('keeps a complete old metric view open when an ordinary first typed submission arrives later at the same clock',()=>{
 const state=getStore().psp,oldOptions=options(state),before=computePspMetrics(state,oldOptions);
 submitProjectPro({assignmentId:'PSP-BC-ENDO-001:ENR-01:PRO:2026-10',patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'later-first-typed',role:'patient',actorId:'P-A'});
 expect(computePspMetrics(getStore().psp,oldOptions)).toEqual(before);
});

it('does not move a legacy first into the month of its first typed revision',async()=>{
 process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;
 const id='ENR-19';
 const meta=(request:string,role:CommandMeta['role'],actorId:string):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id===id)!.version,clientRequestId:request,role,actorId});
 recordPermission(id,'service','grant',meta('revision-service','patient','P-0040'));
 recordEnrollmentState(id,{state:'invited',reason:'test',eligibilityConfirmed:true},meta('revision-eligible','doctor','doctor-zhang'));
 recordEnrollmentState(id,{state:'active',reason:'test'},meta('revision-active','case_manager','case-manager-chen'));
 const plan=getStore().psp.assignments.find(a=>a.enrollmentId===id&&a.kind==='questionnaire')!;
 const input={assignmentId:plan.id,patientId:'P-0040',scaleId:'endocrine_monthly_v1' as const,items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}};
 const first=submitProjectPro(input,{...meta('revision-first','patient','P-0040'),expectedVersion:plan.version});
 const oldStore=structuredClone(getStore());delete oldStore.psp.questionnaireEvidence;
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(oldStore)));
 process.env.DEMO_FIXED_NOW='2026-11-01T02:00:00.000Z';
 const live=getStore().psp.assignments.find(a=>a.id===plan.id)!;
 submitProjectPro({...input,revisionOf:first.data.proId},{...meta('revision-typed','patient','P-0040'),expectedVersion:live.version});
 const state=getStore().psp,november=computePspMetrics(state,{...options(state),periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt:'2026-11-01T02:00:00.000Z'});
 expect(Date.parse(plan.dueAt)).toBeGreaterThan(Date.parse('2026-11-01T02:00:00.000Z'));
 expect(byKey(november,'questionnaire_early_completed')).toMatchObject({status:'unknown',value:null,sampleN:null});
 const october=computePspMetrics(state,{...options(state),cutoffAt:'2026-11-01T02:00:00.000Z'});
 expect(byKey(october,'questionnaire_early_completed')).toMatchObject({value:null,status:'unknown',sampleN:null});
 expect(byKey(october,'stop_intent_ratio')).toMatchObject({value:null,status:'unknown',sampleN:null});
 expect(byKey(october,'questionnaire_early_completed')).not.toHaveProperty('denominator');
 expect(byKey(october,'stop_intent_ratio')).not.toHaveProperty('complementCells');
});

it('keeps unproven legacy dynamic plans in the same old metric view after an unrelated grant',async()=>{
 const id='ENR-19';
 const meta=(request:string,role:CommandMeta['role'],actorId:string):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id===id)!.version,clientRequestId:request,role,actorId});
 recordPermission(id,'service','grant',meta('legacy-service','patient','P-0040'));
 recordEnrollmentState(id,{state:'invited',reason:'test',eligibilityConfirmed:true},meta('legacy-eligible','doctor','doctor-zhang'));
 recordEnrollmentState(id,{state:'active',reason:'test'},meta('legacy-active','case_manager','case-manager-chen'));
 const oldStore=structuredClone(getStore());
 for(const a of oldStore.psp.assignments.filter(a=>a.enrollmentId===id)){delete a.assignedRecordedAt;delete a.assignedSequence;}
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(oldStore)));
 const state=getStore().psp,oldOptions=options(state),before=computePspMetrics(state,oldOptions);
 expect(before[0].applicability).toContain('未可用计划 3 项');
 recordPermission(id,'aggregate','grant',meta('legacy-aggregate','patient','P-0040'));
 expect(computePspMetrics(getStore().psp,oldOptions)).toEqual(before);
});

it('counts an early result after aggregate grant when its plan was created under internal service eligibility',()=>{
 const id='ENR-19';
 const meta=(request:string,role:CommandMeta['role'],actorId:string):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id===id)!.version,clientRequestId:request,role,actorId});
 recordPermission(id,'service','grant',meta('early-service','patient','P-0040'));
 recordEnrollmentState(id,{state:'invited',reason:'test',eligibilityConfirmed:true},meta('early-eligible','doctor','doctor-zhang'));
 recordEnrollmentState(id,{state:'active',reason:'test'},meta('early-active','case_manager','case-manager-chen'));
 const beforeGrant=getStore().psp,plan=beforeGrant.assignments.find(a=>a.enrollmentId===id&&a.kind==='questionnaire')!;
 for(const key of ['questionnaire_early_completed','contact_early_completed','education_early_completed']){
  expect(byKey(result(beforeGrant,'aggregate'),key)).toMatchObject({value:0,sampleN:0});
 }
 recordPermission(id,'aggregate','grant',meta('early-aggregate','patient','P-0040'));
 submitProjectPro({assignmentId:plan.id,patientId:'P-0040',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}},{...meta('early-pro','patient','P-0040'),expectedVersion:plan.version});
 const contact=getStore().psp.assignments.find(a=>a.enrollmentId===id&&a.kind==='contact')!;
 recordInteraction({enrollmentId:id,assignmentId:contact.id,channel:'phone',outcome:'reached',alertIds:[]},{...meta('early-contact','case_manager','case-manager-chen'),expectedVersion:contact.version});
 const education=getStore().psp.assignments.find(a=>a.enrollmentId===id&&a.kind==='education')!;
 const educationMeta=(request:string,role:CommandMeta['role'],actorId:string):CommandMeta=>({...meta(request,role,actorId),expectedVersion:getStore().psp.assignments.find(a=>a.id===education.id)!.version});
 sendEducation(education.id,getStore().psp.educationContents[0].id,educationMeta('early-send','case_manager','case-manager-chen'));
 recordEducationOpened(education.id,educationMeta('early-open','patient','P-0040'));
 recordEducationFeedback(education.id,{understood:true,needsHelp:false},educationMeta('early-feedback','patient','P-0040'));
 const aggregate=result(getStore().psp,'aggregate');
 expect(byKey(aggregate,'questionnaire_early_completed')).toMatchObject({value:1,sampleN:1});
 expect(byKey(aggregate,'contact_early_completed')).toMatchObject({value:1,sampleN:1});
 expect(byKey(aggregate,'education_early_completed')).toMatchObject({value:1,sampleN:1});
 expect(byKey(aggregate,'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
});

it('keeps a same-clock legacy first uncertain when aggregate order cannot be proved',async()=>{
 const id='ENR-19';
 const meta=(request:string,role:CommandMeta['role'],actorId:string):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id===id)!.version,clientRequestId:request,role,actorId});
 recordPermission(id,'service','grant',meta('scope-service','patient','P-0040'));
 recordEnrollmentState(id,{state:'invited',reason:'test',eligibilityConfirmed:true},meta('scope-eligible','doctor','doctor-zhang'));
 recordEnrollmentState(id,{state:'active',reason:'test'},meta('scope-active','case_manager','case-manager-chen'));
 const plan=getStore().psp.assignments.find(a=>a.enrollmentId===id&&a.kind==='questionnaire')!;
 const input={assignmentId:plan.id,patientId:'P-0040',scaleId:'endocrine_monthly_v1' as const,items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}};
 const first=submitProjectPro(input,{...meta('scope-first','patient','P-0040'),expectedVersion:plan.version});
 const oldStore=structuredClone(getStore());delete oldStore.psp.questionnaireEvidence;
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(oldStore)));
 recordPermission(id,'aggregate','grant',meta('scope-grant','patient','P-0040'));
 let aggregate=result(getStore().psp,'aggregate');
 expect(byKey(aggregate,'questionnaire_early_completed')).toMatchObject({value:null,status:'unknown',sampleN:null});
 expect(byKey(aggregate,'stop_intent_ratio')).toMatchObject({status:'unknown',value:null,sampleN:null});
 const live=getStore().psp.assignments.find(a=>a.id===plan.id)!;
 submitProjectPro({...input,revisionOf:first.data.proId},{...meta('scope-revision','patient','P-0040'),expectedVersion:live.version});
 aggregate=result(getStore().psp,'aggregate');
 expect(byKey(aggregate,'questionnaire_early_completed')).toMatchObject({value:null,status:'unknown',sampleN:null});
 expect(byKey(aggregate,'stop_intent_ratio')).toMatchObject({status:'unknown',value:null,sampleN:null});
});

it('places a typed November revision in aggregate November when its legacy October first preceded the grant',async()=>{
 const id='ENR-19';
 const meta=(request:string,role:CommandMeta['role'],actorId:string):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id===id)!.version,clientRequestId:request,role,actorId});
 recordPermission(id,'service','grant',meta('cross-scope-service','patient','P-0040'));
 recordEnrollmentState(id,{state:'invited',reason:'test',eligibilityConfirmed:true},meta('cross-scope-eligible','doctor','doctor-zhang'));
 recordEnrollmentState(id,{state:'active',reason:'test'},meta('cross-scope-active','case_manager','case-manager-chen'));
 const plan=getStore().psp.assignments.find(a=>a.enrollmentId===id&&a.kind==='questionnaire')!;
 const input={assignmentId:plan.id,patientId:'P-0040',scaleId:'endocrine_monthly_v1' as const,items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}};
 const first=submitProjectPro(input,{...meta('cross-scope-first','patient','P-0040'),expectedVersion:plan.version});
 const oldStore=structuredClone(getStore());delete oldStore.psp.questionnaireEvidence;
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(oldStore)));
 process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';
 recordPermission(id,'aggregate','grant',meta('cross-scope-aggregate','patient','P-0040'));
 process.env.DEMO_FIXED_NOW='2026-11-01T02:00:00.000Z';
 submitProjectPro({...input,revisionOf:first.data.proId},{...meta('cross-scope-revision','patient','P-0040'),expectedVersion:getStore().psp.assignments.find(a=>a.id===plan.id)!.version});
 const state=getStore().psp,cutoffAt='2026-11-02T02:00:00.000Z';
 const october=computePspMetrics(state,{...options(state,'aggregate'),cutoffAt});
 const november=computePspMetrics(state,{...options(state,'aggregate'),periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt});
 expect(byKey(october,'questionnaire_early_completed')).toMatchObject({value:null,status:'unknown',sampleN:null});
 expect(byKey(october,'stop_intent_ratio')).toMatchObject({value:null,status:'unknown',sampleN:null});
 expect(byKey(november,'questionnaire_early_completed')).toMatchObject({value:null,status:'unknown',sampleN:null});
 expect(byKey(november,'stop_intent_ratio')).toMatchObject({value:null,status:'unknown',sampleN:null});
 const due=computePspMetrics(state,{...options(state,'aggregate'),periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt:'2026-11-14T02:00:00.000Z'});
 expect(byKey(due,'questionnaire_completion')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(due,'questionnaire_on_time')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(due,'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
 const matureOctober=computePspMetrics(state,{...options(state,'aggregate'),cutoffAt:'2026-11-14T02:00:00.000Z'});
 expect(byKey(matureOctober,'stop_intent_ratio')).toMatchObject({status:'unknown',value:null,sampleN:null});
 expect(byKey(matureOctober,'stop_intent_ratio')).not.toHaveProperty('denominator');
 expect(byKey(matureOctober,'quality_questionnaire_stop_intent')).toMatchObject({status:'unknown',value:null,sampleN:null});
 expect(byKey(matureOctober,'quality_questionnaire_stop_intent')).not.toHaveProperty('denominator');
 const internal=computePspMetrics(state,{...options(state),cutoffAt});
 expect(byKey(internal,'questionnaire_early_completed').value).toBeNull();
 expect(byKey(internal,'stop_intent_ratio')).toMatchObject({value:null,status:'unknown',sampleN:null});
});

it('keeps due completion proven but late typed on-time unknown when a scope-valid old middle is missing',async()=>{
 const id='ENR-19';
 const meta=(request:string,role:CommandMeta['role'],actorId:string):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id===id)!.version,clientRequestId:request,role,actorId});
 recordPermission(id,'service','grant',meta('middle-service','patient','P-0040'));
 recordEnrollmentState(id,{state:'invited',reason:'test',eligibilityConfirmed:true},meta('middle-eligible','doctor','doctor-zhang'));
 recordEnrollmentState(id,{state:'active',reason:'test'},meta('middle-active','case_manager','case-manager-chen'));
 const plan=getStore().psp.assignments.find(a=>a.enrollmentId===id&&a.kind==='questionnaire')!;
 const input={assignmentId:plan.id,patientId:'P-0040',scaleId:'endocrine_monthly_v1' as const,items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{stopIntent:true}};
 const first=submitProjectPro(input,{...meta('middle-first','patient','P-0040'),expectedVersion:plan.version});
 process.env.DEMO_FIXED_NOW='2026-10-14T02:00:00.000Z';
 recordPermission(id,'aggregate','grant',meta('middle-grant','patient','P-0040'));
 process.env.DEMO_FIXED_NOW='2026-10-15T02:00:00.000Z';
 const middle=submitProjectPro({...input,revisionOf:first.data.proId},{...meta('middle-legacy','patient','P-0040'),expectedVersion:getStore().psp.assignments.find(a=>a.id===plan.id)!.version});
 const oldStore=structuredClone(getStore());delete oldStore.psp.questionnaireEvidence;
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(oldStore)));
 process.env.DEMO_FIXED_NOW='2026-11-14T02:00:00.000Z';
 submitProjectPro({...input,revisionOf:middle.data.proId},{...meta('middle-typed','patient','P-0040'),expectedVersion:getStore().psp.assignments.find(a=>a.id===plan.id)!.version});
 const state=getStore().psp,opts={...options(state,'aggregate'),periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt:'2026-11-14T02:00:00.000Z'};
 const aggregate=computePspMetrics(state,opts),completion=byKey(aggregate,'questionnaire_completion'),onTime=byKey(aggregate,'questionnaire_on_time');
 expect(completion).toMatchObject({status:'available',numerator:1,denominator:1,value:1});
 expect(completion.sourceRefs).toContain(state.questionnaireEvidence![0].id);
 expect(onTime).toMatchObject({status:'unknown',value:null,sampleN:1,denominator:1});
 expect(onTime).not.toHaveProperty('numerator');
 expect(onTime).not.toHaveProperty('complementCells');
 expect(byKey(aggregate,'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
});

it('reproduces the independently counted baseline from actual eligible plans and evidence',()=>{
 const state=getStore().psp,internal=result(state),aggregate=result(state,'aggregate');
 for(const [key,internalNumerator,internalDenominator,externalNumerator,externalDenominator] of [
  ['questionnaire_completion',0,18,0,14],['questionnaire_on_time',0,18,0,14],
  ['contact_completion',10,18,8,14],['education_completion',10,18,8,14],
  ['service_completion',20,36,16,28],
 ] as const){expect(byKey(internal,key)).toMatchObject({numerator:internalNumerator,denominator:internalDenominator,value:internalNumerator/internalDenominator});expect(byKey(aggregate,key)).toMatchObject({numerator:externalNumerator,denominator:externalDenominator,value:externalNumerator/externalDenominator});}
 expect(byKey(internal,'period_members')).toMatchObject({value:18,sampleN:18,sampleUnit:'people'});
 expect(byKey(aggregate,'period_members')).toMatchObject({value:14,sampleN:14,sampleUnit:'people'});
 expect(byKey(internal,'self_report_ratio')).toMatchObject({status:'no_applicable',value:null,denominator:0});
 expect(byKey(aggregate,'self_report_ratio')).toMatchObject({status:'no_applicable',value:null,denominator:0});
 expect(byKey(internal,'alert_contact_coverage')).toMatchObject({status:'no_applicable',value:null,denominator:0});
 expect(byKey(internal,'alert_contact_p50')).toMatchObject({status:'no_applicable',value:null,sampleN:0});
});

it('counts only explicitly imported historical daily copies and excludes the incomplete boundary day',()=>{
 const state=getStore().psp;
 for(const enrollment of state.enrollments.filter(e=>e.status==='active')){
  const meta:CommandMeta={seedVersion:getStore().seedVersion,expectedVersion:enrollment.version,clientRequestId:`import-${enrollment.id}`,role:'case_manager',actorId:'case-manager-chen'};
  importLegacySelfReports(enrollment.id,meta);
 }
 const imported=getStore().psp,internal=result(imported),aggregate=result(imported,'aggregate');
 expect(byKey(internal,'self_report_ratio')).toMatchObject({numerator:199,denominator:216,value:199/216,sampleN:18,sampleUnit:'people',unit:'doses',complementCells:[199,17]});
 expect(byKey(aggregate,'self_report_ratio')).toMatchObject({numerator:153,denominator:168,value:153/168,sampleN:14,sampleUnit:'people',unit:'doses',complementCells:[153,15]});
 expect(byKey(internal,'self_report_people').value).toBe(18);
 expect(byKey(internal,'self_report_days').value).toBe(12);
 expect(byKey(internal,'self_report_days')).toMatchObject({sampleUnit:'people',sampleN:18});
 expect(imported.selfReportRevisions?.some(r=>r.logDate==='2026-10-13')).toBe(false);
});

it('adds a precise same-day missed dose once while leaving imported history unchanged',()=>{
 const state=getStore().psp;
 for(const enrollment of state.enrollments.filter(e=>e.status==='active'))importLegacySelfReports(enrollment.id,{seedVersion:getStore().seedVersion,expectedVersion:enrollment.version,clientRequestId:`precise-import-${enrollment.id}`,role:'case_manager',actorId:'case-manager-chen'});
 submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:0,reason:'忘记'},{seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id==='ENR-01')!.version,clientRequestId:'precise-missed',role:'patient',actorId:'P-A'});
 expect(byKey(result(getStore().psp),'self_report_ratio')).toMatchObject({numerator:199,denominator:217,value:199/217});
 expect(byKey(result(getStore().psp,'aggregate'),'self_report_ratio')).toMatchObject({numerator:153,denominator:169,value:153/169});
 expect(byKey(result(getStore().psp),'self_report_days').value).toBe(13);
});

it('uses a verified correction as one effective contact and preserves the original at older ledger revisions',()=>{
 const original=getStore().psp.serviceEvents.find(e=>e.enrollmentId==='ENR-01')!,before=getStore().psp.ledgerRevision;
 const meta:CommandMeta={seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'metrics-propose',role:'case_manager',actorId:'case-manager-chen'};
 const proposal=proposeCorrection({sourceRef:{kind:'contact',id:original.id},correctedValue:{kind:'contact',channel:'phone',outcome:'reached'},reason:'原始电话记录复核',occurredAt:'2026-10-12T12:00:00+08:00'},meta);
 const unverified=result(getStore().psp);
 expect(byKey(unverified,'contact_completion').numerator).toBe(10);
 verifyCorrection(proposal.data.id,{...meta,clientRequestId:'metrics-verify',role:'data_reviewer',actorId:'data-reviewer-psp'});
 const state=getStore().psp,metrics=result(state),old=computePspMetrics(state,{...options(state),ledgerRevision:before});
 expect(byKey(metrics,'contact_completion')).toMatchObject({numerator:11,denominator:18});
 expect(byKey(metrics,'interaction_attempts').value).toBe(18);
 expect(byKey(metrics,'interaction_successes').value).toBe(11);
 expect(byKey(metrics,'contact_completion').sourceRefs).toEqual(expect.arrayContaining([original.id,proposal.data.id]));
 expect(byKey(old,'contact_completion').numerator).toBe(10);
 expect(state.serviceEvents.find(e=>e.id===original.id)?.outcome).toBe('no_answer');
});

it('moves a verified contact across the monthly boundary before period filtering',()=>{
 process.env.DEMO_FIXED_NOW='2026-11-01T02:00:00.000Z';
 const original=getStore().psp.serviceEvents.find(e=>e.enrollmentId==='ENR-01')!;
 const meta:CommandMeta={seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'cross-month-propose',role:'case_manager',actorId:'case-manager-chen'};
 const proposal=proposeCorrection({sourceRef:{kind:'contact',id:original.id},correctedValue:{kind:'contact',channel:'phone',outcome:'reached'},reason:'原记录月份核对',occurredAt:'2026-11-01T10:00:00+08:00'},meta);
 verifyCorrection(proposal.data.id,{...meta,clientRequestId:'cross-month-verify',role:'data_reviewer',actorId:'data-reviewer-psp'});
 const state=getStore().psp,november=computePspMetrics(state,{...options(state),periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt:'2026-11-01T02:00:00.000Z'});
 const october=computePspMetrics(state,{...options(state),cutoffAt:'2026-11-01T02:00:00.000Z'});
 const oldOctober=computePspMetrics(state,options(state));
 expect(byKey(november,'interaction_attempts').value).toBe(1);
 expect(byKey(november,'interaction_successes').value).toBe(1);
 expect(byKey(november,'interaction_attempts').sourceRefs).toEqual(expect.arrayContaining([original.id,proposal.data.id]));
 expect(byKey(october,'interaction_attempts').value).toBe(17);
 expect(byKey(oldOctober,'interaction_attempts').value).toBe(18);
});

it('uses the correction sequence for a new aggregate grant without retroactively including the original contact',()=>{
 const enrollment=getStore().psp.enrollments.find(e=>e.id==='ENR-15')!,original=getStore().psp.serviceEvents.find(e=>e.enrollmentId===enrollment.id)!;
 expect(byKey(result(getStore().psp,'aggregate'),'interaction_attempts').value).toBe(14);
 recordPermission(enrollment.id,'aggregate','grant',{seedVersion:getStore().seedVersion,expectedVersion:enrollment.version,clientRequestId:'new-grant',role:'patient',actorId:enrollment.patientId});
 const meta:CommandMeta={seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.enrollments.find(e=>e.id===enrollment.id)!.version,clientRequestId:'post-grant-correction',role:'case_manager',actorId:'case-manager-chen'};
 const proposal=proposeCorrection({sourceRef:{kind:'contact',id:original.id},correctedValue:{kind:'contact',channel:'phone',outcome:'reached'},reason:'授权后复核实际联系日',occurredAt:PSP_TEST_NOW},meta);
 verifyCorrection(proposal.data.id,{...meta,expectedVersion:proposal.data.version,clientRequestId:'post-grant-verify',role:'data_reviewer',actorId:'data-reviewer-psp'});
 const external=result(getStore().psp,'aggregate');
 expect(byKey(external,'interaction_attempts').value).toBe(15);
 expect(byKey(external,'interaction_successes').value).toBe(9);
 expect(byKey(external,'interaction_attempts').sourceRefs).toEqual(expect.arrayContaining([original.id,proposal.data.id]));
});

it('returns detached results and is independent of host time and clinical rows',()=>{
 const state=structuredClone(getStore().psp),baseline=result(state);
 process.env.DEMO_FIXED_NOW='2027-12-31T00:00:00Z';
 getStore().patients.get('P-A')!.adherence.length=0;
 getStore().patients.get('P-A')!.pro.length=0;
 expect(result(state)).toEqual(baseline);
 const first=baseline[0];first.sourceRefs.push('poison');first.window.scope='aggregate';
 expect(result(state)[0]).not.toEqual(first);
});

it('counts one real late PRO, one call covering two new alerts, and actual education feedback separately',()=>{
 const plan=(kind:string)=>`PSP-BC-ENDO-001:ENR-01:${kind}:2026-10`;
 const meta=(id:string,role:CommandMeta['role'],actorId:string,version=1):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:version,clientRequestId:id,role,actorId});
 const pro=submitProjectPro({assignmentId:plan('PRO'),patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((symptom,i)=>[symptom,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}},meta('metric-pro','patient','P-A'));
 expect(pro.data.alertIds).toHaveLength(2);
 const call=recordInteraction({enrollmentId:'ENR-01',assignmentId:plan('CONTACT'),channel:'phone',outcome:'reached',alertIds:pro.data.alertIds},meta('metric-call','case_manager','case-manager-chen'));
 const content=getStore().psp.educationContents[0];
 const educationVersion=()=>getStore().psp.assignments.find(a=>a.id===plan('EDUCATION'))!.version;
 sendEducation(plan('EDUCATION'),content.id,meta('metric-send','case_manager','case-manager-chen',educationVersion()));
 recordEducationOpened(plan('EDUCATION'),meta('metric-open','patient','P-A',educationVersion()));
 recordEducationFeedback(plan('EDUCATION'),{understood:false,needsHelp:false},meta('metric-feedback','patient','P-A',educationVersion()));
 const metrics=result(getStore().psp),external=result(getStore().psp,'aggregate');
 expect(byKey(metrics,'questionnaire_completion')).toMatchObject({numerator:1,denominator:18});
 expect(byKey(metrics,'questionnaire_on_time')).toMatchObject({numerator:0,denominator:18});
 expect(byKey(metrics,'contact_completion')).toMatchObject({numerator:11,denominator:18});
 expect(byKey(metrics,'education_completion')).toMatchObject({numerator:11,denominator:18});
 expect(byKey(metrics,'service_completion')).toMatchObject({numerator:22,denominator:36});
 expect(byKey(external,'service_completion')).toMatchObject({numerator:18,denominator:28});
 expect(byKey(metrics,'alert_contact_coverage')).toMatchObject({numerator:2,denominator:2,value:1});
 expect(byKey(metrics,'alert_contact_on_time')).toMatchObject({denominator:0,value:null,status:'no_applicable'});
 expect(byKey(metrics,'alert_pending').value).toBe(2);
 expect(byKey(metrics,'interaction_attempts').value).toBe(19);
 expect(byKey(metrics,'interaction_attempts').sourceRefs).toContain(call.data.id);
 expect(byKey(metrics,'alert_contact_p50')).toMatchObject({value:0,sampleN:2});
 expect(byKey(metrics,'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1,value:1});
});

it('freezes first submission and selects the latest nullable stop flag at each same-clock revision',()=>{
 const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10',items=Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1]));
 const meta=(id:string,version:number):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:version,clientRequestId:id,role:'patient',actorId:'P-A'});
 const first=submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items,flags:{stopIntent:true}},meta('first',1));
 const firstRevision=getStore().psp.ledgerRevision;
 const second=submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items,flags:{stopIntent:false},revisionOf:first.data.proId},meta('second',first.objectVersion));
 const secondRevision=getStore().psp.ledgerRevision;
 const third=submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items,flags:{},revisionOf:second.data.proId},meta('third',second.objectVersion));
 const state=getStore().psp,at=(revision:number)=>computePspMetrics(state,{...options(state),ledgerRevision:revision});
 expect(byKey(at(firstRevision),'questionnaire_completion')).toMatchObject({numerator:1,denominator:18});
 expect(byKey(at(firstRevision),'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(at(secondRevision),'questionnaire_completion')).toMatchObject({numerator:1,denominator:18});
 expect(byKey(at(secondRevision),'stop_intent_ratio')).toMatchObject({numerator:0,denominator:1});
 expect(byKey(result(state),'stop_intent_ratio')).toMatchObject({status:'unknown',value:null,sampleN:null});
 expect(byKey(result(state),'quality_questionnaire_stop_intent')).toMatchObject({numerator:1,denominator:1});
 expect(state.questionnaireEvidence!.map(e=>e.stopIntent)).toEqual([true,false,null]);
 expect(third.data.firstValidSubmittedAt).toBe(first.data.firstValidSubmittedAt);
});

it('keeps unknown completed legacy PRO out of the numerator and reports its evidence gap',()=>{
 const state=structuredClone(getStore().psp),assignment=state.assignments.find(a=>a.id==='PSP-BC-ENDO-001:ENR-01:PRO:2026-10')!;
 assignment.status='completed';assignment.firstValidSubmittedAt='2026-10-13T02:00:00.000Z';assignment.latestValidResponseId='legacy-response';
 const metrics=result(state);
 expect(byKey(metrics,'questionnaire_completion')).toMatchObject({denominator:18,value:null,status:'unknown'});
 expect(byKey(metrics,'quality_questionnaire_evidence')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(metrics,'stop_intent_ratio')).toMatchObject({status:'unknown',value:null,sampleN:null});
});

it('does not infer a future typed PRO from its current materialized status at an older ledger revision',()=>{
 const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10',before=getStore().psp.ledgerRevision;
 submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map(s=>[s,1])),flags:{}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'late-pro',role:'patient',actorId:'P-A'});
 const state=getStore().psp,old=computePspMetrics(state,{...options(state),ledgerRevision:before});
 expect(byKey(old,'questionnaire_completion')).toMatchObject({numerator:0,denominator:18,value:0});
 expect(byKey(old,'quality_questionnaire_evidence')).toMatchObject({denominator:0,value:null});
});

it('counts active members at cutoff independently of period membership',()=>{
 const state=structuredClone(getStore().psp),enrollment=state.enrollments.find(e=>e.id==='ENR-19')!;
 enrollment.status='active';enrollment.eligibilityConfirmed=true;enrollment.eligibilityConfirmedAt=PSP_TEST_NOW;enrollment.eligibilityConfirmedBy='doctor-zhang';
 state.membershipEvents.push({id:'late-active',enrollmentId:enrollment.id,status:'active',reason:'晚于报告期激活',occurredAt:PSP_TEST_NOW,recordedAt:PSP_TEST_NOW,actorId:'case-manager-chen',sequence:++state.ledgerRevision});
 state.permissionEvents.push({id:'late-grant',enrollmentId:enrollment.id,scope:'service',action:'grant',textVersion:'psp-consent-v1',occurredAt:PSP_TEST_NOW,recordedAt:PSP_TEST_NOW,actorId:enrollment.patientId,sequence:++state.ledgerRevision});
 const metrics=computePspMetrics(state,{...options(state),periodEnd:'2026-10-12T00:00:00+08:00'});
 expect(byKey(metrics,'period_members').value).toBe(18);
 expect(byKey(metrics,'active_members').value).toBe(19);
});

it('retains past due responsibility after real withdrawal, exit, and late legal cancellation',()=>{
 const enrollment=getStore().psp.enrollments.find(e=>e.id==='ENR-01')!,contactId='PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10';
 recordPermission(enrollment.id,'service','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:enrollment.version,clientRequestId:'metrics-withdraw',role:'patient',actorId:enrollment.patientId});
 let state=getStore().psp;
 expect(byKey(result(state),'period_members').value).toBe(18);
 expect(byKey(result(state),'active_members').value).toBe(17);
 expect(byKey(result(state),'contact_completion')).toMatchObject({numerator:10,denominator:18});
 cancelProjectAssignment(contactId,'退出后的逾期计划保留责任',{seedVersion:getStore().seedVersion,expectedVersion:state.assignments.find(a=>a.id===contactId)!.version,clientRequestId:'metrics-late-cancel',role:'case_manager',actorId:'case-manager-chen'});
 state=getStore().psp;
 expect(byKey(result(state),'contact_completion')).toMatchObject({numerator:10,denominator:18});
 expect(byKey(result(state),'contact_completion').sourceRefs).toEqual(expect.arrayContaining([contactId,state.assignmentCancellations![0].id]));
 recordEnrollmentState(enrollment.id,{state:'exited',reason:'服务退出'},{seedVersion:getStore().seedVersion,expectedVersion:state.enrollments.find(e=>e.id===enrollment.id)!.version,clientRequestId:'metrics-exit',role:'case_manager',actorId:'case-manager-chen'});
 expect(byKey(result(getStore().psp),'period_members').value).toBe(18);
 expect(byKey(result(getStore().psp),'contact_completion').denominator).toBe(18);
});

it('excludes a before-due cancelled obligation only with known explicit evidence',()=>{
 const state=structuredClone(getStore().psp),contactId='PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10',assignment=state.assignments.find(a=>a.id===contactId)!;
 assignment.status='cancelled';
 expect(byKey(result(state),'contact_completion').denominator).toBe(18);
 const at='2026-10-07T02:00:00.000Z';
 state.permissionEvents.push({id:'before-due-withdraw',enrollmentId:'ENR-01',scope:'service',action:'withdraw',textVersion:'psp-consent-v1',occurredAt:at,recordedAt:at,actorId:'P-A',sequence:++state.ledgerRevision});
 state.membershipEvents.push({id:'before-due-pause',enrollmentId:'ENR-01',status:'paused',reason:'暂停',occurredAt:at,recordedAt:at,actorId:'case-manager-chen',sequence:++state.ledgerRevision});
 expect(byKey(result(state),'contact_completion').denominator).toBe(18);
 state.assignmentCancellations=[{id:'before-due-cancel',projectId:state.project.id,enrollmentId:'ENR-01',assignmentId:contactId,occurredAt:at,recordedAt:at,actorId:'case-manager-chen',sequence:++state.ledgerRevision,reason:'退出后取消未来计划'}];
 expect(byKey(result(state),'contact_completion').denominator).toBe(17);
 expect(byKey(result(state),'contact_completion').sourceRefs).toEqual(expect.arrayContaining([contactId,'before-due-cancel','before-due-withdraw','before-due-pause']));
 expect(byKey(result(state),'service_completion').sourceRefs).toContain('before-due-cancel');
});

it('keeps an old revision output identical when a later dynamic plan is added at the same clock instant',()=>{
 const state=structuredClone(getStore().psp),oldOptions=options(state),before=computePspMetrics(state,oldOptions);
 const template=state.assignments.find(a=>a.id==='PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10')!;
 state.assignments.push({...template,id:'later-dynamic-plan',assignedAt:PSP_TEST_NOW,assignedRecordedAt:PSP_TEST_NOW,assignedSequence:++state.ledgerRevision,dueAt:'2026-10-15T02:00:00.000Z',status:'open'});
 expect(computePspMetrics(state,oldOptions)).toEqual(before);
});

it('does not disclose an unprovable internal-only plan in aggregate applicability',()=>{
 const state=structuredClone(getStore().psp),aggregateBefore=computePspMetrics(state,options(state,'aggregate'));
 const template=state.assignments.find(a=>a.id==='PSP-BC-ENDO-001:ENR-15:CONTACT:2026-10')!;
 state.assignments.push({...template,id:'unprovable-internal-only-plan',assignedAt:'2026-10-02T00:00:00.000Z',status:'open'});
 expect(computePspMetrics(state,options(state,'aggregate'))).toEqual(aggregateBefore);
 expect(byKey(result(state),'period_members').applicability).toContain('未可用计划 1 项');
});

it('anchors a November questionnaire to its due month while counting its first October submission once as early',()=>{
 const state=structuredClone(getStore().psp),template=state.assignments.find(a=>a.id==='PSP-BC-ENDO-001:ENR-01:PRO:2026-10')!;
 const assignedAt=PSP_TEST_NOW,assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-11',dueAt='2026-11-13T01:00:00.000Z';
 const assignedSequence=++state.ledgerRevision;
 state.assignments.push({...template,id:assignmentId,assignedAt,assignedRecordedAt:assignedAt,assignedSequence,dueAt,status:'completed',firstValidSubmittedAt:assignedAt,latestValidResponseId:'early-nov-response'});
 const oldRevision=state.ledgerRevision;
 state.questionnaireEvidence=[{id:'early-nov-evidence',projectId:state.project.id,enrollmentId:'ENR-01',assignmentId,responseId:'early-nov-response',scaleId:'endocrine_monthly_v1',occurredAt:assignedAt,recordedAt:assignedAt,actorId:'P-A',sequence:++state.ledgerRevision,stopIntent:true,alerts:[]}];
 const october=computePspMetrics(state,options(state)),november=computePspMetrics(state,{...options(state),periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt:dueAt});
 expect(byKey(october,'questionnaire_early_completed')).toMatchObject({value:1,unit:'forms',sampleN:1});
 expect(byKey(october,'questionnaire_completion')).toMatchObject({numerator:0,denominator:18});
 expect(byKey(november,'questionnaire_completion')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(november,'questionnaire_on_time')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(november,'questionnaire_early_completed').value).toBe(0);
 expect(byKey(october,'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(november,'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(november,'questionnaire_completion').sourceRefs).toEqual(expect.arrayContaining([assignmentId,'early-nov-evidence']));
 expect(byKey(computePspMetrics(state,{...options(state),ledgerRevision:oldRevision}),'questionnaire_early_completed').value).toBe(0);
});

it('uses November contact and education results for October-due plans while keeping event counts in November',()=>{
 process.env.DEMO_FIXED_NOW='2026-11-01T02:00:00.000Z';
 const contactId='PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10',educationId='PSP-BC-ENDO-001:ENR-01:EDUCATION:2026-10';
 const meta=(id:string,role:CommandMeta['role'],actorId:string,version=1):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:version,clientRequestId:id,role,actorId});
 recordInteraction({enrollmentId:'ENR-01',assignmentId:contactId,channel:'phone',outcome:'reached',alertIds:[]},meta('nov-reached','case_manager','case-manager-chen'));
 const version=()=>getStore().psp.assignments.find(a=>a.id===educationId)!.version;
 sendEducation(educationId,getStore().psp.educationContents[0].id,meta('nov-send','case_manager','case-manager-chen',version()));
 recordEducationOpened(educationId,meta('nov-open','patient','P-A',version()));
 recordEducationFeedback(educationId,{understood:true,needsHelp:false},meta('nov-feedback','patient','P-A',version()));
 const state=getStore().psp,october=computePspMetrics(state,{...options(state),cutoffAt:'2026-11-02T02:00:00.000Z'}),november=computePspMetrics(state,{...options(state),periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt:'2026-11-02T02:00:00.000Z'});
 expect(byKey(october,'contact_completion')).toMatchObject({numerator:11,denominator:18});
 expect(byKey(october,'education_completion')).toMatchObject({numerator:11,denominator:18});
 expect(byKey(october,'service_completion')).toMatchObject({numerator:22,denominator:36});
 expect(byKey(october,'interaction_attempts').value).toBe(18);
 expect(byKey(november,'interaction_attempts').value).toBe(1);
 expect(byKey(november,'contact_completion')).toMatchObject({denominator:0,value:null});
 expect(byKey(october,'contact_completion').sourceRefs).toContain(state.serviceEvents.at(-1)!.id);
 expect(byKey(october,'education_completion').sourceRefs).toContain(state.educationEvents!.at(-1)!.id);
});

it('requires aggregate authorization at the cross-month result occurrence, separately from due eligibility',()=>{
 process.env.DEMO_FIXED_NOW='2026-10-31T15:00:00.000Z';
 recordPermission('ENR-01','aggregate','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'scope-before-result',role:'patient',actorId:'P-A'});
 process.env.DEMO_FIXED_NOW='2026-11-01T02:00:00.000Z';
 recordInteraction({enrollmentId:'ENR-01',assignmentId:'PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10',channel:'phone',outcome:'reached',alertIds:[]},{seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.assignments.find(a=>a.id==='PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10')!.version,clientRequestId:'post-withdraw-result',role:'case_manager',actorId:'case-manager-chen'});
 const state=getStore().psp,cutoffAt='2026-11-02T02:00:00.000Z';
 expect(byKey(computePspMetrics(state,{...options(state),cutoffAt}),'contact_completion')).toMatchObject({numerator:11,denominator:18});
 expect(byKey(computePspMetrics(state,{...options(state,'aggregate'),cutoffAt}),'contact_completion')).toMatchObject({numerator:8,denominator:14});
});

it('observes a November timely contact for an October-triggered alert without moving its interaction count',()=>{
 const state=structuredClone(getStore().psp),assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10',triggeredAt='2026-10-31T15:30:00.000Z',contactAt='2026-10-31T16:30:00.000Z';
 state.questionnaireEvidence=[{id:'oct-alert-evidence',projectId:state.project.id,enrollmentId:'ENR-01',assignmentId,responseId:'oct-alert-response',scaleId:'endocrine_monthly_v1',occurredAt:triggeredAt,recordedAt:triggeredAt,actorId:'P-A',sequence:++state.ledgerRevision,stopIntent:true,alerts:[{id:'oct-alert',kind:'symptom',level:'high',triggeredAt}]}];
 const beforeContact=state.ledgerRevision;
 state.serviceEvents.push({id:'nov-contact',projectId:state.project.id,enrollmentId:'ENR-01',kind:'contact',interactionId:'nov-interaction',alertIds:['oct-alert'],channel:'phone',outcome:'reached',occurredAt:contactAt,recordedAt:contactAt,actorId:'case-manager-chen',sequence:++state.ledgerRevision,source:'psp-v1'});
 const octOptions={...options(state),cutoffAt:'2026-11-02T02:00:00.000Z'},october=computePspMetrics(state,octOptions);
 const november=computePspMetrics(state,{...octOptions,periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00'});
 expect(byKey(october,'alert_contact_coverage')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(october,'alert_contact_on_time')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(october,'alert_contact_p50')).toMatchObject({value:1,sampleN:1});
 expect(byKey(october,'interaction_attempts').value).toBe(18);
 expect(byKey(november,'interaction_attempts').value).toBe(1);
 expect(byKey(november,'alert_contact_coverage')).toMatchObject({denominator:0,value:null});
 expect(byKey(november,'alert_carry_over').value).toBe(1);
 expect(byKey(november,'alert_carry_over_contacted').value).toBe(1);
 expect(byKey(computePspMetrics(state,{...octOptions,cutoffAt:'2026-10-31T15:45:00.000Z'}),'alert_pending').value).toBe(1);
 expect(byKey(computePspMetrics(state,{...octOptions,ledgerRevision:beforeContact}),'alert_contact_coverage')).toMatchObject({numerator:0,denominator:1});
 const closed=structuredClone(state);
 closed.alertActions=[{id:'prior-close',projectId:state.project.id,enrollmentId:'ENR-01',alertId:'oct-alert',action:'close',occurredAt:'2026-10-31T15:45:00.000Z',recordedAt:'2026-10-31T15:45:00.000Z',actorId:'doctor-zhang',sequence:++closed.ledgerRevision}];
 expect(byKey(computePspMetrics(closed,{...octOptions,ledgerRevision:closed.ledgerRevision,periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00'}),'alert_carry_over').value).toBe(0);
});

it('chooses the latest known scope-valid stop flag even when its revision occurs after the cohort month',()=>{
 const state=structuredClone(getStore().psp),assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10',firstAt=PSP_TEST_NOW,revisionAt='2026-11-01T02:00:00.000Z';
 state.questionnaireEvidence=[{id:'oct-stop-true',projectId:state.project.id,enrollmentId:'ENR-01',assignmentId,responseId:'oct-response',scaleId:'endocrine_monthly_v1',occurredAt:firstAt,recordedAt:firstAt,actorId:'P-A',sequence:++state.ledgerRevision,stopIntent:true,alerts:[]}];
 const oldRevision=state.ledgerRevision;
 state.questionnaireEvidence.push({id:'nov-stop-false',projectId:state.project.id,enrollmentId:'ENR-01',assignmentId,responseId:'nov-revision',scaleId:'endocrine_monthly_v1',revisionOf:'oct-response',occurredAt:revisionAt,recordedAt:revisionAt,actorId:'P-A',sequence:++state.ledgerRevision,stopIntent:false,alerts:[]});
 const optionsAt={...options(state),cutoffAt:'2026-11-02T02:00:00.000Z'};
 expect(byKey(computePspMetrics(state,optionsAt),'stop_intent_ratio')).toMatchObject({numerator:0,denominator:1});
 expect(byKey(computePspMetrics(state,{...optionsAt,ledgerRevision:oldRevision}),'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
 expect(byKey(computePspMetrics(state,{...optionsAt,cutoffAt:PSP_TEST_NOW}),'stop_intent_ratio')).toMatchObject({numerator:1,denominator:1});
});

it('does not cite prior-month handling as a carry-over result in the new month',()=>{
 const state=structuredClone(getStore().psp),triggeredAt='2026-10-31T15:30:00.000Z',handledAt='2026-10-31T15:45:00.000Z';
 state.questionnaireEvidence=[{id:'carry-birth',projectId:state.project.id,enrollmentId:'ENR-01',assignmentId:'PSP-BC-ENDO-001:ENR-01:PRO:2026-10',responseId:'carry-response',scaleId:'endocrine_monthly_v1',occurredAt:triggeredAt,recordedAt:triggeredAt,actorId:'P-A',sequence:++state.ledgerRevision,stopIntent:null,alerts:[{id:'carry-alert',kind:'symptom',level:'high',triggeredAt}]}];
 state.serviceEvents.push({id:'prior-month-call',projectId:state.project.id,enrollmentId:'ENR-01',kind:'contact',interactionId:'prior-month-interaction',alertIds:['carry-alert'],channel:'phone',outcome:'reached',occurredAt:handledAt,recordedAt:handledAt,actorId:'case-manager-chen',sequence:++state.ledgerRevision,source:'psp-v1'});
 const november=computePspMetrics(state,{...options(state),periodStart:'2026-11-01T00:00:00+08:00',periodEnd:'2026-12-01T00:00:00+08:00',cutoffAt:'2026-11-02T02:00:00.000Z'});
 expect(byKey(november,'alert_carry_over').value).toBe(1);
 expect(byKey(november,'alert_carry_over_contacted').value).toBe(0);
 expect(byKey(november,'alert_carry_over_contacted').sourceRefs).not.toContain('prior-month-call');
});

it('treats the exact high and medium contact deadlines as mature only at their cutoff',()=>{
 const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10';
 const pro=submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((symptom,i)=>[symptom,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'deadline',role:'patient',actorId:'P-A'});
 expect(pro.data.alertIds).toHaveLength(2);
 const state=structuredClone(getStore().psp);
 // The rule currently emits two high alerts for this submission; vary one copied
 // birth to exercise the configured medium deadline in the pure calculator.
 state.questionnaireEvidence![0].alerts[1].level='medium';
 const metricsAt=(cutoffAt:string)=>computePspMetrics(state,{...options(state),cutoffAt});
 expect(byKey(metricsAt('2026-10-13T03:59:59.000Z'),'alert_contact_on_time')).toMatchObject({denominator:0,value:null});
 expect(byKey(metricsAt('2026-10-13T04:00:00.000Z'),'alert_contact_on_time')).toMatchObject({numerator:0,denominator:1,value:0});
 expect(byKey(metricsAt('2026-10-14T02:00:00.000Z'),'alert_contact_on_time')).toMatchObject({numerator:0,denominator:2,value:0});
 expect(byKey(metricsAt('2026-10-13T04:00:00.000Z'),'alert_pending').value).toBe(1);
});

it('uses nearest-rank P50 and P90 for one and three evidenced alert contacts',()=>{
 const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10';
 submitProjectPro({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((symptom,i)=>[symptom,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'percentile-pro',role:'patient',actorId:'P-A'});
 const state=structuredClone(getStore().psp),birth=state.questionnaireEvidence![0],base=state.serviceEvents[0];
 birth.alerts.push({...birth.alerts[0],id:'typed-third-alert'});
 const ids=birth.alerts.map(a=>a.id),first=Date.parse(birth.alerts[0].triggeredAt),recordedAt='2026-10-14T02:00:00.000Z';
 for(const [i,hours] of [1,2,10].entries())state.serviceEvents.push({...base,id:`percentile-contact-${i}`,interactionId:`percentile-interaction-${i}`,enrollmentId:'ENR-01',assignmentId:undefined,alertIds:[ids[i]],channel:'phone',outcome:'reached',occurredAt:new Date(first+hours*3_600_000).toISOString(),recordedAt,sequence:++state.ledgerRevision});
 const opts={...options(state),cutoffAt:recordedAt},metrics=computePspMetrics(state,opts);
 expect(byKey(metrics,'alert_contact_p50')).toMatchObject({value:2,sampleN:3});
 expect(byKey(metrics,'alert_contact_p90')).toMatchObject({value:10,sampleN:3});
 const single=structuredClone(state);single.serviceEvents=single.serviceEvents.filter(e=>!e.id.startsWith('percentile-contact-')||e.id==='percentile-contact-0');
 expect(byKey(computePspMetrics(single,opts),'alert_contact_p90')).toMatchObject({value:1,sampleN:1});
});
