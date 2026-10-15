import {getReportActionGates} from './review';
import {projectReport} from './reviewProjection';
import {randomUUID} from 'node:crypto';
import {getStore,replaceStore} from '@/lib/state/store';
import {hydrateImmutableState} from '@/lib/state/persistence';
import {now} from '@/lib/state/clock';
import {PspError} from './errors';
import {CommandMeta,validatePspState,type CommandMeta as CommandMetaType,type PspRole} from './types';
import {requireIdentity,type CommandResult} from './transaction';
import {ReportDraftInputSchema,type ReportDraftInput,type PspReportVersion,type PspReportSummary,type PspReportList,type PspReportDetail,type ReportCreateGate} from './reportTypes';
import {normalizeReportActions,renderReportContent,REPORT_TEMPLATE_VERSION} from './reportTemplate';
import {reportBatchId,reportContentDigest,reportDigest} from './reportValidation';
import {snapshotAggregateUsability} from './snapshotAuthorization';
const readers:readonly PspRole[]=['project_manager','data_reviewer','medical_reviewer'];
const clone=<T>(value:T):T=>structuredClone(value);
function snapshotFor(id:string,seedVersion:number){
 const current=getStore();if(seedVersion!==current.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新后重新操作');
 const snapshot=current.psp.snapshots?.find(s=>s.id===id&&s.seedVersion===seedVersion&&s.projectId===current.psp.project.id);
 if(!snapshot)throw new PspError(404,'not_found','服务快照不存在');return {current,snapshot};
}
function assertParent(snapshotId:string,parentVersionId?:string){
 const {current,snapshot}=snapshotFor(snapshotId,getStore().seedVersion),batchId=reportBatchId(snapshot.projectId,snapshot.window);
 const parent=parentVersionId?current.psp.reportVersions?.find(r=>r.id===parentVersionId):undefined;
 if(parentVersionId&&!parent)throw new PspError(404,'not_found','父报告版本不存在');
 if(parent&&(parent.batchId!==batchId||parent.seedVersion!==snapshot.seedVersion||parent.projectId!==snapshot.projectId))throw new PspError(400,'invalid_input','修订须属于相同项目、演示版本与报告期间');
 const latest=current.psp.reportVersions?.filter(r=>r.batchId===batchId).sort((a,b)=>b.revision-a.revision)[0];
 if(latest?.id!==parent?.id||parent&&!['draft','changes_requested'].includes(parent.status))throw new PspError(409,'stale_parent','报告批次已更新，请选择最新可修订版本');
 return {parent,batchId};
}
export function getReportCreateGate(snapshotId:string,role:string|null,actorId:string|null,seedVersion:number,parentVersionId?:string):ReportCreateGate{
 requireIdentity(role,actorId,readers);const {current,snapshot}=snapshotFor(snapshotId,seedVersion);
 if(role!=='project_manager')return {canCreate:false,reason:'仅项目经理可生成或修订模板草稿'};
 try{assertParent(snapshotId,parentVersionId);}catch(error){if(error instanceof PspError)return {canCreate:false,reason:error.message};throw error;}
 const gate=snapshotAggregateUsability(snapshot,current.psp,now());return {canCreate:gate.usable,reason:gate.reason};
}
export function createReportDraft(snapshotId:string,rawInput:ReportDraftInput,rawMeta:CommandMetaType):CommandResult<PspReportVersion>{
 const meta=CommandMeta.parse(rawMeta),input=ReportDraftInputSchema.parse(rawInput),{current,snapshot}=snapshotFor(snapshotId,meta.seedVersion);
 requireIdentity(meta.role,meta.actorId,['project_manager']);
 // Resolve identity and referenced parent before replay; mutable authorization/head guards follow replay.
 if(input.parentVersionId&&!current.psp.reportVersions?.some(r=>r.id===input.parentVersionId&&r.projectId===snapshot.projectId&&r.seedVersion===meta.seedVersion))throw new PspError(404,'not_found','父报告版本不存在');
 const nextActions=normalizeReportActions(snapshot,input.nextActions),body={snapshotId,parentVersionId:input.parentVersionId,nextActions};
 const scopeKey=JSON.stringify([current.seedVersion,snapshot.projectId,'create_report',meta.actorId,meta.clientRequestId]),bodyDigest=reportDigest(body),receipt=current.psp.commandReceipts.find(r=>r.scopeKey===scopeKey);
 if(receipt){if(receipt.bodyDigest!==bodyDigest)throw new PspError(400,'request_reused','同一请求编号不能用于其他操作');return clone(receipt.result) as CommandResult<PspReportVersion>;}
 if(meta.expectedVersion!==current.psp.ledgerRevision)throw new PspError(409,'stale_version','项目账本已更新，请刷新后重试');
 const {parent,batchId}=assertParent(snapshotId,input.parentVersionId),gate=snapshotAggregateUsability(snapshot,current.psp,now());
 if(!gate.usable)throw new PspError(403,'source_unusable',gate.reason!);
 const draft=clone(current),content=renderReportContent(snapshot,nextActions),creationLedgerRevision=++draft.psp.ledgerRevision;
 const base={id:`psp-report:${randomUUID()}`,projectId:snapshot.projectId,seedVersion:snapshot.seedVersion,batchId,revision:(parent?.revision??0)+1,...(parent?{parentVersionId:parent.id}:{}),snapshotId,snapshotDigest:snapshot.contentDigest,window:clone(snapshot.window),templateVersion:REPORT_TEMPLATE_VERSION,algorithmVersion:snapshot.algorithmVersion,protectionVersion:snapshot.protectionVersion,content,factIds:content.chapters.flatMap(c=>c.facts.map(f=>f.id)),nextActions,createdAt:now(),createdBy:meta.actorId,creationLedgerRevision,status:'draft' as const,version:1 as const};
 const report:PspReportVersion={...base,contentDigest:reportContentDigest(base)};
 draft.psp.reportVersions=[...(draft.psp.reportVersions??[]),report];
 const result={data:report,objectVersion:creationLedgerRevision,ledgerRevision:creationLedgerRevision,seedVersion:draft.seedVersion};
 draft.psp.commandReceipts.push({id:`receipt:${scopeKey}`,scopeKey,bodyDigest,result:clone(result),objectVersion:creationLedgerRevision,ledgerRevision:creationLedgerRevision});
 validatePspState(draft.psp);replaceStore(hydrateImmutableState(draft));return clone(result);
}
export function listInternalReports(projectId:string,role:string|null,actorId:string|null):PspReportList{
 requireIdentity(role,actorId,readers);const current=getStore();if(projectId!==current.psp.project.id)throw new PspError(404,'not_found','项目不存在');
 const summaries:PspReportSummary[]=(current.psp.reportVersions??[]).map(({id,projectId,batchId,revision,parentVersionId,snapshotId,window,createdAt,createdBy,status,contentDigest})=>({id,projectId,batchId,revision,...(parentVersionId?{parentVersionId}:{}),snapshotId,window:clone(window),createdAt,createdBy,status,contentDigest}));
 return {project:clone(current.psp.project),seedVersion:current.seedVersion,ledgerRevision:current.psp.ledgerRevision,serverNow:now(),summaries};
}
export function readInternalReport(versionId:string,role:string|null,actorId:string|null,seedVersion:number):PspReportDetail{
 requireIdentity(role,actorId,readers);const current=getStore();if(seedVersion!==current.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新后重新操作');
 const report=current.psp.reportVersions?.find(r=>r.id===versionId&&r.seedVersion===seedVersion&&r.projectId===current.psp.project.id);if(!report)throw new PspError(404,'not_found','报告版本不存在');
 return {report:clone(report),workflow:clone(projectReport(report,(current.psp.reportActions??[]).filter(e=>e.reportVersionId===report.id)).workflow),actionGates:getReportActionGates(report.id,role,actorId,seedVersion),createGate:getReportCreateGate(report.snapshotId,role,actorId,seedVersion,report.id),warnings:report.nextActions.length?[]:['下一期服务安排尚未补充，待人工审核'],seedVersion,ledgerRevision:current.psp.ledgerRevision,serverNow:now()};
}
