import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {submitProjectPro} from '@/lib/psp/commands';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
import {validatePspState} from '@/lib/psp/types';
import {recordPermission,recordEnrollmentState} from '@/lib/psp/permissions';
import {cancelProjectAssignment} from '@/lib/psp/assignmentCancellation';
import {validatePspMetricEvidenceLinks} from '@/lib/psp/metricEvidenceValidation';

const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10';
const body=()=>({assignmentId,patientId:'P-A',scaleId:'endocrine_monthly_v1' as const,items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((s,i)=>[s,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}});
const meta=(id:string)=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.assignments.find(a=>a.id===assignmentId)!.version,clientRequestId:id,actorId:'P-A',role:'patient' as const});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});

it('copies real PRO response and alert births into one sequenced historical fact; replay adds none',()=>{
 const first=submitProjectPro(body(),meta('first'));
 const evidence=getStore().psp.questionnaireEvidence;
 expect(evidence).toHaveLength(1);
 expect(evidence![0]).toMatchObject({assignmentId,responseId:first.data.proId,stopIntent:true,sequence:first.ledgerRevision-1});
 expect(evidence![0].alerts.map(a=>a.id)).toEqual(first.data.alertIds);
 expect(evidence![0].alerts.every(a=>a.triggeredAt===PSP_TEST_NOW)).toBe(true);
 const prior=structuredClone(getStore().psp);
 submitProjectPro(body(),{...meta('first'),expectedVersion:1});
 expect(getStore().psp).toEqual(prior);
});

it('preserves a missing stop intent as null through a real revision',()=>{
 const first=submitProjectPro(body(),meta('first'));
 const revision=submitProjectPro({...body(),flags:{missedDoses14d:0},revisionOf:first.data.proId},meta('revision'));
 const evidence=getStore().psp.questionnaireEvidence!;
 expect(evidence).toHaveLength(2);
 expect(evidence[1]).toMatchObject({responseId:revision.data.proId,revisionOf:first.data.proId,stopIntent:null});
 expect(getStore().psp.assignments.find(a=>a.id===assignmentId)!.firstValidSubmittedAt).toBe(PSP_TEST_NOW);
});

it('rejects duplicate global sequence and malformed assignment creation metadata',()=>{
 const state=structuredClone(getStore().psp);
 state.assignments[0].assignedSequence=state.membershipEvents[0].sequence;
 state.assignments[0].assignedRecordedAt=state.assignments[0].assignedAt;
 expect(()=>validatePspState(state)).toThrow(/sequence/i);
 delete state.assignments[0].assignedSequence;
 expect(()=>validatePspState(state)).toThrow();
});

it('records activation before later plans and rejects missing creation proof',()=>{
 const enrollment='ENR-19';
 const m=(clientRequestId:string,expectedVersion:number,actorId:string,role:'patient'|'doctor'|'case_manager')=>({seedVersion:getStore().seedVersion,expectedVersion,clientRequestId,actorId,role});
 recordPermission(enrollment,'service','grant',m('grant',1,'P-0040','patient'));
 recordEnrollmentState(enrollment,{state:'invited',reason:'确认',eligibilityConfirmed:true},m('confirm',2,'doctor-zhang','doctor'));
 recordEnrollmentState(enrollment,{state:'active',reason:'加入'},m('activate',3,'case-manager-chen','case_manager'));
 const state=getStore().psp,active=state.membershipEvents.find(e=>e.enrollmentId===enrollment&&e.status==='active')!;
 const plans=state.assignments.filter(a=>a.enrollmentId===enrollment);
 expect(plans).toHaveLength(3);
 expect(plans.every(p=>p.assignedRecordedAt===PSP_TEST_NOW&&p.assignedSequence!>active.sequence)).toBe(true);
 const forged=structuredClone(getStore());delete forged.psp.assignments.find(a=>a.enrollmentId===enrollment)!.assignedSequence;
 expect(()=>validatePspState(forged.psp)).toThrow();
});

it('cancels only after service loss with explicit durable reason and receipt replay',()=>{
 const id='PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10';
 const before=structuredClone(getStore());
 expect(()=>cancelProjectAssignment(id,'退出项目',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'early',actorId:'case-manager-chen',role:'case_manager'})).toThrow();
 expect(getStore()).toEqual(before);
 recordPermission('ENR-01','service','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'withdraw',actorId:'P-A',role:'patient'});
 const m={seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'cancel',actorId:'case-manager-chen',role:'case_manager' as const};
 const result=cancelProjectAssignment(id,'服务授权撤回',m);
 expect(getStore().psp.assignmentCancellations).toMatchObject([{assignmentId:id,reason:'服务授权撤回'}]);
 const snapshot=structuredClone(getStore());expect(cancelProjectAssignment(id,'服务授权撤回',m)).toEqual(result);expect(getStore()).toEqual(snapshot);
});

it('rejects forged questionnaire copies and copied alert links at validation boundary',()=>{
 submitProjectPro(body(),meta('first'));
 const valid=structuredClone(getStore());
 for(const tamper of [
  (s:typeof valid)=>{s.psp.questionnaireEvidence![0].stopIntent=false;},
  (s:typeof valid)=>{s.psp.questionnaireEvidence![0].alerts[0].kind='adherence';},
  (s:typeof valid)=>{s.psp.questionnaireEvidence![0].responseId='missing';},
  (s:typeof valid)=>{s.psp.questionnaireEvidence![0].id=s.psp.membershipEvents[0].id;},
 ]){const state=structuredClone(valid);tamper(state);expect(()=>validatePspMetricEvidenceLinks(state)).toThrow();}
});

it('persists and freezes exact copies, and rejects a same-patient response outside this plan chain',async()=>{
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence');
 submitProjectPro(body(),meta('first'));
 const saved=await decodeDemoStore(await encodeDemoStore(getStore()));
 expect(saved.psp.questionnaireEvidence).toEqual(getStore().psp.questionnaireEvidence);
 expect(Object.isFrozen(saved.psp.questionnaireEvidence![0])).toBe(true);
 expect(Object.isFrozen(saved.psp.questionnaireEvidence![0].alerts[0])).toBe(true);
 const forged=structuredClone(getStore());
 const current=forged.psp.questionnaireEvidence![0],pro=forged.patients.get('P-A')!.pro.find(p=>p.id===current.responseId)!;
 const orphan={...pro,id:'orphan-pro'};forged.patients.get('P-A')!.pro.push(orphan);
 current.responseId=orphan.id;current.alerts=[];
 expect(()=>validatePspMetricEvidenceLinks(forged)).toThrow();
});

it('round-trips cancellation evidence in schema 2 and rejects forged active cancellation',async()=>{
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence');
 const id='PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10';
 recordPermission('ENR-01','service','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'withdraw',actorId:'P-A',role:'patient'});
 cancelProjectAssignment(id,'授权已撤回',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'cancel',actorId:'case-manager-chen',role:'case_manager'});
 const bytes=await encodeDemoStore(getStore()),restored=await decodeDemoStore(bytes);
 expect(restored.psp.assignmentCancellations).toEqual(getStore().psp.assignmentCancellations);
 expect(Object.isFrozen(restored.psp.assignmentCancellations![0])).toBe(true);
 const forged=structuredClone(getStore());forged.psp.assignmentCancellations![0].sequence=1;
 await expect(encodeDemoStore(forged)).rejects.toThrow();
});

it('keeps old schema-2 states readable without manufacturing optional evidence',async()=>{
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence');
 const old=structuredClone(getStore());
 old.psp.assignments.find(a=>a.id===assignmentId)!.status='cancelled';
 const restored=await decodeDemoStore(await encodeDemoStore(old));
 expect(restored.psp.questionnaireEvidence).toBeUndefined();
 expect(restored.psp.assignmentCancellations).toBeUndefined();
 expect(restored.psp.assignments.find(a=>a.id===assignmentId)!.status).toBe('cancelled');
});

it('keeps pre-extension dynamic activation plans readable while leaving birth unknown',async()=>{
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence');
 const m=(clientRequestId:string,expectedVersion:number,actorId:string,role:'patient'|'doctor'|'case_manager')=>({seedVersion:getStore().seedVersion,expectedVersion,clientRequestId,actorId,role});
 recordPermission('ENR-19','service','grant',m('grant',1,'P-0040','patient'));
 recordEnrollmentState('ENR-19',{state:'invited',reason:'确认',eligibilityConfirmed:true},m('confirm',2,'doctor-zhang','doctor'));
 recordEnrollmentState('ENR-19',{state:'active',reason:'加入'},m('activate',3,'case-manager-chen','case_manager'));
 const old=structuredClone(getStore());
 for(const a of old.psp.assignments.filter(a=>a.enrollmentId==='ENR-19')){delete a.assignedSequence;delete a.assignedRecordedAt;}
 const restored=await decodeDemoStore(await encodeDemoStore(old));
 expect(restored.psp.assignments.filter(a=>a.enrollmentId==='ENR-19').every(a=>a.assignedSequence===undefined)).toBe(true);
});
