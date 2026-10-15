import {afterEach,beforeEach,expect,it} from 'vitest';
import {buildPspTestStore,installPspTestStore,PSP_TEST_NOW} from '../helpers/psp';
import {getStore} from '@/lib/state/store';
import {freezePspSnapshot} from '@/lib/psp/snapshot';
import {createReportDraft,readInternalReport} from '@/lib/psp/reports';
import * as review from '@/lib/psp/review';
import {decodeDemoStore,encodeDemoStore} from '@/lib/state/persistence';
import {recordPermission} from '@/lib/psp/permissions';
import {validatePspState,type CommandMeta} from '@/lib/psp/types';
const project='PSP-BC-ENDO-001',window={periodStart:'2026-10-01T00:00:00+08:00',periodEnd:'2026-11-01T00:00:00+08:00',cutoffAt:PSP_TEST_NOW};
const meta=(id:string,expectedVersion:number,kind?:'data'|'medical'):CommandMeta=>({seedVersion:getStore().seedVersion,clientRequestId:id,expectedVersion,role:kind?`${kind}_reviewer`:'project_manager',actorId:kind?`${kind}-reviewer-psp`:'project-manager-psp'});
function draft(){const s=freezePspSnapshot(project,window,meta('freeze',getStore().psp.ledgerRevision)).data;return createReportDraft(s.id,{nextActions:[]},meta('create',getStore().psp.ledgerRevision));}
beforeEach(()=>{process.env.DEMO_FIXED_NOW=PSP_TEST_NOW;installPspTestStore(buildPspTestStore());});
afterEach(()=>{delete process.env.DEMO_FIXED_NOW;});
it.each([['data','medical'],['medical','data']] as const)('requires both signatures in %s then %s order and preserves original receipts',async(first,second)=>{
 const created=draft(),id=created.data.id,original=structuredClone(getStore().psp.commandReceipts),auth=getStore().psp.authorizationVersion;
 const submit=review.submitReport(id,meta('submit',1));expect(submit.data.status).toBe('in_review');expect(submit.objectVersion).toBe(2);
 const one=review.reviewReport(id,{kind:first,decision:'approve'},meta('one',2,first));expect(one.data.status).toBe('in_review');
 expect(()=>review.reviewReport(id,{kind:second,decision:'approve'},meta('concurrent',2,second))).toThrow();
 const two=review.reviewReport(id,{kind:second,decision:'approve'},meta('two',3,second));expect(two.data.status).toBe('approved');expect(two.objectVersion).toBe(4);
 const detail=readInternalReport(id,'project_manager','project-manager-psp',created.seedVersion);
 expect(detail.workflow.missingReviews).toEqual([]);expect(detail.workflow.dataReview?.submissionId).toBe(detail.workflow.medicalReview?.submissionId);expect(detail.workflow.dataReview?.submittedVersion).toBe(2);expect(detail.workflow.medicalReview?.submittedVersion).toBe(2);
 expect(getStore().psp.commandReceipts.slice(0,original.length)).toEqual(original);expect(getStore().psp.authorizationVersion).toBe(auth);expect(two.data.contentDigest).toBe(created.data.contentDigest);
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(getStore())));
 expect(review.submitReport(id,meta('submit',1))).toEqual(submit);expect(review.reviewReport(id,{kind:first,decision:'approve'},meta('one',2,first))).toEqual(one);
 expect(createReportDraft(created.data.snapshotId,{nextActions:[]},meta('create',1))).toEqual(created);
 expect(Object.isFrozen(getStore().psp.reportActions![0])).toBe(true);
});
it('returns with trimmed reason then revises with one shared creation receipt and no inherited signatures',()=>{
 const created=draft(),id=created.data.id;review.submitReport(id,meta('submit',1));review.reviewReport(id,{kind:'data',decision:'approve'},meta('approve',2,'data'));
 const returned=review.reviewReport(id,{kind:'data',decision:'return',reason:'  补充安排  '},meta('return',3,'data'));expect(returned.data.status).toBe('changes_requested');
 expect(readInternalReport(id,'data_reviewer','data-reviewer-psp',created.seedVersion).workflow.returnReview?.reason).toBe('补充安排');
 expect(()=>review.reviewReport(id,{kind:'medical',decision:'approve'},meta('late',4,'medical'))).toThrow();
 const count=getStore().psp.commandReceipts.length,revisionMeta=meta('revise',getStore().psp.ledgerRevision),revised=review.reviseReport(id,[],revisionMeta);
 expect(getStore().psp.commandReceipts).toHaveLength(count+1);expect(revised.data).toMatchObject({status:'draft',version:1,parentVersionId:id,revision:2});
 expect(createReportDraft(created.data.snapshotId,{parentVersionId:id,nextActions:[]},revisionMeta)).toEqual(revised);
 expect(review.reviseReport(id,[],revisionMeta)).toEqual(revised);
 expect(readInternalReport(revised.data.id,'project_manager','project-manager-psp',created.seedVersion).workflow.dataReview).toBeNull();
 review.submitReport(revised.data.id,meta('resubmit',1));review.reviewReport(revised.data.id,{kind:'medical',decision:'approve'},meta('new-medical',2,'medical'));expect(review.reviewReport(revised.data.id,{kind:'data',decision:'approve'},meta('new-data',3,'data')).data.status).toBe('approved');
});
it('keeps internal reviews/history usable after aggregate withdrawal but rejects fresh submission',async()=>{
 const created=draft(),id=created.data.id,submitted=review.submitReport(id,meta('submit',1));const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 recordPermission(e.id,'aggregate','withdraw',{...meta('withdraw',e.version),role:'patient',actorId:'P-A'});
 expect(review.submitReport(id,meta('submit',1))).toEqual(submitted);
 review.reviewReport(id,{kind:'data',decision:'approve'},meta('data',2,'data'));
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(getStore())));expect(review.reviewReport(id,{kind:'medical',decision:'approve'},meta('medical',3,'medical')).data.status).toBe('approved');
});
it('rejects wrong identity, role, seed, reused body, duplicate approval, return reason and mutable content',()=>{
 const r=draft().data,id=r.id;
 expect(()=>review.submitReport(id,meta('bad',1,'data'))).toThrow();expect(()=>review.submitReport(id,{...meta('bad',1),seedVersion:getStore().seedVersion+1})).toThrow();
 review.submitReport(id,meta('submit',1));
 expect(()=>review.reviseReport(id,[],meta('revise',getStore().psp.ledgerRevision))).toThrow();expect(()=>createReportDraft(r.snapshotId,{parentVersionId:id,nextActions:[]},meta('old-revise',getStore().psp.ledgerRevision))).toThrow();
 expect(()=>review.reviewReport(id,{kind:'data',decision:'approve'},meta('bad',2,'medical'))).toThrow();
 for(const reason of ['', '   ','x'.repeat(1001)])expect(()=>review.reviewReport(id,{kind:'data',decision:'return',reason},meta('bad',2,'data'))).toThrow();
 expect(()=>review.reviewReport(id,{kind:'data',decision:'approve',reason:'extra'},meta('bad',2,'data'))).toThrow();
 review.reviewReport(id,{kind:'data',decision:'approve'},meta('approve',2,'data'));
 expect(()=>review.reviewReport(id,{kind:'data',decision:'return',reason:'changed'},meta('approve',2,'data'))).toThrow();
 expect(()=>review.reviewReport(id,{kind:'data',decision:'approve'},meta('duplicate',3,'data'))).toThrow();
});
it('rejects tampered historical action, materialization and receipt projections',async()=>{
 const r=draft().data;review.submitReport(r.id,meta('submit',1));review.reviewReport(r.id,{kind:'data',decision:'approve'},meta('data',2,'data'));
 const mutations:Array<(s:ReturnType<typeof getStore>)=>void>=[s=>{s.psp.reportVersions![0].status='approved';},s=>{s.psp.reportActions!.shift();},s=>{s.psp.reportActions![1].submittedVersion=3;},s=>{s.psp.reportActions![0].actorId='data-reviewer-psp';},s=>{s.psp.reportActions![1].snapshotDigest='0'.repeat(64);},s=>{s.psp.reportActions![1].sequence=s.psp.permissionEvents[0].sequence;},s=>{s.psp.commandReceipts.pop();},s=>{(s.psp.commandReceipts.at(-2)!.result as {data:unknown}).data=s.psp.reportVersions![0];}];
 for(const mutate of mutations){const bad=structuredClone(getStore());mutate(bad);expect(()=>validatePspState(bad.psp)).toThrow();const raw={version:2,store:{...bad,patients:[...bad.patients.values()]}};const stream=new Blob([JSON.stringify(raw)]).stream().pipeThrough(new CompressionStream('gzip'));await expect(decodeDemoStore(new Uint8Array(await new Response(stream).arrayBuffer()))).rejects.toThrow();}
});
it('preserves absent optional history for old schema2 and rejects fresh submit from withdrawn sources even after regrant',async()=>{
 const created=draft();installPspTestStore(await decodeDemoStore(await encodeDemoStore(getStore())));expect(getStore().psp.reportActions).toBeUndefined();
 const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;
 recordPermission(e.id,'aggregate','withdraw',{...meta('withdraw',e.version),role:'patient',actorId:e.patientId});
 expect(()=>review.submitReport(created.data.id,meta('submit',1))).toThrowError(expect.objectContaining({status:403,code:'source_unusable'}));
 recordPermission(e.id,'aggregate','grant',{...meta('grant',getStore().psp.enrollments.find(x=>x.id===e.id)!.version),role:'patient',actorId:e.patientId});
 expect(()=>review.submitReport(created.data.id,meta('again',1))).toThrowError(expect.objectContaining({status:403}));expect(getStore().psp.reportActions).toBeUndefined();
});
it.each(['service','unrelated'] as const)('allows fresh submit after %s authorization change',kind=>{
 const r=draft().data,e=getStore().psp.enrollments.find(e=>kind==='service'?e.patientId==='P-A':!getStore().psp.permissionEvents.some(p=>p.enrollmentId===e.id&&p.scope==='aggregate'&&p.action==='grant'))!;
 recordPermission(e.id,kind==='service'?'service':'aggregate','withdraw',{...meta('withdraw',e.version),role:'patient',actorId:e.patientId});
 expect(review.submitReport(r.id,meta('submit',1)).data.status).toBe('in_review');
});
it('server gates reflect exact role, latest head, own signature and terminal states',()=>{
 const r=draft().data,seed=getStore().seedVersion;
 const gate=(kind?:'data'|'medical')=>review.getReportActionGates(r.id,kind?`${kind}_reviewer`:'project_manager',kind?`${kind}-reviewer-psp`:'project-manager-psp',seed);
 expect(gate()).toMatchObject({canSubmit:true,canRevise:true,canApprove:false,canReturn:false});expect(gate('data').canSubmit).toBe(false);
 review.submitReport(r.id,meta('submit',1));expect(gate()).toMatchObject({canSubmit:false,canRevise:false});expect(gate('data')).toMatchObject({canApprove:true,canReturn:true,reviewKind:'data'});
 review.reviewReport(r.id,{kind:'data',decision:'approve'},meta('approve',2,'data'));expect(gate('data')).toMatchObject({canApprove:false,canReturn:true});
 review.reviewReport(r.id,{kind:'medical',decision:'return',reason:'内部修订说明'},meta('return',3,'medical'));expect(gate()).toMatchObject({canRevise:true,canSubmit:false});expect(gate('medical')).toMatchObject({canApprove:false,canReturn:false});
 const revised=review.reviseReport(r.id,[],meta('revise',getStore().psp.ledgerRevision));expect(gate().canRevise).toBe(false);expect(JSON.stringify(revised.data.content)).not.toContain('内部修订说明');
 expect(()=>review.submitReport(r.id,meta('old',4))).toThrowError(expect.objectContaining({status:409}));
});
it('old draft head cannot submit; old approved head cannot return',()=>{
 const r=draft().data,newer=review.reviseReport(r.id,[],meta('revise',getStore().psp.ledgerRevision)).data;
 expect(()=>review.submitReport(r.id,meta('old',1))).toThrowError(expect.objectContaining({status:409}));
 review.submitReport(newer.id,meta('submit',1));review.reviewReport(newer.id,{kind:'data',decision:'approve'},meta('data',2,'data'));review.reviewReport(newer.id,{kind:'medical',decision:'approve'},meta('medical',3,'medical'));
 expect(()=>review.reviewReport(newer.id,{kind:'data',decision:'return',reason:'late'},meta('late',4,'data'))).toThrowError(expect.objectContaining({status:409}));
});
it('old submit/approval/return receipts replay after new revision and withdrawal with immutable response copies',async()=>{
 const r=draft().data,submitted=review.submitReport(r.id,meta('submit',1)),approved=review.reviewReport(r.id,{kind:'data',decision:'approve'},meta('approve',2,'data'));
 const returned=review.reviewReport(r.id,{kind:'medical',decision:'return',reason:' reason '},meta('return',3,'medical'));
 review.reviseReport(r.id,[],meta('revise',getStore().psp.ledgerRevision));const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;recordPermission(e.id,'aggregate','withdraw',{...meta('withdraw',e.version),role:'patient',actorId:e.patientId});
 installPspTestStore(await decodeDemoStore(await encodeDemoStore(getStore())));const before=getStore().psp.ledgerRevision;
 expect(review.submitReport(r.id,meta('submit',1))).toEqual(submitted);expect(review.reviewReport(r.id,{kind:'data',decision:'approve'},meta('approve',2,'data'))).toEqual(approved);expect(review.reviewReport(r.id,{kind:'medical',decision:'return',reason:'reason'},meta('return',3,'medical'))).toEqual(returned);
 const copy=review.submitReport(r.id,meta('submit',1));copy.data.content.title='changed';expect(review.submitReport(r.id,meta('submit',1))).toEqual(submitted);expect(getStore().psp.ledgerRevision).toBe(before);
 expect(()=>review.submitReport(r.id,{...meta('submit',1),actorId:'wrong'})).toThrowError(expect.objectContaining({status:403}));expect(()=>review.submitReport(r.id,{...meta('submit',1),seedVersion:getStore().seedVersion+1})).toThrowError(expect.objectContaining({status:409,code:'stale_seed'}));
});
it('rejects historical submission moved after an authorization withdrawal with coherent receipt',()=>{
 const r=draft().data;review.submitReport(r.id,meta('submit',1));const e=getStore().psp.enrollments.find(e=>e.patientId==='P-A')!;recordPermission(e.id,'aggregate','withdraw',{...meta('withdraw',e.version),role:'patient',actorId:e.patientId});
 const bad=structuredClone(getStore()),event=bad.psp.reportActions![0],old=event.sequence;event.sequence=++bad.psp.ledgerRevision;
 const receipt=bad.psp.commandReceipts.find(r=>r.ledgerRevision===old)!;receipt.ledgerRevision=event.sequence;(receipt.result as {ledgerRevision:number}).ledgerRevision=event.sequence;
 expect(()=>validatePspState(bad.psp)).toThrow(/historical.*authorization/);
});
it('rejects child creation moved into in_review prefix although current parent is returned',()=>{
 const r=draft().data;review.submitReport(r.id,meta('submit',1));review.reviewReport(r.id,{kind:'data',decision:'return',reason:'revise'},meta('return',2,'data'));review.reviseReport(r.id,[],meta('revise',getStore().psp.ledgerRevision));
 const bad=structuredClone(getStore()),child=bad.psp.reportVersions![1],returned=bad.psp.reportActions![1],createSeq=child.creationLedgerRevision,returnSeq=returned.sequence;
 child.creationLedgerRevision=returnSeq;returned.sequence=createSeq;
 for(const receipt of bad.psp.commandReceipts){if(receipt.ledgerRevision===createSeq){receipt.ledgerRevision=returnSeq;receipt.objectVersion=returnSeq;Object.assign(receipt.result as object,{data:{...child},objectVersion:returnSeq,ledgerRevision:returnSeq});}else if(receipt.ledgerRevision===returnSeq){receipt.ledgerRevision=createSeq;(receipt.result as {ledgerRevision:number}).ledgerRevision=createSeq;}}
 expect(()=>validatePspState(bad.psp)).toThrow();
});
it.each(['creation','permission','snapshot'] as const)('rejects action sequence collision with %s even when receipt agrees',kind=>{
 const r=draft().data;review.submitReport(r.id,meta('submit',1));const bad=structuredClone(getStore()),event=bad.psp.reportActions![0];
 event.sequence=kind==='creation'?r.creationLedgerRevision:kind==='permission'?bad.psp.permissionEvents[0].sequence:bad.psp.snapshots![0].sourceLedgerRevision+1;
 const receipt=bad.psp.commandReceipts.at(-1)!;receipt.ledgerRevision=event.sequence;(receipt.result as {ledgerRevision:number}).ledgerRevision=event.sequence;expect(()=>validatePspState(bad.psp)).toThrow();
});
