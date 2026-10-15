import {beforeEach,afterEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {createReportDraft} from '@/lib/psp/reports';
import {submitReport,reviewReport} from '@/lib/psp/review';
import * as delivery from '@/lib/psp/delivery';
import {readPharmaReport,getPharmaProjectView} from '@/lib/psp/pharmaView';
import {validatePspState,type CommandMeta} from '@/lib/psp/types';
import {decodeDemoStore,encodeDemoStore} from '@/lib/state/persistence';
import {recordPermission} from '@/lib/psp/permissions';
const project='PSP-BC-ENDO-001';
const meta=(id:string,expectedVersion:number,role:CommandMeta['role']='project_manager'):CommandMeta=>({seedVersion:getStore().seedVersion,clientRequestId:id,expectedVersion,role,actorId:role==='pharma_owner'?'pharma-owner-a':role==='project_manager'?'project-manager-psp':role==='patient'?'P-A':role.replace('_','-')+'-psp'});
function setup(){const snap=freezePspSnapshot(project,{periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW},meta('freeze',getStore().psp.ledgerRevision)).data;const r=createReportDraft(snap.id,{nextActions:[]},meta('create',getStore().psp.ledgerRevision)).data;return r;}
function approved(){const r=setup();submitReport(r.id,meta('submit',1));reviewReport(r.id,{kind:'data',decision:'approve'},meta('data',2,'data_reviewer'));reviewReport(r.id,{kind:'medical',decision:'approve'},meta('medical',3,'medical_reviewer'));return r;}
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it('requires exact PM and double approval, delivers immutable bytes, accepts safe historical receipt',async()=>{
 const r=setup();expect(()=>delivery.deliverReport(r.id,meta('early',1))).toThrow();submitReport(r.id,meta('submit',1));reviewReport(r.id,{kind:'data',decision:'approve'},meta('data',2,'data_reviewer'));expect(()=>delivery.deliverReport(r.id,meta('one',3))).toThrow();reviewReport(r.id,{kind:'medical',decision:'approve'},meta('medical',3,'medical_reviewer'));
 expect(getPharmaProjectView(project).reports).toEqual([]);expect(()=>delivery.deliverReport(r.id,meta('wrong',4,'pharma_owner'))).toThrow();const prefix=structuredClone(getStore().psp.commandReceipts);
 const delivered=delivery.deliverReport(r.id,meta('deliver',4));expect(delivered.data.status).toBe('delivered');const view=readPharmaReport(project,r.id);expect(view.gate.status).toBe('available');const bytes=JSON.stringify(getStore().psp.deliveryArtifacts);
 const accepted=delivery.acceptReport(r.id,'  reviewed  ',meta('accept',5,'pharma_owner'));expect(accepted.data.status).toBe('accepted');expect(JSON.stringify(accepted)).not.toMatch(/content|snapshot|factIds|createdBy/);expect(JSON.stringify(getStore().psp.deliveryArtifacts)).toBe(bytes);expect(getStore().psp.commandReceipts.slice(0,prefix.length)).toEqual(prefix);
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(getStore())));expect(delivery.deliverReport(r.id,meta('deliver',4))).toEqual(delivered);expect(delivery.acceptReport(r.id,'reviewed',meta('accept',5,'pharma_owner'))).toEqual(accepted);expect(Object.isFrozen(getStore().psp.deliveryArtifacts![0])).toBe(true);expect(Object.isFrozen(getStore().psp.reportActions!.at(-1))).toBe(true);
 const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;recordPermission(e.id,'aggregate','withdraw',meta('withdraw',e.version,'patient'));expect(readPharmaReport(project,r.id)).toMatchObject({gate:{status:'revoked'}});expect(Object.keys(readPharmaReport(project,r.id)).sort()).toEqual(['authorizationGate','authorizationVersion','gate','id','projectId','seedVersion','status','version']);expect(delivery.acceptReport(r.id,'reviewed',meta('accept',5,'pharma_owner'))).toEqual(accepted);validatePspState(getStore().psp);
});
it('client return is terminal, artifact stable, and tampered histories or receipts fail validation',()=>{
 const r=approved();delivery.deliverReport(r.id,meta('deliver',4));const bytes=JSON.stringify(getStore().psp.deliveryArtifacts);delivery.requestClientChanges(r.id,'  revise please  ',meta('return',5,'pharma_owner'));expect(getStore().psp.reportVersions![0].status).toBe('client_changes_requested');expect(JSON.stringify(getStore().psp.deliveryArtifacts)).toBe(bytes);expect(()=>delivery.acceptReport(r.id,'',meta('late',6,'pharma_owner'))).toThrow();
 for(const mutate of [(s:ReturnType<typeof getStore>)=>{s.psp.reportActions!.splice(3,1);},(s:ReturnType<typeof getStore>)=>{s.psp.deliveryArtifacts![0].text+='tamper';},(s:ReturnType<typeof getStore>)=>{s.psp.commandReceipts.pop();},(s:ReturnType<typeof getStore>)=>{s.psp.reportVersions![0].status='accepted';}]){const s=structuredClone(getStore());mutate(s);expect(()=>validatePspState(s.psp)).toThrow();}
});
it('competing delivery uses report CAS; exact retry precedes current state while changed body is refused',()=>{
 const r=approved(),before=getStore().psp.ledgerRevision,delivered=delivery.deliverReport(r.id,meta('deliver',4));
 expect(()=>delivery.deliverReport(r.id,meta('racer',4))).toThrowError(expect.objectContaining({code:'stale_version'}));expect(getStore().psp.ledgerRevision).toBe(before+1);expect(getStore().psp.deliveryArtifacts).toHaveLength(1);
 const accepted=delivery.acceptReport(r.id,'ok',meta('accept',5,'pharma_owner'));expect(()=>delivery.acceptReport(r.id,'other',meta('accept',5,'pharma_owner'))).toThrowError(expect.objectContaining({code:'request_reused'}));expect(delivery.deliverReport(r.id,meta('deliver',4))).toEqual(delivered);expect(delivery.acceptReport(r.id,'ok',meta('accept',5,'pharma_owner'))).toEqual(accepted);expect(()=>delivery.requestClientChanges(r.id,'late',meta('late',6,'pharma_owner'))).toThrow();
});
it('validates delivery authorization at its original ledger prefix, event binding and reciprocal artifacts',()=>{
 const r=approved();delivery.deliverReport(r.id,meta('deliver',4));const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;recordPermission(e.id,'aggregate','withdraw',meta('withdraw',e.version,'patient'));
 for(const mutate of [
  (s:ReturnType<typeof getStore>)=>{const event=s.psp.reportActions!.at(-1)!,previous=event.sequence;event.sequence=++s.psp.ledgerRevision;const receipt=s.psp.commandReceipts.find(x=>x.ledgerRevision===previous)!;receipt.ledgerRevision=event.sequence;(receipt.result as {ledgerRevision:number}).ledgerRevision=event.sequence;},
  (s:ReturnType<typeof getStore>)=>{s.psp.reportActions!.at(-1)!.contentDigest='0'.repeat(64);},
  (s:ReturnType<typeof getStore>)=>{s.psp.deliveryArtifacts!.push(structuredClone(s.psp.deliveryArtifacts![0]));},
  (s:ReturnType<typeof getStore>)=>{s.psp.deliveryArtifacts![0].deliveryEventId='wrong';},
  (s:ReturnType<typeof getStore>)=>{s.psp.deliveryArtifacts![0].body.signatures[0].role='medical_reviewer';},
 ]){const bad=structuredClone(getStore());mutate(bad);expect(()=>validatePspState(bad.psp)).toThrow();}
 expect(()=>validatePspState(getStore().psp)).not.toThrow();
});
it('does not backfill absent delivery arrays in pre-delivery schema2',async()=>{setup();const restored=await decodeDemoStore(await encodeDemoStore(getStore()));expect(restored.psp.deliveryArtifacts).toBeUndefined();expect(restored.psp.reportActions).toBeUndefined();});
