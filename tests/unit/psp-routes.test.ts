import { beforeEach, expect, it } from 'vitest';
import { buildPspTestStore,installPspTestStore,PSP_TEST_NOW } from '../helpers/psp';
import { GET as pharma } from '@/app/api/pharma/projects/route';
import { GET as internal } from '@/app/api/psp/projects/[projectId]/route';
import { GET as patient } from '@/app/api/psp/patients/[patientId]/projects/route';
import { POST as permission } from '@/app/api/psp/enrollments/[id]/permissions/route';
import { getStore } from '@/lib/state/store';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
const params=(id:string)=>({params:Promise.resolve({id})});
it('pharma API exposes only aggregate allowlist',async()=>{
 const response=await pharma(new Request('http://test/api/pharma/projects'));
 const body=await response.json();expect(body.projects[0].allowedMembers.value).toBe(14);
 const text=JSON.stringify(body);
 for(const forbidden of ['patientId','displayName','enrollment','permissionHistory','counts','P-A','sourceRefs']) expect(text).not.toContain(forbidden);
});
it('protects internal and own-patient DTOs with explicit simulated identities',async()=>{
 const ctx={params:Promise.resolve({projectId:'PSP-BC-ENDO-001'})};
 expect((await internal(new Request('http://test'),ctx)).status).toBe(403);
 expect((await internal(new Request('http://test?role=pharma_owner&actorId=pharma-owner-a'),ctx)).status).toBe(403);
 const ok=await internal(new Request('http://test?role=case_manager&actorId=case-manager-chen'),ctx);
 expect((await ok.json()).counts).toEqual({candidates:20,activeService:18,aggregateAllowed:14});
 const own={params:Promise.resolve({patientId:'P-A'})};
 expect((await patient(new Request('http://test?role=patient&actorId=P-0040'),own)).status).toBe(403);
 const data=await (await patient(new Request('http://test?role=patient&actorId=P-A'),own)).json();
 expect(data.projects).toHaveLength(1);expect(data.projects[0].assignments).toHaveLength(3);
 expect(JSON.stringify(data)).not.toContain('P-0002');
});
it('rejects malformed writes and stale versions, returns replayed command result',async()=>{
 const write=(body:unknown)=>permission(new Request('http://test',{method:'POST',body:JSON.stringify(body)}),params('ENR-01'));
 expect((await permission(new Request('http://test',{method:'POST',body:'{'}),params('ENR-01'))).status).toBe(400);
 const body={scope:'aggregate',action:'withdraw',meta:{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'route',actorId:'P-A',role:'patient'}};
 expect((await write({...body,occurredAt:PSP_TEST_NOW})).status).toBe(400);
 const first=await (await write(body)).json();expect(first.objectVersion).toBe(2);
 expect(await (await write(body)).json()).toEqual(first);
 expect((await write({...body,meta:{...body.meta,clientRequestId:'stale'}})).status).toBe(409);
});
