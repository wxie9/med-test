import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {POST} from '@/app/api/psp/assignments/[assignmentId]/pro/route';
import {POST as generic} from '@/app/api/pro/route';
import {recordPermission} from '@/lib/psp/permissions';
import {SCALE_SYMPTOMS} from '@/lib/pro/scales';
const assignmentId='PSP-BC-ENDO-001:ENR-01:PRO:2026-10';
const body=()=>({patientId:'P-A',scaleId:'endocrine_monthly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.endocrine_monthly_v1.map((s,i)=>[s,i===0?3:1])),flags:{stopIntent:true,missedDoses14d:4},meta:{seedVersion:getStore().seedVersion,expectedVersion:1,clientRequestId:'route-first',actorId:'P-A',role:'patient'}});
const post=(data:unknown,id=assignmentId)=>POST(new Request('http://test/api/psp',{method:'POST',body:JSON.stringify(data)}),{params:Promise.resolve({assignmentId:id})});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{vi.restoreAllMocks();delete process.env.DEMO_FIXED_NOW;});
it('returns a strict project receipt and exact replay before CAS/service withdrawal',async()=>{
 const request=body(),response=await post(request),result=await response.json();expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');expect(result.objectVersion).toBe(2);expect(result.data.onTime).toBe(false);expect(result.data.alertIds).toHaveLength(2);
 recordPermission('ENR-01','service','withdraw',{...request.meta,role:'patient',clientRequestId:'withdraw'});expect(await (await post(request)).json()).toEqual(result);
 expect((await post({...request,meta:{...request.meta,clientRequestId:'new',expectedVersion:2}})).status).toBe(403);
});
it('rejects extra fields, malformed JSON, incomplete/wrong scale items and flags with 400',async()=>{
 const request=body();for(const data of [{...request,assignmentId},{...request,occurredAt:PSP_TEST_NOW},{...request,items:{关节痛:3}},{...request,items:{...request.items,unknown:1}},{...request,flags:{...request.flags,unknown:true}},{...request,flags:{missedDoses14d:15}},{...request,meta:{...request.meta,unknown:true}},{...request,scaleId:'treatment_weekly_v1',items:Object.fromEntries(SCALE_SYMPTOMS.treatment_weekly_v1.map(s=>[s,1])),flags:{}}])expect((await post(data)).status).toBe(400);
 expect((await POST(new Request('http://test',{method:'POST',body:'{'}),{params:Promise.resolve({assignmentId})})).status).toBe(400);
});
it('returns explicit 403/404/409 boundaries and leaves state unchanged',async()=>{
 const request=body(),before=structuredClone(getStore());
 expect((await post(request,'missing')).status).toBe(404);
 for(const data of [{...request,patientId:'P-0002'},{...request,meta:{...request.meta,actorId:'P-0002'}},{...request,meta:{...request.meta,role:'case_manager',actorId:'case-manager-chen'}}])expect((await post(data)).status).toBe(403);
 expect((await post({...request,meta:{...request.meta,expectedVersion:2}})).status).toBe(409);expect((await post({...request,meta:{...request.meta,seedVersion:request.meta.seedVersion+1}})).status).toBe(409);expect(getStore()).toEqual(before);
});
it('supports explicit revision and prevents old revision references and reused body',async()=>{
 const request=body(),first=await (await post(request)).json(),revision={...request,revisionOf:first.data.proId,meta:{...request.meta,expectedVersion:2,clientRequestId:'revision'}};
 const next=await (await post(revision)).json();expect(next.objectVersion).toBe(3);expect(next.data.proId).not.toBe(first.data.proId);expect(await (await post(revision)).json()).toEqual(next);
 expect((await post({...revision,meta:{...revision.meta,expectedVersion:3,clientRequestId:'old'}})).status).toBe(409);
 expect((await post({...request,items:{...request.items,关节痛:0}})).status).toBe(400);
});
it('generic PRO retains validation and feedback and never completes project assignment',async()=>{
 const request=body(),before=structuredClone(getStore().psp),{meta,...input}=request;void meta;
 const response=await generic(new Request('http://test/api/pro',{method:'POST',body:JSON.stringify(input)}));expect(response.status).toBe(200);expect((await response.json()).feedback).toContain('1 个工作日');expect(getStore().psp).toEqual(before);
 expect((await generic(new Request('http://test/api/pro',{method:'POST',body:JSON.stringify({...input,items:{关节痛:3}})}))).status).toBe(400);
});
