import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getStore,replaceStore} from '@/lib/state/store';
import {hydrateImmutableState} from '@/lib/state/persistence';
import {now} from '@/lib/state/clock';
import {CommandMeta,validatePspState,type CommandMeta as Meta} from './types';
import {requireIdentity,type CommandResult} from './transaction';
import {PspError} from './errors';
import type {PspReportVersion} from './reportTypes';
import type {ReportActionEvent} from './reviewTypes';
import type {PharmaActionReceipt} from './deliveryTypes';
import {projectReport,reportActionBody,reportActionScope,publicActionReceipt} from './reviewProjection';
import {reportDigest} from './reportValidation';
import {buildDeliveryArtifact} from './deliveryArtifact';
import {reportAuthorizationGate} from './reportGates';
export function getReportDeliveryGate(id:string,role:string|null,actorId:string|null,seedVersion:number){
 requireIdentity(role,actorId,['project_manager','data_reviewer','medical_reviewer']);const {current,report}=target(id,seedVersion);
 const latest=!current.psp.reportVersions!.some(r=>r.batchId===report.batchId&&r.revision>report.revision),gate=reportAuthorizationGate(report,current.psp,now());
 const reason=role!=='project_manager'?'仅项目经理可交付':!latest?'请操作批次最新报告版本':report.status!=='approved'?'仅双签审核通过版本可交付':gate.status!=='eligible'?gate.reason:null;
 return {canDeliver:reason===null,reason};
}
function target(id:string,seedVersion:number){const current=getStore();if(seedVersion!==current.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新后重试');const report=current.psp.reportVersions?.find(r=>r.id===id&&r.projectId===current.psp.project.id&&r.seedVersion===seedVersion);if(!report)throw new PspError(404,'not_found','报告版本不存在');return {current,report};}

function run(id:string,input:{action:'deliver'}|{action:'accept'|'request_changes';comment:string},rawMeta:Meta):CommandResult<PspReportVersion|PharmaActionReceipt>{
 const meta=CommandMeta.parse(rawMeta);requireIdentity(meta.role,meta.actorId,input.action==='deliver'?['project_manager']:['pharma_owner']);const {current,report}=target(id,meta.seedVersion);
 const scopeKey=JSON.stringify([meta.seedVersion,report.projectId,'report_action',id,meta.actorId,meta.clientRequestId]),bodyDigest=reportDigest(input),receipt=current.psp.commandReceipts.find(r=>r.scopeKey===scopeKey);
 if(receipt){if(receipt.bodyDigest!==bodyDigest)throw new PspError(400,'request_reused','同一请求编号不能用于其他操作');return structuredClone(receipt.result) as CommandResult<PspReportVersion|PharmaActionReceipt>;}
 if(meta.expectedVersion!==report.version)throw new PspError(409,'stale_version','报告状态已更新，请刷新后重试');
 const authorization=reportAuthorizationGate(report,current.psp,now());if(authorization.status!=='eligible')throw new PspError(403,'source_unusable',authorization.reason!);
 if(input.action==='deliver'){const gate=getReportDeliveryGate(id,meta.role,meta.actorId,meta.seedVersion);if(!gate.canDeliver)throw new PspError(409,'invalid_state',gate.reason!);}else if(report.status!=='delivered')throw new PspError(409,'invalid_state','仅已交付版本可验收或请求修改');
 const draft=structuredClone(current),sequence=++draft.psp.ledgerRevision,eventId=`psp-report-action:${randomUUID()}`,at=now(),history=(current.psp.reportActions??[]).filter(e=>e.reportVersionId===id),workflow=projectReport(report,history).workflow;
 const binding={id:eventId,projectId:report.projectId,seedVersion:meta.seedVersion,reportVersionId:id,revision:report.revision,snapshotId:report.snapshotId,snapshotDigest:report.snapshotDigest,contentDigest:report.contentDigest,templateVersion:report.templateVersion,algorithmVersion:report.algorithmVersion,protectionVersion:report.protectionVersion,occurredAt:at,recordedAt:at,actorId:meta.actorId,sequence,previousVersion:report.version,newVersion:report.version+1,clientRequestId:meta.clientRequestId,submissionId:workflow.submission!.id,submittedVersion:workflow.submission!.submittedVersion};
 let event:ReportActionEvent;
 if(input.action==='deliver'){
  const artifact=buildDeliveryArtifact(report,binding,[workflow.dataReview!,workflow.medicalReview!]);
  event={...binding,action:'deliver',role:'project_manager',artifactDigest:artifact.digest};draft.psp.deliveryArtifacts=[...(draft.psp.deliveryArtifacts??[]),artifact];
 }else event={...binding,action:input.action,role:'pharma_owner',deliveryId:workflow.delivery!.id,artifactDigest:workflow.delivery!.artifactDigest,comment:input.comment};
 draft.psp.reportActions=[...(draft.psp.reportActions??[]),event];const updated=projectReport(report,[...history,event]).report;draft.psp.reportVersions=draft.psp.reportVersions!.map(r=>r.id===id?updated:r);
 const data=event.action==='accept'||event.action==='request_changes'?publicActionReceipt(updated,event):updated,result={data,objectVersion:updated.version,ledgerRevision:sequence,seedVersion:meta.seedVersion};
 draft.psp.commandReceipts.push({id:`receipt:${scopeKey}`,scopeKey:reportActionScope(event),bodyDigest:reportDigest(reportActionBody(event)),result:structuredClone(result),objectVersion:updated.version,ledgerRevision:sequence});
 validatePspState(draft.psp);replaceStore(hydrateImmutableState(draft));return structuredClone(result);
}
export const deliverReport=(id:string,meta:Meta)=>run(id,{action:'deliver'},meta) as CommandResult<PspReportVersion>;
export const acceptReport=(id:string,comment:string|undefined,meta:Meta)=>run(id,{action:'accept',comment:z.string().trim().max(1000).parse(comment??'')},meta) as CommandResult<PharmaActionReceipt>;
export const requestClientChanges=(id:string,reason:string,meta:Meta)=>run(id,{action:'request_changes',comment:z.string().trim().min(1).max(1000).parse(reason)},meta) as CommandResult<PharmaActionReceipt>;
