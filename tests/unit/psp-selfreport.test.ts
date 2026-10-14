import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import * as types from '@/lib/psp/types';
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{vi.restoreAllMocks();delete process.env.DEMO_FIXED_NOW;});
it('publishes optional immutable evidence schemas without changing seed shape',()=>{
 expect(types).toHaveProperty('PspSelfReportRevision');expect(types).toHaveProperty('PspCorrection');
 const seed=types.PspState.parse(getStore().psp);expect('selfReportRevisions' in seed).toBe(false);expect('corrections' in seed).toBe(false);
});
import type {CommandMeta} from '@/lib/psp/types';
import * as writer from '@/lib/adherence/checkin';
const patientMeta=(id:string,version=1):CommandMeta=>({seedVersion:getStore().seedVersion,expectedVersion:version,clientRequestId:id,role:'patient',actorId:'P-A'});
const cm=(id:string,version=1):CommandMeta=>({...patientMeta(id,version),role:'case_manager',actorId:'case-manager-chen'});
const services=()=>import('@/lib/psp/selfReport');
it('publishes a draft clinical writer',()=>expect(writer).toHaveProperty('recordAdherenceInStore'));
it('atomically writes server today precise clinical + PSP copies and explicitly revisions',async()=>{
 const service=await services(),authorization=getStore().psp.authorizationVersion;
 const first=service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},patientMeta('first'));
 expect(first.data).toMatchObject({logDate:'2026-10-13',due:1,taken:1,precision:'instant',occurredAt:PSP_TEST_NOW,recordedAt:PSP_TEST_NOW});
 expect(getStore().patients.get('P-A')!.adherence.find(r=>r.date==='2026-10-13')).toMatchObject({taken:1});
 const original=structuredClone(first.data);const same=service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},patientMeta('same',first.objectVersion));expect(same.data).toEqual(original);expect(same.objectVersion).toBe(first.objectVersion);
 const before=structuredClone(getStore());expect(()=>service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:0},patientMeta('implicit',first.objectVersion))).toThrow(/修订/);expect(getStore()).toEqual(before);
 const second=service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:0,reason:'忘记',revisionOf:first.data.sourceId},patientMeta('revision',first.objectVersion));expect(second.data.revisionOf).toBe(first.data.sourceId);expect(getStore().psp.selfReportRevisions![0]).toEqual(original);expect(getStore().psp.authorizationVersion).toBe(authorization);
 expect(Object.isFrozen(getStore().psp.selfReportRevisions![0])).toBe(true);expect(service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},patientMeta('first'))).toEqual(first);
 first.data.reason='mutated';expect(service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},patientMeta('first')).data.reason).toBe(null);
});
it('rejects dose/client timestamp/date/identity/stale revisions before any writes',async()=>{
 const service=await services(),base={enrollmentId:'ENR-01',due:1 as const,taken:1 as const},before=structuredClone(getStore());
 for(const change of [{due:0},{due:2},{taken:2},{taken:-1},{logDate:'2026-10-12'},{logDate:'2026-02-30'},{occurredAt:PSP_TEST_NOW},{recordedAt:PSP_TEST_NOW},{revisionOf:'missing'},{enrollmentId:'ENR-02'}])expect(()=>service.submitProjectAdherence({...base,...change} as never,patientMeta('bad'))).toThrow();
 expect(()=>service.submitProjectAdherence(base,cm('cm'))).toThrow();expect(getStore()).toEqual(before);
});
it('rolls back clinical writer failures with no evidence or receipt',async()=>{
 const service=await services(),before=structuredClone(getStore());vi.spyOn(writer,'recordAdherenceInStore').mockImplementation(()=>{throw Error('writer failed');});expect(()=>service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},patientMeta('failed'))).toThrow('writer failed');expect(getStore()).toEqual(before);
});
it('copies completed legacy dates once and does not reread overwritten clinical arrays',async()=>{
 const service=await services(),first=service.importLegacySelfReports('ENR-01',cm('import'));
 expect(first.data.importedCount).toBeGreaterThan(0);expect(getStore().psp.selfReportRevisions!.every(r=>r.precision==='date_only'&&r.occurredAt===null&&r.logDate<'2026-10-13')).toBe(true);
 const source=structuredClone(getStore().psp.selfReportRevisions![0]),row=getStore().patients.get('P-A')!.adherence.find(r=>r.date===source.logDate)!;row.taken=row.taken?0:1;
 const again=service.importLegacySelfReports('ENR-01',cm('again',first.objectVersion));expect(again.data.importedCount).toBe(0);expect(again.objectVersion).toBe(first.objectVersion);expect(getStore().psp.selfReportRevisions![0]).toEqual(source);expect(service.importLegacySelfReports('ENR-01',cm('import'))).toEqual(first);
});
import {encodeDemoStore,decodeDemoStore} from '@/lib/state/persistence';
async function rawBytes(s:ReturnType<typeof getStore>){return new Uint8Array(await new Response(new Blob([JSON.stringify({version:2,store:{...s,patients:[...s.patients.values()]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());}
it('rejects corrupted immutable hashes, identity, revision chains, authorization and sequences on encode and recovery',async()=>{
 const service=await services(),first=service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},patientMeta('first'));service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:0,revisionOf:first.data.sourceId},patientMeta('second',first.objectVersion));
 const valid=structuredClone(getStore());expect((await decodeDemoStore(await encodeDemoStore(valid))).psp.selfReportRevisions).toEqual(valid.psp.selfReportRevisions);
 const corruptions=[(s:typeof valid)=>{s.psp.selfReportRevisions![0].taken=0;},(s:typeof valid)=>{s.psp.selfReportRevisions![0].sourceHash='a'.repeat(64);},(s:typeof valid)=>{s.psp.selfReportRevisions![0].enrollmentId='ENR-02';},(s:typeof valid)=>{s.psp.selfReportRevisions![1].revisionOf='missing';},(s:typeof valid)=>{s.psp.selfReportRevisions![0].logDate='2026-10-12';},(s:typeof valid)=>{s.psp.selfReportRevisions![0].actorId='case-manager-chen';},(s:typeof valid)=>{s.psp.selfReportRevisions![1].sequence=s.psp.selfReportRevisions![0].sequence;},(s:typeof valid)=>{s.psp.selfReportRevisions![0].occurredAt='2026-10-12T02:00:00.000Z';},(s:typeof valid)=>{s.psp.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!.sequence=s.psp.ledgerRevision+1;}];
 for(const corrupt of corruptions){const s=structuredClone(valid);corrupt(s);await expect(encodeDemoStore(s)).rejects.toThrow();await expect(decodeDemoStore(await rawBytes(s))).rejects.toThrow();}
},15000);
it('enforces current service and project without blocking receipt replay after withdrawal',async()=>{
 const service=await services(),{recordPermission}=await import('@/lib/psp/permissions'),meta=patientMeta('first'),first=service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},meta);
 recordPermission('ENR-01','service','withdraw',patientMeta('withdraw',first.objectVersion));const before=structuredClone(getStore());expect(service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},meta)).toEqual(first);expect(()=>service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},patientMeta('fresh',getStore().psp.enrollments[0].version))).toThrow(/授权|成员/);expect(()=>service.importLegacySelfReports('ENR-01',cm('fresh-import',getStore().psp.enrollments[0].version))).toThrow(/授权|成员/);expect(getStore()).toEqual(before);
});
it('strict adherence POST scopes path and rejects unknown fields without writes',async()=>{
 const route=await import('@/app/api/psp/enrollments/[id]/adherence/route'),ctx={params:Promise.resolve({id:'ENR-01'})},before=structuredClone(getStore());
 const post=(body:unknown)=>route.POST(new Request('http://local/api',{method:'POST',body:JSON.stringify(body)}),ctx);
 for(const body of [{due:2,taken:1,meta:patientMeta('bad')},{due:1,taken:1,occurredAt:PSP_TEST_NOW,meta:patientMeta('bad')},{action:'import_legacy',taken:1,meta:cm('bad')},{due:1,taken:1,enrollmentId:'ENR-02',meta:patientMeta('bad')},{action:'unknown',meta:patientMeta('bad')}])expect((await post(body)).status).toBe(400);expect(getStore()).toEqual(before);
 expect((await post({due:1,taken:1,meta:patientMeta('ok')})).status).toBe(200);
});
it('rejects forged precise chains and same-time retroactive authorization even with a recomputed hash',async()=>{
 const service=await services(),{selfReportHash}=await import('@/lib/psp/evidenceValidation'),first=service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:1},patientMeta('first'));service.submitProjectAdherence({enrollmentId:'ENR-01',due:1,taken:0,revisionOf:first.data.sourceId},patientMeta('second',first.objectVersion));
 const valid=structuredClone(getStore());
 for(const change of [(s:typeof valid)=>{s.psp.selfReportRevisions![1].revisionOf=undefined;},(s:typeof valid)=>{s.psp.selfReportRevisions![1].revisionOf=s.psp.selfReportRevisions![1].sourceId;},(s:typeof valid)=>{s.psp.selfReportRevisions![0].enrollmentId='ENR-02';},(s:typeof valid)=>{const grant=s.psp.permissionEvents.find(e=>e.enrollmentId==='ENR-01'&&e.scope==='service')!;grant.sequence=s.psp.ledgerRevision+1;s.psp.ledgerRevision+=2;grant.occurredAt=PSP_TEST_NOW;grant.recordedAt=PSP_TEST_NOW;}]){
  const s=structuredClone(valid);change(s);for(const r of s.psp.selfReportRevisions!)r.sourceHash=selfReportHash(s.psp.enrollments.find(e=>e.id===r.enrollmentId)!.patientId,r);await expect(encodeDemoStore(s)).rejects.toThrow();await expect(decodeDemoStore(await rawBytes(s))).rejects.toThrow();
 }
},15000);
it('legacy sources survive clinical overwrite but reject forged stable identity and precision metadata',async()=>{
 const service=await services();service.importLegacySelfReports('ENR-01',cm('import'));const valid=structuredClone(getStore());const record=valid.psp.selfReportRevisions![0];valid.patients.get('P-A')!.adherence.find(r=>r.date===record.logDate)!.taken=record.taken?0:1;expect((await decodeDemoStore(await encodeDemoStore(valid))).psp.selfReportRevisions![0]).toEqual(record);
 for(const change of [(s:typeof valid)=>{s.psp.selfReportRevisions![0].sourceId='unfixed';},(s:typeof valid)=>{s.psp.selfReportRevisions![0].occurredAt=PSP_TEST_NOW;},(s:typeof valid)=>{s.psp.selfReportRevisions!.push({...s.psp.selfReportRevisions![0],sequence:++s.psp.ledgerRevision});}]){const s=structuredClone(valid);change(s);await expect(encodeDemoStore(s)).rejects.toThrow();await expect(decodeDemoStore(await rawBytes(s))).rejects.toThrow();}
},15000);
