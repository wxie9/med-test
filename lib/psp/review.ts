import {randomUUID} from 'node:crypto';
import {getStore,replaceStore} from '@/lib/state/store';
import {hydrateImmutableState} from '@/lib/state/persistence';
import {now} from '@/lib/state/clock';
import {CommandMeta,validatePspState,type CommandMeta as Meta} from './types';
import {requireIdentity,type CommandResult} from './transaction';
import {PspError} from './errors';
import type {PspReportVersion,NextAction} from './reportTypes';
import {ReviewInputSchema,type ReportReviewInput,type ReportActionEvent,type ReportActionGates} from './reviewTypes';
import {projectReport,reportActionBody,reportActionScope} from './reviewProjection';
import {reportDigest} from './reportValidation';
import {snapshotAggregateUsability} from './snapshotAuthorization';
import {createReportDraft,getReportCreateGate} from './reports';
const readers=['project_manager','data_reviewer','medical_reviewer'] as const;
function target(id:string,seedVersion:number){
 const current=getStore();if(seedVersion!==current.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新后重新操作');
 const report=current.psp.reportVersions?.find(r=>r.id===id&&r.projectId===current.psp.project.id&&r.seedVersion===seedVersion);
 if(!report)throw new PspError(404,'not_found','报告版本不存在');return {current,report};
}
export function getReportActionGates(id:string,role:string|null,actorId:string|null,seedVersion:number):ReportActionGates{
 requireIdentity(role,actorId,readers);const {current,report}=target(id,seedVersion);
 const latest=!current.psp.reportVersions!.some(r=>r.batchId===report.batchId&&r.revision>report.revision);
 const workflow=projectReport(report,(current.psp.reportActions??[]).filter(e=>e.reportVersionId===id)).workflow;
 const reviewKind=role==='data_reviewer'?'data':role==='medical_reviewer'?'medical':null;
 const source=snapshotAggregateUsability(current.psp.snapshots!.find(s=>s.id===report.snapshotId)!,current.psp,now());
 const submitReason=role!=='project_manager'?'仅项目经理可提交审核':!latest?'请操作批次最新报告版本':report.status!=='draft'?'仅草稿可提交审核':!source.usable?source.reason:null;
 const reviewReason=!reviewKind?'仅数据或医学审核人可审核':!latest?'请操作批次最新报告版本':report.status!=='in_review'?'仅审核中的报告可签署或退回':null;
 const duplicate=reviewKind==='data'?!!workflow.dataReview:reviewKind==='medical'?!!workflow.medicalReview:false;
 const create=getReportCreateGate(report.snapshotId,role,actorId,seedVersion,report.id);
 return {canSubmit:submitReason===null,canApprove:reviewReason===null&&!duplicate,canReturn:reviewReason===null,canRevise:create.canCreate,reviewKind,submitReason,reviewReason:reviewReason??(duplicate?'本角色已签署，可由另一审核人继续审核或退回修订':null),reviseReason:create.reason};
}
function run(id:string,input:{action:'submit'}|({action:'review'}&ReportReviewInput),rawMeta:Meta):CommandResult<PspReportVersion>{
 const meta=CommandMeta.parse(rawMeta),{current,report}=target(id,meta.seedVersion);
 requireIdentity(meta.role,meta.actorId,input.action==='submit'?['project_manager']:[`${input.kind}_reviewer`]);
 const scopeKey=JSON.stringify([meta.seedVersion,report.projectId,'report_action',id,meta.actorId,meta.clientRequestId]),bodyDigest=reportDigest(input);
 const receipt=current.psp.commandReceipts.find(r=>r.scopeKey===scopeKey);
 if(receipt){if(receipt.bodyDigest!==bodyDigest)throw new PspError(400,'request_reused','同一请求编号不能用于其他操作');return structuredClone(receipt.result) as CommandResult<PspReportVersion>;}
 if(meta.expectedVersion!==report.version)throw new PspError(409,'stale_version','报告状态已更新，请刷新后重试');
 const gate=getReportActionGates(id,meta.role,meta.actorId,meta.seedVersion);
 if(input.action==='submit'&&!gate.canSubmit){if(report.status==='draft'&&gate.submitReason?.startsWith('快照'))throw new PspError(403,'source_unusable',gate.submitReason);throw new PspError(409,'invalid_state',gate.submitReason!);}
 if(input.action==='review'&&!(input.decision==='approve'?gate.canApprove:gate.canReturn))throw new PspError(409,'invalid_state',gate.reviewReason??'此报告当前不可审核');
 const draft=structuredClone(current),sequence=++draft.psp.ledgerRevision,eventId=`psp-report-action:${randomUUID()}`,at=now();
 const submission=(current.psp.reportActions??[]).find(e=>e.reportVersionId===id&&e.action==='submit');
 const binding={id:eventId,projectId:report.projectId,seedVersion:meta.seedVersion,reportVersionId:id,revision:report.revision,snapshotId:report.snapshotId,snapshotDigest:report.snapshotDigest,contentDigest:report.contentDigest,templateVersion:report.templateVersion,algorithmVersion:report.algorithmVersion,protectionVersion:report.protectionVersion,occurredAt:at,recordedAt:at,actorId:meta.actorId,sequence,previousVersion:report.version,newVersion:report.version+1,clientRequestId:meta.clientRequestId,submissionId:submission?.id??eventId,submittedVersion:submission?.submittedVersion??2};
 const event:ReportActionEvent=input.action==='submit'?{...binding,action:'submit',role:'project_manager'}:{...binding,...input,role:input.kind==='data'?'data_reviewer':'medical_reviewer'};
 draft.psp.reportActions=[...(draft.psp.reportActions??[]),event];
 const updated=projectReport(report,draft.psp.reportActions.filter(e=>e.reportVersionId===id)).report;
 draft.psp.reportVersions=draft.psp.reportVersions!.map(r=>r.id===id?updated:r);
 const result={data:updated,objectVersion:updated.version,ledgerRevision:sequence,seedVersion:meta.seedVersion};
 draft.psp.commandReceipts.push({id:`receipt:${scopeKey}`,scopeKey:reportActionScope(event),bodyDigest:reportDigest(reportActionBody(event)),result:structuredClone(result),objectVersion:updated.version,ledgerRevision:sequence});
 validatePspState(draft.psp);replaceStore(hydrateImmutableState(draft));return structuredClone(result);
}
export const submitReport=(id:string,meta:Meta)=>run(id,{action:'submit'},meta);
export const reviewReport=(id:string,input:ReportReviewInput,meta:Meta)=>run(id,{action:'review',...ReviewInputSchema.parse(input)},meta);
/** New revisions intentionally retain project-ledger CAS and the sole create_report receipt. */
export function reviseReport(id:string,nextActions:NextAction[],rawMeta:Meta):CommandResult<PspReportVersion>{
 const meta=CommandMeta.parse(rawMeta),{report}=target(id,meta.seedVersion);requireIdentity(meta.role,meta.actorId,['project_manager']);
 return createReportDraft(report.snapshotId,{parentVersionId:id,nextActions},meta);
}
