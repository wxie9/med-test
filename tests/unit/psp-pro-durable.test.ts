import { beforeEach, expect, it } from 'vitest';
import { buildPspTestStore, installPspTestStore, PSP_TEST_NOW } from '../helpers/psp';
import { getStore, replaceStore, type DemoStore } from '@/lib/state/store';
import { encodeDemoStore, decodeDemoStore } from '@/lib/state/persistence';
import { createDurableRequest } from '@/lib/state/durableRequest';
import { submitProjectPro } from '@/lib/psp/commands';
import { pspResponse } from '@/lib/psp/http';
const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
it.each(['before','after'] as const)('real project command retries safely after storage fails %s its write',async failure=>{
 const initial=getStore(), originalProCount=initial.patients.get('P-A')!.pro.length;
 let saved=await encodeDemoStore(initial), fail=true;
 const body={patientId:'P-A',scaleId:'endocrine_monthly_v1' as const,items:{关节痛:3,潮热:1,情绪:1,睡眠:1},flags:{stopIntent:true,missedDoses14d:4},meta:{seedVersion:initial.seedVersion,expectedVersion:1,clientRequestId:`durable-${failure}`,actorId:'P-A',role:'patient' as const}};
 const {meta,...input}=body;
 const run=createDurableRequest<DemoStore,[]>( {
   read:async()=>saved,
   write:async value=>{if(fail&&failure==='before')throw Error('storage failed');saved=value;if(fail)throw Error('unknown outcome');},
   getState:getStore,
   setState:state=>{if(state)replaceStore(state);},
   encode:encodeDemoStore,decode:decodeDemoStore,
   handle:()=>pspResponse(()=>submitProjectPro({...input,assignmentId},meta)),
 });
 expect((await run()).status).toBe(503);
 const committed=failure==='after';
 expect(getStore().patients.get('P-A')!.pro.length).toBe(originalProCount+(committed?1:0));
 expect(getStore().alerts.length).toBe(committed?2:0);
 expect(getStore().psp.assignments.find(a=>a.id===assignmentId)!.status).toBe(committed?'completed':'open');
 fail=false;const response=await run();expect(response.status).toBe(200);
 const result=await response.json();expect(result.data.alertIds).toHaveLength(2);
 expect(getStore().patients.get('P-A')!.pro).toHaveLength(originalProCount+1);
 expect(getStore().alerts).toHaveLength(2);expect(getStore().messages).toHaveLength(1);
 const recovered=await decodeDemoStore(saved), plan=recovered.psp.assignments.find(a=>a.id===assignmentId)!;
 expect(plan.latestValidResponseId).toBe(result.data.proId);expect(plan.firstValidSubmittedAt).toBe(PSP_TEST_NOW);
 const again=await run();expect(await again.json()).toEqual(result);
 expect(getStore().patients.get('P-A')!.pro).toHaveLength(originalProCount+1);expect(getStore().alerts).toHaveLength(2);
});
