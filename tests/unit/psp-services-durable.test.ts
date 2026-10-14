import {beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore,replaceStore,type DemoStore} from '@/lib/state/store';
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
import {createDurableRequest} from '@/lib/state/durableRequest';
import {pspResponse} from '@/lib/psp/http';
import {submitProjectPro} from '@/lib/psp/commands';
import {recordInteraction,actOnProjectAlert} from '@/lib/psp/contact';
import {sendEducation,recordEducationOpened,recordEducationFeedback} from '@/lib/psp/education';
const prefix='PSP-BC-ENDO-001:ENR-01',contactId=`${prefix}:CONTACT:2026-10`,educationId=`${prefix}:EDUCATION:2026-10`;
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
it.each([['contact','before'],['contact','after'],['feedback','before'],['feedback','after'],['doctor','before'],['doctor','after']] as const)('persists and replays %s exactly once after a %s-put failure',async(kind,failure)=>{
 const first=submitProjectPro({assignmentId:`${prefix}:PRO:2026-10`,patientId:'P-A',scaleId:'endocrine_monthly_v1',items:{关节痛:3,潮热:1,情绪:1,睡眠:1},flags:{stopIntent:true,missedDoses14d:4}},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'pro',actorId:'P-A',role:'patient'});
 const version=(id:string)=>getStore().psp.assignments.find(a=>a.id===id)!.version;
 if(kind==='feedback') {
  sendEducation(educationId,getStore().psp.educationContents[0].id,{seedVersion:getStore().seedVersion,expectedVersion:version(educationId),clientRequestId:'send',actorId:'case-manager-chen',role:'case_manager'});
  recordEducationOpened(educationId,{seedVersion:getStore().seedVersion,expectedVersion:version(educationId),clientRequestId:'open',actorId:'P-A',role:'patient'});
 }
 const alertId=first.data.alertIds[0];
 if(kind==='doctor') {
  const call=recordInteraction({enrollmentId:'ENR-01',alertIds:first.data.alertIds,channel:'phone',outcome:'reached'},{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'doctor-call',actorId:'case-manager-chen',role:'case_manager'});
  const action=(body:Parameters<typeof actOnProjectAlert>[1],request:string)=>actOnProjectAlert(alertId,body,{seedVersion:getStore().seedVersion,expectedVersion:getStore().alerts.find(a=>a.id===alertId)!.version??1,clientRequestId:request,actorId:'case-manager-chen',role:'case_manager'});
  action({action:'accept'},'doctor-accept');action({action:'start'},'doctor-start');
  action({action:'submit_review',disposition:{category:'support',summary:'已记录支持需求',interactionIds:[call.data.interactionId]}},'doctor-disposition');
 }
 const before=structuredClone(getStore()),authVersion=before.psp.authorizationVersion;
 const meta={seedVersion:before.seedVersion,expectedVersion:kind==='doctor'?(getStore().alerts.find(a=>a.id===alertId)!.version??1):version(kind==='contact'?contactId:educationId),clientRequestId:`durable-${kind}-${failure}`,actorId:kind==='doctor'?'doctor-zhang':kind==='contact'?'case-manager-chen':'P-A',role:kind==='doctor'?'doctor' as const:kind==='contact'?'case_manager' as const:'patient' as const};
 const write=()=>kind==='contact'?recordInteraction({enrollmentId:'ENR-01',assignmentId:contactId,alertIds:first.data.alertIds,channel:'phone',outcome:'reached'},meta):kind==='doctor'?actOnProjectAlert(alertId,{action:'close',note:'已复核，安排未来复评',followupTask:{type:'复评',owner:'张医生',dueAt:'2026-10-15T17:30:00+08:00'}},meta):recordEducationFeedback(educationId,{understood:false,needsHelp:true},meta);
 let saved=await encodeDemoStore(before),fails=true;
 const run=createDurableRequest<DemoStore,[]>({read:async()=>saved,write:async data=>{if(fails&&failure==='before')throw Error('storage fail');saved=data;if(fails)throw Error('unknown outcome');},getState:getStore,setState:value=>{if(value)replaceStore(value);},encode:encodeDemoStore,decode:decodeDemoStore,handle:()=>pspResponse(write)});
 expect((await run()).status).toBe(503);
 if(failure==='before')expect(getStore()).toEqual(before);
 fails=false;const response=await run();expect(response.status).toBe(200);const receipt=await response.json(),committed=structuredClone(getStore());
 expect(getStore().psp.authorizationVersion).toBe(authVersion);
 if(kind!=='doctor'){expect(getStore().alerts).toEqual(before.alerts);expect(getStore().tasks).toEqual(before.tasks);}
 if(kind==='contact') {
  expect(getStore().psp.serviceEvents).toHaveLength(before.psp.serviceEvents.length+1);
  expect(getStore().psp.serviceEvents.at(-1)!.alertIds).toEqual(first.data.alertIds);
 }else if(kind==='feedback') {
  expect(getStore().psp.educationEvents).toHaveLength(before.psp.educationEvents!.length+1);
  expect(getStore().psp.assignments).toHaveLength(before.psp.assignments.length+1);
  expect(getStore().psp.educationResults.find(r=>r.assignmentId===educationId)).toMatchObject({understood:false,needsHelp:true,feedbackAt:PSP_TEST_NOW});
 }else {
  const event=getStore().psp.alertActions!.at(-1)!;
  expect(event).toMatchObject({action:'close',alertId,actorId:'doctor-zhang',note:'已复核，安排未来复评'});
  expect(getStore().psp.alertActions).toHaveLength(before.psp.alertActions!.length+1);
  expect(getStore().alerts.find(a=>a.id===alertId)).toMatchObject({status:'closed'});
  expect(getStore().tasks).toHaveLength(before.tasks.length+1);expect(getStore().tasks.find(t=>t.id===event.followupTaskId)).toMatchObject({status:'open',due:'2026-10-15'});
  expect(getStore().psp.assignments).toHaveLength(before.psp.assignments.length+1);expect(getStore().psp.assignments.find(a=>a.id===event.followupAssignmentId)).toMatchObject({status:'open',dueAt:'2026-10-15T09:30:00.000Z'});
  expect(getStore().messages).toHaveLength(before.messages.length+1);
 }
 expect(await (await run()).json()).toEqual(receipt);expect(getStore()).toEqual(committed);
 expect(await decodeDemoStore(saved)).toEqual(committed);
// This exercises repeated real gzip/restore of the full synthetic cohort, not a latency SLA.
},15000);
