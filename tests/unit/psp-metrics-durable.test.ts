import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore,replaceStore,type DemoStore} from '@/lib/state/store';
import {createDurableRequest} from '@/lib/state/durableRequest';
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
import {pspResponse} from '@/lib/psp/http';
import {submitProjectPro} from '@/lib/psp/commands';
import {recordInteraction,actOnProjectAlert} from '@/lib/psp/contact';
import {recordPermission} from '@/lib/psp/permissions';
import {cancelProjectAssignment} from '@/lib/psp/assignmentCancellation';
import {computePspMetrics} from '@/lib/psp/metrics';
import type {CommandMeta} from '@/lib/psp/types';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
const proId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10',contactId='PSP-BC-ENDO-001:ENR-01:CONTACT:2026-10';
const input={assignmentId:proId,patientId:'P-A',scaleId:'endocrine_monthly_v1' as const,items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((s,i)=>[s,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4}};
const meta=(role:CommandMeta['role'],id:string,expectedVersion=1):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion,clientRequestId:id,role,actorId:role==='patient'?'P-A':role==='doctor'?'doctor-zhang':'case-manager-chen'});
it.each([['pro','before'],['pro','after'],['plan','before'],['plan','after'],['cancel','before'],['cancel','after']] as const)('preserves metric facts and old-revision output across %s %s-put recovery',async(kind,failure)=>{
 let alertId:string|undefined;
 if(kind==='plan'){
  const submitted=submitProjectPro(input,meta('patient','prepare-pro'));alertId=submitted.data.alertIds[0];
  const call=recordInteraction({enrollmentId:'ENR-01',assignmentId:contactId,channel:'phone',outcome:'reached',alertIds:submitted.data.alertIds},meta('case_manager','prepare-contact'));
  const version=()=>getStore().alerts.find(a=>a.id===alertId)!.version??1;
  actOnProjectAlert(alertId,{action:'accept'},meta('case_manager','prepare-accept',version()));
  actOnProjectAlert(alertId,{action:'start'},meta('case_manager','prepare-start',version()));
  actOnProjectAlert(alertId,{action:'submit_review',disposition:{category:'support',summary:'合成处置，准备医生复核',interactionIds:[call.data.interactionId]}},meta('case_manager','prepare-disposition',version()));
 }
 if(kind==='cancel')recordPermission('ENR-01','service','withdraw',meta('patient','prepare-withdraw'));
 const before=structuredClone(getStore()),options={projectId:before.psp.project.id,periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW,scope:'internal' as const,ledgerRevision:before.psp.ledgerRevision},oldMetrics=computePspMetrics(before.psp,options);
 const metadata=meta(kind==='plan'?'doctor':kind==='cancel'?'case_manager':'patient',`durable-${kind}-${failure}`,kind==='plan'?(getStore().alerts.find(a=>a.id===alertId)!.version??1):1);
 const write=()=>kind==='pro'?submitProjectPro(input,metadata):kind==='plan'?actOnProjectAlert(alertId!,{action:'close',note:'合成复核，不完成未来任务',followupTask:{type:'复评',owner:'张医生',dueAt:'2026-10-15T17:30:00+08:00'}},metadata):cancelProjectAssignment(contactId,'服务已撤回，逾期责任保留',metadata);
 let saved=await encodeDemoStore(before),fails=true;
 const run=createDurableRequest<DemoStore,[]>({read:async()=>saved,write:async data=>{if(fails&&failure==='before')throw Error('definite storage failure');saved=data;if(fails)throw Error('unknown storage outcome');},getState:getStore,setState:s=>{if(s)replaceStore(s);},encode:encodeDemoStore,decode:decodeDemoStore,handle:()=>pspResponse(write)});
 expect((await run()).status).toBe(503);if(failure==='before')expect(getStore()).toEqual(before);
 fails=false;const r=await run();expect(r.status).toBe(200);const receipt=await r.json(),committed=structuredClone(getStore());
 expect(computePspMetrics(getStore().psp,options)).toEqual(oldMetrics);
 if(kind==='pro'){expect(getStore().psp.questionnaireEvidence).toHaveLength(1);expect(getStore().psp.questionnaireEvidence![0]).toMatchObject({responseId:receipt.data.proId,stopIntent:true});expect(getStore().patients.get('P-A')!.pro).toHaveLength(before.patients.get('P-A')!.pro.length+1);expect(getStore().alerts).toHaveLength(before.alerts.length+2);}
 if(kind==='plan'){const future=getStore().psp.assignments.filter(a=>a.id===`PSP:REVIEW:${alertId}`);expect(future).toHaveLength(1);expect(future[0].assignedSequence).toBeDefined();expect(getStore().tasks).toHaveLength(before.tasks.length+1);expect(getStore().tasks.at(-1)?.status).toBe('open');}
 if(kind==='cancel'){expect(getStore().psp.assignmentCancellations).toHaveLength(1);expect(getStore().psp.serviceEvents).toEqual(before.psp.serviceEvents);expect(getStore().psp.assignments.find(a=>a.id===contactId)?.status).toBe('cancelled');expect(computePspMetrics(getStore().psp,{...options,ledgerRevision:getStore().psp.ledgerRevision}).find(m=>m.key==='contact_completion')?.denominator).toBe(18);}
 expect(getStore().psp.authorizationVersion).toBe(before.psp.authorizationVersion);
 expect(await(await run()).json()).toEqual(receipt);expect(getStore()).toEqual(committed);const restored=await decodeDemoStore(saved);expect(restored).toEqual(committed);expect(computePspMetrics(restored.psp,{...options,ledgerRevision:restored.psp.ledgerRevision})).toEqual(computePspMetrics(committed.psp,{...options,ledgerRevision:committed.psp.ledgerRevision}));
},15000);
