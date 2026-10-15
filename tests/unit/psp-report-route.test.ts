import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {GET as list,POST as create} from '@/app/api/psp/projects/[projectId]/reports/route';
import {GET as detail} from '@/app/api/psp/reports/[reportVersionId]/route';
const projectId='PSP-BC-ENDO-001',context={params:Promise.resolve({projectId})};
const path=`http://localhost/api/psp/projects/${projectId}/reports`;
const identity='role=project_manager&actorId=project-manager-psp';
const meta=(id:string)=>({seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.ledgerRevision,clientRequestId:id,role:'project_manager' as const,actorId:'project-manager-psp'});
const input=()=>({snapshotId:freezePspSnapshot(projectId,{periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW},meta('freeze')).data.id,nextActions:[],meta:meta('create')});
const request=(body:unknown,url=path)=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it('creates, lists and reads draft DTO with strict no-store responses and exact HTTP replay',async()=>{
 const body=input(),created=await create(request(body),context);expect(created.status).toBe(200);expect(created.headers.get('Cache-Control')).toBe('no-store');const result=await created.json();
 const replay=await create(request(body),context);expect(await replay.json()).toEqual(result);
 const listed=await list(new Request(`${path}?${identity}`),context);expect(listed.status).toBe(200);expect((await listed.json()).summaries).toHaveLength(1);
 const read=await detail(new Request(`http://localhost/api/psp/reports/${result.data.id}?${identity}&seedVersion=${result.seedVersion}`),{params:Promise.resolve({reportVersionId:result.data.id})});const data=await read.json();expect(read.status).toBe(200);expect(data.report.content.chapters).toHaveLength(7);expect(data).not.toHaveProperty('snapshot');expect(data).not.toHaveProperty('patients');expect(data.workflow.dataReview).toBeNull();expect(data.createGate.canCreate).toBe(true);
});
it('rejects malformed bodies, PHI, unknown query/duplicate fields and disallowed writers with no-store',async()=>{
 const good=input();const cases=[{...good,patientId:'P-A'},{snapshotId:good.snapshotId,meta:good.meta},{...good,nextActions:[{category:'overdue_followup',responsibleRole:'case_manager',dueAt:'2026-10-14T02:00:00Z',status:'planned',note:'姓名'}]},{...good,meta:{...good.meta,role:'data_reviewer',actorId:'data-reviewer-psp'}}];
 for(const [index,body] of cases.entries()){const r=await create(request(body),context);expect(r.status).toBe(index===3?403:400);expect(r.headers.get('Cache-Control')).toBe('no-store');expect((await r.json()).error).toBeTruthy();}
 for(const query of [`${identity}&x=1`,`${identity}&role=project_manager`]){const r=await list(new Request(`${path}?${query}`),context);expect(r.status).toBe(400);expect(r.headers.get('Cache-Control')).toBe('no-store');}
 expect((await create(request(good,`${path}?foo=1`),context)).status).toBe(400);expect(getStore().psp.reportVersions).toBeUndefined();
});
it('enforces detail seed/role and project/ledger identity, with no mutation on failures',async()=>{
 const good=input();expect((await create(request({...good,meta:{...good.meta,expectedVersion:1}}),context)).status).toBe(409);expect((await create(request(good),{params:Promise.resolve({projectId:'other'})})).status).toBe(404);
 const posted=await create(request(good),context),{data}=await posted.json(),ctx={params:Promise.resolve({reportVersionId:data.id})};
 for(const [query,status] of [[identity,400],[`${identity}&seedVersion=${getStore().seedVersion+1}`,409],[`role=patient&actorId=P-A&seedVersion=${getStore().seedVersion}`,403],[`role=pharma_owner&actorId=pharma-owner-a&seedVersion=${getStore().seedVersion}`,403],[`${identity}&seedVersion=${getStore().seedVersion}&seedVersion=${getStore().seedVersion}`,400]] as const){const r=await detail(new Request(`http://localhost/api/psp/reports/${data.id}?${query}`),ctx);expect(r.status).toBe(status);expect(r.headers.get('Cache-Control')).toBe('no-store');}
 expect((await detail(new Request(`http://localhost/api/psp/reports/absent?${identity}&seedVersion=${getStore().seedVersion}`),{params:Promise.resolve({reportVersionId:'absent'})})).status).toBe(404);
});
