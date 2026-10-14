import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore,replaceStore,type DemoStore} from '@/lib/state/store';
import {createDurableRequest} from '@/lib/state/durableRequest';
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
import {pspResponse} from '@/lib/psp/http';
import {importLegacySelfReports,submitProjectAdherence} from '@/lib/psp/selfReport';
import {proposeCorrection,verifyCorrection} from '@/lib/psp/corrections';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it.each([['first','before'],['first','after'],['revision','before'],['revision','after'],['verify','before'],['verify','after']] as const)('recovers and exactly replays %s across a %s-put failure',async(kind,failure)=>{
 const version=()=>getStore().psp.enrollments.find(e=>e.id==='ENR-01')!.version;
 const meta=(request:string,role:'patient'|'case_manager'|'data_reviewer',expected=version())=>({seedVersion:getStore().seedVersion,expectedVersion:expected,clientRequestId:request,role,actorId:role==='patient'?'P-A':role==='case_manager'?'case-manager-chen':'data-reviewer-psp'});
 importLegacySelfReports('ENR-01',meta('import','case_manager'));
 let revisionOf:string|undefined,correctionId:string|undefined;
 if(kind==='revision')revisionOf=submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},meta('first','patient')).data.sourceId;
 if(kind==='verify'){
  const contact=getStore().psp.serviceEvents.find(e=>e.enrollmentId==='ENR-01')!;
  correctionId=proposeCorrection({sourceRef:{kind:'contact',id:contact.id},correctedValue:{kind:'contact',channel:'phone',outcome:'reached'},reason:'补录合成联系结果',occurredAt:contact.occurredAt},meta('propose','case_manager')).data.id;
 }
 const before=structuredClone(getStore()),metadata=meta(`durable-${kind}-${failure}`,kind==='verify'?'data_reviewer':'patient',kind==='verify'?1:version());
 const write=()=>kind==='verify'?verifyCorrection(correctionId!,metadata):submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:kind==='revision'?0:1,...(revisionOf?{revisionOf,reason:'忘记'}:{})},metadata);
 let saved=await encodeDemoStore(before),fails=true;
 const run=createDurableRequest<DemoStore,[]>({read:async()=>saved,write:async data=>{if(fails&&failure==='before')throw Error('definite storage failure');saved=data;if(fails)throw Error('unknown storage outcome');},getState:getStore,setState:s=>{if(s)replaceStore(s);},encode:encodeDemoStore,decode:decodeDemoStore,handle:()=>pspResponse(write)});
 expect((await run()).status).toBe(503);if(failure==='before')expect(getStore()).toEqual(before);
 fails=false;const response=await run();expect(response.status).toBe(200);const receipt=await response.json(),committed=structuredClone(getStore());
 expect(getStore().psp.authorizationVersion).toBe(before.psp.authorizationVersion);
 expect(getStore().psp.serviceEvents).toEqual(before.psp.serviceEvents);expect(getStore().psp.alertActions).toEqual(before.psp.alertActions);expect(getStore().psp.assignments).toEqual(before.psp.assignments);expect(getStore().alerts).toEqual(before.alerts);expect(getStore().tasks).toEqual(before.tasks);expect(getStore().messages).toEqual(before.messages);
 if(kind==='verify'){
  expect(getStore().psp.corrections?.[0]).toMatchObject({id:correctionId,status:'verified',version:2,verifiedBy:'data-reviewer-psp'});
  expect(getStore().patients).toEqual(before.patients);expect(getStore().psp.selfReportRevisions).toEqual(before.psp.selfReportRevisions);
 }else{
  expect(getStore().psp.selfReportRevisions).toHaveLength(before.psp.selfReportRevisions!.length+1);
  expect(getStore().psp.selfReportRevisions!.slice(0,-1)).toEqual(before.psp.selfReportRevisions);
  expect(getStore().patients.get('P-A')!.adherence.find(r=>r.date==='2026-10-13')).toMatchObject({due:1,taken:kind==='revision'?0:1});
 }
 expect(await (await run()).json()).toEqual(receipt);expect(getStore()).toEqual(committed);expect(await decodeDemoStore(saved)).toEqual(committed);
},15000);
