import {beforeEach,afterEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {createReportDraft} from '@/lib/psp/reports';
import * as route from '@/app/api/psp/reports/[reportVersionId]/actions/route';
const meta=(id:string,expectedVersion:number,kind?:'data'|'medical')=>({seedVersion:getStore().seedVersion,clientRequestId:id,expectedVersion,role:kind?`${kind}_reviewer`:'project_manager',actorId:kind?`${kind}-reviewer-psp`:'project-manager-psp'});
function setup(){const s=freezePspSnapshot('PSP-BC-ENDO-001',{periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW},meta('freeze',getStore().psp.ledgerRevision) as never).data;return createReportDraft(s.id,{nextActions:[]},meta('create',getStore().psp.ledgerRevision) as never).data;}
const call=(id:string,body:unknown,query='')=>route.POST(new Request(`http://localhost/api/psp/reports/${id}/actions${query}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({reportVersionId:id})});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it('routes submit and ordered concurrent review CAS with no-store',async()=>{
 const r=setup();const submit=await call(r.id,{action:'submit',meta:meta('submit',1)});expect(submit.status).toBe(200);expect(submit.headers.get('Cache-Control')).toBe('no-store');expect((await submit.json()).objectVersion).toBe(2);
 const [a,b]=await Promise.all([call(r.id,{action:'review',kind:'data',decision:'approve',meta:meta('data',2,'data')}),call(r.id,{action:'review',kind:'medical',decision:'approve',meta:meta('medical',2,'medical')})]);expect([a.status,b.status]).toEqual([200,409]);
 const final=await call(r.id,{action:'review',kind:'medical',decision:'approve',meta:meta('medical',3,'medical')});expect(final.status).toBe(200);expect((await final.json()).data.status).toBe('approved');
});
it('routes return/revise and enforces distinct ledger CAS',async()=>{
 const r=setup();await call(r.id,{action:'submit',meta:meta('submit',1)});await call(r.id,{action:'review',kind:'data',decision:'return',reason:'  补充服务安排 ',meta:meta('return',2,'data')});
 expect((await call(r.id,{action:'revise',nextActions:[],meta:meta('stale',3)})).status).toBe(409);
 const revised=await call(r.id,{action:'revise',nextActions:[],meta:meta('revise',getStore().psp.ledgerRevision)});expect(revised.status).toBe(200);expect((await revised.json()).data).toMatchObject({status:'draft',version:1,revision:2});
});
it('rejects malformed unions/JSON/query and wrong actor/seed/state without mutations',async()=>{
 const r=setup(),before=getStore().psp.ledgerRevision;
 for(const body of [{action:'deliver',meta:meta('x',1)},{action:'submit',status:'approved',meta:meta('x',1)},{action:'review',kind:'data',decision:'return',reason:'  ',meta:meta('x',1,'data')},{action:'review',kind:'data',decision:'approve',reason:'extra',meta:meta('x',1,'data')},{action:'revise',nextActions:[],parentVersionId:'fake',meta:meta('x',before)}]){const response=await call(r.id,body);expect(response.status).toBe(400);expect(response.headers.get('Cache-Control')).toBe('no-store');}
 expect((await call(r.id,{action:'submit',meta:meta('x',1)},'?x=1')).status).toBe(400);
 expect((await call(r.id,{action:'submit',meta:meta('x',1,'data')})).status).toBe(403);
 expect((await call(r.id,{action:'submit',meta:{...meta('x',1),seedVersion:getStore().seedVersion+1}})).status).toBe(409);
 expect((await call('missing',{action:'submit',meta:meta('x',1)})).status).toBe(404);
 expect((await call(r.id,{action:'review',kind:'data',decision:'approve',meta:meta('x',1,'data')})).status).toBe(409);
 const malformed=await route.POST(new Request(`http://localhost/api/psp/reports/${r.id}/actions`,{method:'POST',body:'{'}),{params:Promise.resolve({reportVersionId:r.id})});expect(malformed.status).toBe(400);expect(malformed.headers.get('Cache-Control')).toBe('no-store');expect(getStore().psp.ledgerRevision).toBe(before);
});
