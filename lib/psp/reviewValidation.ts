import type {PspState} from './types';
import {ReportActionEventSchema} from './reviewTypes';
import {projectReport,reportActionBody,reportActionScope} from './reviewProjection';
import {reportCanonical,reportDigest} from './reportValidation';
import {buildDeliveryArtifact} from './deliveryArtifact';
import {publicActionReceipt} from './reviewProjection';
import {snapshotAggregateUsability} from './snapshotAuthorization';
const same=(a:unknown,b:unknown)=>reportCanonical(a)===reportCanonical(b);
/** Validate reciprocal history at each ledger prefix, never against current permission. */
export function validateReportActions(state:PspState):void{
 const events=state.reportActions??[],reports=state.reportVersions??[];
 if(new Set(events.map(e=>e.id)).size!==events.length||new Set(events.map(e=>e.sequence)).size!==events.length)throw new Error('Duplicate PSP report action');
 for(let i=0;i<events.length;i++){
  const e=ReportActionEventSchema.parse(events[i]),r=reports.find(r=>r.id===e.reportVersionId);
  if(!r||i>0&&e.sequence<=events[i-1].sequence||e.sequence>state.ledgerRevision)throw new Error('Invalid PSP report action target/order');
  for(const field of ['projectId','seedVersion','revision','snapshotId','snapshotDigest','contentDigest','templateVersion','algorithmVersion','protectionVersion'] as const)if(e[field]!==r[field])throw new Error('Invalid PSP report action binding');
  if(e.action==='submit'||e.action==='deliver'?e.role!=='project_manager'||e.actorId!=='project-manager-psp':e.action==='review'?e.role!==`${e.kind}_reviewer`||e.actorId!==`${e.kind}-reviewer-psp`:e.role!=='pharma_owner'||e.actorId!=='pharma-owner-a')throw new Error('Invalid PSP report action identity');
  if(reports.some(other=>other.batchId===r.batchId&&other.revision>r.revision&&other.creationLedgerRevision<e.sequence))throw new Error('PSP report action is not latest head');
  if(e.action==='submit'||e.action==='deliver'||e.action==='accept'||e.action==='request_changes'){
   const snapshot=state.snapshots!.find(s=>s.id===r.snapshotId)!;
   const prefix={...state,ledgerRevision:e.sequence-1,permissionEvents:state.permissionEvents.filter(p=>p.sequence<e.sequence)};
   if(!snapshotAggregateUsability(snapshot,prefix,e.recordedAt).usable)throw new Error('Invalid historical PSP report submission authorization');
  }
  const projection=projectReport(r,events.filter(a=>a.reportVersionId===r.id&&a.sequence<=e.sequence)).report;
  const receipts=state.commandReceipts.filter(receipt=>receipt.scopeKey===reportActionScope(e));
  if(receipts.length!==1)throw new Error('PSP report action receipt missing or duplicated');
  const receipt=receipts[0],result={data:e.action==='accept'||e.action==='request_changes'?publicActionReceipt(projection,e):projection,objectVersion:e.newVersion,ledgerRevision:e.sequence,seedVersion:e.seedVersion};
  if(receipt.id!==`receipt:${receipt.scopeKey}`||receipt.bodyDigest!==reportDigest(reportActionBody(e))||receipt.objectVersion!==e.newVersion||receipt.ledgerRevision!==e.sequence||!same(receipt.result,result)||state.commandReceipts.filter(r=>r.ledgerRevision===e.sequence).length!==1)throw new Error('Invalid PSP report action receipt');
 }
 for(const receipt of state.commandReceipts){let scope:unknown;try{scope=JSON.parse(receipt.scopeKey);}catch{continue;}if(Array.isArray(scope)&&scope[2]==='report_action'&&!events.some(e=>reportActionScope(e)===receipt.scopeKey))throw new Error('Orphan PSP report action receipt');}
 const artifacts=state.deliveryArtifacts??[],deliveries=events.filter(e=>e.action==='deliver');
 if(new Set(artifacts.map(a=>a.reportVersionId)).size!==artifacts.length||artifacts.length!==deliveries.length)throw new Error('Invalid PSP delivery artifact count');
 for(const e of deliveries){
  const report=reports.find(r=>r.id===e.reportVersionId)!,artifact=artifacts.find(a=>a.reportVersionId===report.id);
  const workflow=projectReport(report,events.filter(a=>a.reportVersionId===report.id&&a.sequence<e.sequence)).workflow;
  const expected=buildDeliveryArtifact(report,e,[workflow.dataReview!,workflow.medicalReview!]);
  if(!artifact||!same(artifact,expected)||e.artifactDigest!==expected.digest)throw new Error('Invalid PSP delivery artifact');
 }
 for(const report of reports){
  const projected=projectReport(report,events.filter(e=>e.reportVersionId===report.id)).report;
  if(!same(projected,report))throw new Error('Invalid PSP report materialized lifecycle');
  if(report.parentVersionId){
   const parent=reports.find(r=>r.id===report.parentVersionId)!;
   const prior=projectReport(parent,events.filter(e=>e.reportVersionId===parent.id&&e.sequence<report.creationLedgerRevision)).report;
   if(!['draft','changes_requested','client_changes_requested'].includes(prior.status)){
    const snapshot=state.snapshots!.find(s=>s.id===parent.snapshotId)!;
    const prefix={...state,ledgerRevision:report.creationLedgerRevision-1,permissionEvents:state.permissionEvents.filter(p=>p.sequence<report.creationLedgerRevision)};
    if(!['approved','delivered','accepted'].includes(prior.status)||snapshotAggregateUsability(snapshot,prefix,report.createdAt).usable)throw new Error('Invalid PSP report parent lifecycle at creation');
   }
  }
 }
}
