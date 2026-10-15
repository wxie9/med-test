import {beforeEach,afterEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {GET as list,POST as freeze} from '@/app/api/psp/projects/[projectId]/snapshots/route';
import {GET as detail} from '@/app/api/psp/snapshots/[snapshotId]/route';
import {GET as sources} from '@/app/api/psp/snapshots/[snapshotId]/metrics/[metricKey]/sources/route';

const projectId='PSP-BC-ENDO-001',project={params:Promise.resolve({projectId})};
const window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW};
const url=(path:string,query='role=project_manager&actorId=project-manager-psp')=>`http://localhost${path}?${query}`;
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});

it('lists only summaries and freezes through HTTP with no-store',async()=>{
 const path=`/api/psp/projects/${projectId}/snapshots`;
 const before=await list(new Request(url(path)),project);expect(before.status).toBe(200);
 expect(before.headers.get('Cache-Control')).toBe('no-store');
 const input={window,meta:{seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.ledgerRevision,clientRequestId:'route-freeze',role:'project_manager',actorId:'project-manager-psp'}};
 const posted=await freeze(new Request(`http://localhost${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),project);
 expect(posted.status).toBe(200);const body=await posted.json();expect(body.data.internalMetrics.length).toBeGreaterThan(0);
 const listed=await list(new Request(url(path)),project);const data=await listed.json();expect(data.summaries).toHaveLength(1);expect(data.summaries[0]).not.toHaveProperty('sources');
});

it('serves bound detail/source and rejects unsupported queries and roles',async()=>{
 const input={window,meta:{seedVersion:getStore().seedVersion,expectedVersion:getStore().psp.ledgerRevision,clientRequestId:'route-read',role:'project_manager',actorId:'project-manager-psp'}};
 const posted=await freeze(new Request(`http://localhost/api/psp/projects/${projectId}/snapshots`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),project);
 const {data}=await posted.json(),seed=getStore().seedVersion;
 const detailPath=`/api/psp/snapshots/${encodeURIComponent(data.id)}`;
 const read=await detail(new Request(url(detailPath,`role=data_reviewer&actorId=data-reviewer-psp&seedVersion=${seed}`)),{params:Promise.resolve({snapshotId:data.id})});
 expect(read.status).toBe(200);expect((await read.json()).snapshot.id).toBe(data.id);
 const evidencePath=`${detailPath}/metrics/contact_completion/sources`;
 const evidence=await sources(new Request(url(evidencePath,`role=medical_reviewer&actorId=medical-reviewer-psp&seedVersion=${seed}&scope=aggregate`)),{params:Promise.resolve({snapshotId:data.id,metricKey:'contact_completion'})});
 expect(evidence.status).toBe(200);expect((await evidence.json()).metric.numerator).toBe(8);
 const forbidden=await detail(new Request(url(detailPath,`role=patient&actorId=P-A&seedVersion=${seed}`)),{params:Promise.resolve({snapshotId:data.id})});
 expect(forbidden.status).toBe(403);expect(forbidden.headers.get('Cache-Control')).toBe('no-store');
 expect((await sources(new Request(url(evidencePath,`role=project_manager&actorId=project-manager-psp&seedVersion=${seed}&scope=internal&path=psp.foo`)),{params:Promise.resolve({snapshotId:data.id,metricKey:'contact_completion'})})).status).toBe(400);
 expect((await list(new Request(url(`/api/psp/projects/${projectId}/snapshots`,'role=project_manager&actorId=project-manager-psp&x=1')),project)).status).toBe(400);
});

it('marks rejected freeze responses no-store',async()=>{
 const path=`/api/psp/projects/${projectId}/snapshots`;
 const response=await freeze(new Request(url(path,'unexpected=1'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})}),project);
 expect(response.status).toBe(400);
 expect(response.headers.get('Cache-Control')).toBe('no-store');
});
