import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore,replaceStore,type DemoStore} from '@/lib/state/store';
import {createDurableRequest} from '@/lib/state/durableRequest';
import {decodeDemoStore,encodeDemoStore} from '@/lib/state/persistence';
import {pspResponse} from '@/lib/psp/http';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {createReportDraft,readInternalReport} from '@/lib/psp/reports';
import {submitReport,reviewReport,reviseReport} from '@/lib/psp/review';
import {deliverReport,acceptReport,requestClientChanges} from '@/lib/psp/delivery';
import {readPharmaReport} from '@/lib/psp/pharmaView';
import {recordPermission} from '@/lib/psp/permissions';
import type {CommandMeta} from '@/lib/psp/types';
const project='PSP-BC-ENDO-001',window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW};
const actors={project_manager:'project-manager-psp',data_reviewer:'data-reviewer-psp',medical_reviewer:'medical-reviewer-psp',pharma_owner:'pharma-owner-a',patient:'P-A'};
const meta=(id:string,expectedVersion:number,role:keyof typeof actors='project_manager'):CommandMeta=>({role,actorId:actors[role],seedVersion:getStore().seedVersion,expectedVersion,clientRequestId:id});
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it.each(['before','after'] as const)('recovers %s-put delivery and both customer decisions without duplicate artifacts or mutable historical receipts',async failure=>{
 const snapshot=freezePspSnapshot(project,window,meta('freeze',getStore().psp.ledgerRevision)).data,creationMeta=meta('create',getStore().psp.ledgerRevision),created=createReportDraft(snapshot.id,{nextActions:[]},creationMeta),id=created.data.id;
 submitReport(id,meta('submit',1));reviewReport(id,{kind:'data',decision:'approve'},meta('data',2,'data_reviewer'));reviewReport(id,{kind:'medical',decision:'approve'},meta('medical',3,'medical_reviewer'));
 let saved=await encodeDemoStore(getStore()),fails=false;
 const run=(operation:()=>unknown)=>createDurableRequest<DemoStore,[]>({read:async()=>saved,write:async value=>{if(fails&&failure==='before')throw new Error('definite save failure');saved=value;if(fails)throw new Error('uncertain persisted outcome');},getState:getStore,setState:value=>{if(value)replaceStore(value);},encode:encodeDemoStore,decode:decodeDemoStore,handle:()=>pspResponse(operation)});
 const historical:{operation:()=>unknown;result:unknown}[]=[];
 const uncertain=async(operation:()=>unknown)=>{
  const request=run(operation),before=structuredClone(getStore()),count=before.psp.reportActions!.length,ledger=before.psp.ledgerRevision;
  fails=true;const unavailable=await request();expect(unavailable.status).toBe(503);expect(unavailable.headers.get('Cache-Control')).toBe('no-store');if(failure==='before')expect(getStore()).toEqual(before);else expect(getStore().psp.reportActions).toHaveLength(count+1);
  fails=false;const response=await request();expect(response.status).toBe(200);const result=await response.json();expect(getStore().psp.reportActions).toHaveLength(count+1);expect(getStore().psp.ledgerRevision).toBe(ledger+1);expect(await(await request()).json()).toEqual(result);historical.push({operation,result});return result;
 };
 const deliveryMeta=meta('deliver',4);await uncertain(()=>deliverReport(id,deliveryMeta));expect(getStore().psp.deliveryArtifacts).toHaveLength(1);const originalArtifact=structuredClone(getStore().psp.deliveryArtifacts![0]);
 const returnMeta=meta('client-return',5,'pharma_owner'),returned=await uncertain(()=>requestClientChanges(id,'请补充安排',returnMeta));expect(returned.data.status).toBe('client_changes_requested');expect(JSON.stringify(returned)).not.toMatch(/content|snapshot|artifact|factIds/);expect(getStore().psp.deliveryArtifacts![0]).toEqual(originalArtifact);
 const revisionMeta=meta('revision',getStore().psp.ledgerRevision),revisionRequest=run(()=>reviseReport(id,[],revisionMeta)),revised=await(await revisionRequest()).json(),nextId=revised.data.id;
 for(const [request,kind,version] of [['resubmit',null,1],['medical-new','medical',2],['data-new','data',3]] as const){const m=meta(request,version,kind?`${kind}_reviewer`:'project_manager');expect((await run(()=>kind?reviewReport(nextId,{kind,decision:'approve'},m):submitReport(nextId,m))()).status).toBe(200);}
 const nextDeliveryMeta=meta('deliver-new',4);expect((await run(()=>deliverReport(nextId,nextDeliveryMeta))()).status).toBe(200);const secondArtifact=structuredClone(getStore().psp.deliveryArtifacts![1]);
 const acceptMeta=meta('accept',5,'pharma_owner'),accepted=await uncertain(()=>acceptReport(nextId,'已核对',acceptMeta));expect(accepted.data.status).toBe('accepted');expect(getStore().psp.deliveryArtifacts![1]).toEqual(secondArtifact);
 const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!,withdrawMeta=meta('withdraw',e.version,'patient');expect((await run(()=>recordPermission(e.id,'aggregate','withdraw',withdrawMeta))()).status).toBe(200);expect(readPharmaReport(project,id).gate.status).toBe('revoked');expect(readPharmaReport(project,nextId).gate.status).toBe('revoked');
 const beforeReplay=structuredClone(getStore());for(const old of historical)expect(await(await run(old.operation)()).json()).toEqual(old.result);expect(await(await run(()=>createReportDraft(snapshot.id,{nextActions:[]},creationMeta))()).json()).toEqual(created);expect(await(await revisionRequest()).json()).toEqual(revised);expect(getStore()).toEqual(beforeReplay);
 const restored=await decodeDemoStore(saved);replaceStore(restored);expect(restored).toEqual(beforeReplay);expect(restored.psp.deliveryArtifacts).toEqual([originalArtifact,secondArtifact]);expect(restored.psp.reportActions).toHaveLength(10);expect(Object.isFrozen(restored.psp.deliveryArtifacts![0].body.content.chapters)).toBe(true);expect(Object.isFrozen(restored.psp.reportActions!.at(-1))).toBe(true);expect(readInternalReport(nextId,'project_manager','project-manager-psp',restored.seedVersion).workflow.status).toBe('accepted');
},40000);
