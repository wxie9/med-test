import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {recordPermission} from '@/lib/psp/permissions';
import type {CommandMeta} from '@/lib/psp/types';
const id='PSP-BC-ENDO-001:ENR-01:EDUCATION:2026-10',contentId='EDU-SYNTHETIC-001';
const assignment=()=>getStore().psp.assignments.find(a=>a.id===id)!;
const meta=(request:string,patient=false):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:assignment().version,clientRequestId:request,role:patient?'patient':'case_manager',actorId:patient?'P-A':'case-manager-chen'});
import * as educationApi from '@/lib/psp/education';
const education=async()=>educationApi;
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{vi.restoreAllMocks();delete process.env.DEMO_FIXED_NOW;});
it('sends one immutable approved version without opening and preserves prior seed results',async()=>{
 const api=await education(),before=structuredClone(getStore()),r=api.sendEducation(id,contentId,meta('send'));
 expect(r.data).toMatchObject({contentVersionId:contentId,sentAt:PSP_TEST_NOW,openedAt:null,feedbackAt:null,understood:null,needsHelp:null});
 expect(getStore().psp.educationEvents).toHaveLength(1);expect(getStore().messages).toHaveLength(before.messages.length+1);expect(getStore().psp.educationResults.slice(0,10)).toEqual(before.psp.educationResults);expect(getStore().psp.authorizationVersion).toBe(before.psp.authorizationVersion);
 const saved=structuredClone(getStore()),view=api.getPatientEducationView(id,'patient','P-A');expect(view.canOpen).toBe(true);expect(view.canFeedback).toBe(false);expect(getStore()).toEqual(saved);
 const repeat=api.sendEducation(id,contentId,meta('again'));expect(repeat.data).toEqual(r.data);expect(repeat.objectVersion).toBe(r.objectVersion);expect(getStore().psp.educationEvents).toHaveLength(1);expect(getStore().messages).toEqual(saved.messages);
});
it('requires explicit opening, retains first opening, and feedback creates one future contact plan',async()=>{
 const api=await education();api.sendEducation(id,contentId,meta('send'));
 expect(()=>api.recordEducationFeedback(id,{understood:false,needsHelp:true},meta('early',true))).toThrow(/阅读|打开/);
 const opened=api.recordEducationOpened(id,meta('open',true));expect(opened.data.openedAt).toBe(PSP_TEST_NOW);expect(opened.data.feedbackAt).toBeNull();
 const repeat=api.recordEducationOpened(id,meta('again',true));expect(repeat.data).toEqual(opened.data);expect(repeat.objectVersion).toBe(opened.objectVersion);
 const metadata=meta('feedback',true),before=structuredClone(getStore()),result=api.recordEducationFeedback(id,{understood:false,needsHelp:true},metadata),saved=structuredClone(getStore());
 expect(assignment().status).toBe('completed');expect(getStore().psp.educationEvents).toHaveLength(3);expect(getStore().tasks).toEqual(before.tasks);
 const plan=getStore().psp.assignments.find(a=>a.id===getStore().psp.educationEvents!.at(-1)!.followupAssignmentId)!;expect(plan).toMatchObject({kind:'contact',status:'open',dueAt:'2026-10-14T02:00:00.000Z'});
 expect(api.recordEducationFeedback(id,{understood:false,needsHelp:true},metadata)).toEqual(result);expect(getStore()).toEqual(saved);
 expect(api.recordEducationFeedback(id,{understood:false,needsHelp:true},meta('repeat',true)).data).toEqual(result.data);expect(getStore().psp.educationEvents).toHaveLength(3);
 expect(()=>api.recordEducationFeedback(id,{understood:true,needsHelp:false},meta('change',true))).toThrow(/反馈/);
});
it('enforces sender/patient roles, bound approved content, CAS and service authorization; replay remains exact after withdrawal',async()=>{
 const api=await education(),before=structuredClone(getStore());
 expect(()=>api.sendEducation(id,contentId,meta('patient',true))).toThrow();expect(()=>api.sendEducation(id,'missing',meta('missing'))).toThrow();expect(()=>api.recordEducationOpened(id,{...meta('foreign',true),actorId:'P-0002'})).toThrow();expect(()=>api.recordEducationOpened(id,meta('unsent',true))).toThrow();expect(getStore()).toEqual(before);
 const metadata=meta('send'),sent=api.sendEducation(id,contentId,metadata);
 recordPermission('ENR-01','service','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'withdraw',role:'patient',actorId:'P-A'});
 expect(api.sendEducation(id,contentId,metadata)).toEqual(sent);expect(()=>api.recordEducationOpened(id,meta('disabled',true))).toThrow(/授权|成员/);
 const saved=structuredClone(getStore()),view=api.getPatientEducationView(id,'patient','P-A');expect(view.content?.id).toBe(contentId);expect(view.canOpen).toBe(false);expect(view.canFeedback).toBe(false);expect(getStore()).toEqual(saved);
});
it('rejects missing, cross-patient, unordered and partial education evidence at persistence boundaries',async()=>{
 const api=await education();api.sendEducation(id,contentId,meta('send'));api.recordEducationOpened(id,meta('open',true));api.recordEducationFeedback(id,{understood:true,needsHelp:true},meta('feedback',true));
 const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence'),valid=structuredClone(getStore());
 const corruptions=[(s:typeof valid)=>{s.psp.educationEvents!.splice(1,1);},(s:typeof valid)=>{s.psp.educationEvents!.at(-1)!.actorId='P-0002';},(s:typeof valid)=>{s.psp.educationEvents!.at(-1)!.followupAssignmentId='missing';},(s:typeof valid)=>{s.psp.educationResults.at(-1)!.understood=false;},(s:typeof valid)=>{s.psp.educationResults.push({...s.psp.educationResults.at(-1)!});},(s:typeof valid)=>{s.psp.educationEvents!.at(-1)!.contentVersionId='missing';}];
 for(const corrupt of corruptions){const s=structuredClone(valid);corrupt(s);await expect(encodeDemoStore(s).then(()=>undefined)).rejects.toThrow();const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify({version:2,store:{...s,patients:[...s.patients.values()]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());await expect(decodeDemoStore(bytes)).rejects.toThrow();}
 expect((await decodeDemoStore(await encodeDemoStore(valid))).psp.educationResults).toEqual(valid.psp.educationResults);
},15000);
it('marks sent seed education as background without creating live stage evidence',async()=>{
 const api=await education(),result=getStore().psp.educationResults[0],assignment=getStore().psp.assignments.find(a=>a.id===result.assignmentId)!,owner=getStore().psp.enrollments.find(e=>e.id===assignment.enrollmentId)!.patientId,before=structuredClone(getStore());
 expect(api.getPatientEducationView(result.assignmentId,'patient',owner).background).toBe(true);expect(api.getPatientEducationView(id,'patient','P-A').background).toBe(false);expect(getStore()).toEqual(before);
});
it('rejects content rebinding, premature approval, paused plans and future-help beyond project end atomically',async()=>{
 const api=await education(),content=getStore().psp.educationContents[0];getStore().psp.educationContents.push({...content,id:'future-approved',approvedAt:'2026-11-01T00:00:00.000Z'});const before=structuredClone(getStore());expect(()=>api.sendEducation(id,'future-approved',meta('future'))).toThrow(/批准/);expect(getStore()).toEqual(before);
 assignment().status='paused';expect(()=>api.sendEducation(id,contentId,meta('paused'))).toThrow(/计划/);assignment().status='open';api.sendEducation(id,contentId,meta('send'));expect(()=>api.sendEducation(id,'future-approved',meta('rebind'))).toThrow(/版本/);api.recordEducationOpened(id,meta('open',true));
 process.env.DEMO_FIXED_NOW='2026-12-31T04:00:00.000Z';const saved=structuredClone(getStore());expect(()=>api.recordEducationFeedback(id,{understood:false,needsHelp:true},meta('beyond-project',true))).toThrow(/未来|项目/);expect(getStore()).toEqual(saved);
});
it('returns exact captured education feedback after withdrawal and ignores aggregate authorization for care',async()=>{
 const api=await education();recordPermission('ENR-01','aggregate','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'aggregate',role:'patient',actorId:'P-A'});api.sendEducation(id,contentId,meta('send'));api.recordEducationOpened(id,meta('open',true));const metadata=meta('feedback',true),feedback=api.recordEducationFeedback(id,{understood:true,needsHelp:false},metadata);expect(getStore().psp.educationEvents!.at(-1)!.followupAssignmentId).toBeUndefined();
 recordPermission('ENR-01','service','withdraw',{seedVersion:getStore().seedVersion,expectedVersion:2,clientRequestId:'withdraw',role:'patient',actorId:'P-A'});const before=structuredClone(getStore());expect(api.recordEducationFeedback(id,{understood:true,needsHelp:false},metadata)).toEqual(feedback);expect(getStore()).toEqual(before);expect(()=>api.recordEducationFeedback(id,{understood:true,needsHelp:false},meta('fresh',true))).toThrow(/授权|成员/);
});
it('rejects persisted education stages when historical service consent did not yet cover the stage',async()=>{
 const api=await education();api.sendEducation(id,contentId,meta('send'));
 const {encodeDemoStore}=await import('@/lib/state/persistence'),s=structuredClone(getStore()),grant=s.psp.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;grant.occurredAt='2026-10-14T02:00:00.000Z';grant.recordedAt=grant.occurredAt;
 await expect(encodeDemoStore(s).then(()=>undefined)).rejects.toThrow(/授权|authorization/);
});

it('replays exact send and open receipts after feedback and persistence recovery',async()=>{
 const api=await education(),sendMeta=meta('snapshot-send'),sent=api.sendEducation(id,contentId,sendMeta);
 const sendNoopMeta=meta('snapshot-send-noop'),sentNoop=api.sendEducation(id,contentId,sendNoopMeta);
 process.env.DEMO_FIXED_NOW='2026-10-13T03:00:00.000Z';
 const openMeta=meta('snapshot-open',true),opened=api.recordEducationOpened(id,openMeta);
 const openNoopMeta=meta('snapshot-open-noop',true),openedNoop=api.recordEducationOpened(id,openNoopMeta);
 expect(api.sendEducation(id,contentId,sendMeta)).toEqual(sent);
 process.env.DEMO_FIXED_NOW='2026-10-13T04:00:00.000Z';
 api.recordEducationFeedback(id,{understood:false,needsHelp:true},meta('snapshot-feedback',true));
 const verify=()=>{
  expect(api.sendEducation(id,contentId,sendMeta)).toEqual(sent);
  expect(api.sendEducation(id,contentId,sendNoopMeta)).toEqual(sentNoop);
  expect(api.recordEducationOpened(id,openMeta)).toEqual(opened);
  expect(api.recordEducationOpened(id,openNoopMeta)).toEqual(openedNoop);
 };
 verify();const {encodeDemoStore,decodeDemoStore}=await import('@/lib/state/persistence');
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(getStore())));verify();
});
