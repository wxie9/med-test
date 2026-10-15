import {createHash,randomUUID} from 'node:crypto';
import {getStore,replaceStore} from '@/lib/state/store';
import {hydrateImmutableState} from '@/lib/state/persistence';
import {now} from '@/lib/state/clock';
import {PspError} from './errors';
import {CommandMeta,validatePspState,validatePspClinicalLinks,type PspState,type PspRole,type CommandMeta as CommandMetaType} from './types';
import {validatePspServiceLinks} from './serviceValidation';
import {validatePspEvidenceLinks} from './evidenceValidation';
import {validatePspMetricEvidenceLinks} from './metricEvidenceValidation';
import {requireIdentity,type CommandResult} from './transaction';
import {computePspMetrics} from './metrics';
import {resolveAggregateGrantProjection} from './aggregateGrantProjection';
import {PSP_METRIC_ALGORITHM_VERSION,type Metric} from './metricTypes';
import {protectMetricGroups,PSP_PROTECTION_VERSION} from './protection';
import {SnapshotWindowSchema,type SnapshotWindow,type SnapshotSource,type SnapshotSourceKind,type SnapshotMetricEvidence,type SnapshotCohortQualification,type SnapshotScope,type PspServiceSnapshot,type PspSnapshotList,type PspSnapshotDetail,type PspMetricEvidence} from './snapshotTypes';
import {snapshotDigest,validatePspSnapshots} from './snapshotValidation';
import {createSnapshotSourceGraph} from './snapshotSourceGraph';

const readers:readonly PspRole[]=['project_manager','data_reviewer','medical_reviewer'];
const writers:readonly PspRole[]=['project_manager','data_reviewer'];
const canonical=(value:unknown):string=>{if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value!==null&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;return JSON.stringify(value);};
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const known=(recordedAt:string,sequence:number,cutoff:number,revision:number)=>sequence<=revision&&Date.parse(recordedAt)<=cutoff;
const clone=<T>(value:T):T=>structuredClone(value);
type Candidate=SnapshotSource&{enrollmentId?:string;assignmentId?:string;contentVersionId?:string;sourceRefId?:string;revisionOf?:string;questionnaireEvidenceId?:string};

function collectSources(state:PspState,window:SnapshotWindow,revision:number,metrics:Record<SnapshotScope,Metric[]>,cohorts:Record<SnapshotScope,Map<string,string[]>>,qualifications:Record<SnapshotScope,Map<string,SnapshotCohortQualification[]>>):{sources:SnapshotSource[];evidence:SnapshotMetricEvidence[]}{
 const cutoff=Date.parse(window.cutoffAt),candidates=new Map<string,Candidate>();
 const legacyByAssignment=new Map([...qualifications.aggregate.values()].flatMap(items=>items.filter((item):item is Extract<SnapshotCohortQualification,{basis:'legacy_gap'}>=>item.basis==='legacy_gap').map(item=>[item.ref,item] as const)));
 const add=(kind:SnapshotSourceKind,ref:string,locator:string,value:Record<string,unknown>,links:Omit<Candidate,'kind'|'ref'|'locator'|'value'>={})=>{if(candidates.has(ref))throw new Error(`Duplicate snapshot source reference ${ref}`);candidates.set(ref,{kind,ref,locator,value:clone(value),...links});};
 for(const e of state.enrollments)if(e.projectId===state.project.id)add('enrollment',e.id,`psp.enrollments[id=${e.id}]`,{id:e.id,projectId:e.projectId});
 for(const e of state.membershipEvents)if(known(e.recordedAt,e.sequence,cutoff,revision))add('membership',e.id,`psp.membershipEvents[id=${e.id}]`,e,{enrollmentId:e.enrollmentId});
 for(const e of state.permissionEvents)if(known(e.recordedAt,e.sequence,cutoff,revision))add('permission',e.id,`psp.permissionEvents[id=${e.id}]`,e,{enrollmentId:e.enrollmentId});
 for(const a of state.assignments)if(a.projectId===state.project.id&&Date.parse(a.assignedAt)<=cutoff&&(a.assignedSequence===undefined||a.assignedSequence<=revision))add('assignment',a.id,`psp.assignments[id=${a.id}]`,{id:a.id,projectId:a.projectId,enrollmentId:a.enrollmentId,kind:a.kind,title:a.title,assignedAt:a.assignedAt,dueAt:a.dueAt,ownerRole:a.ownerRole,source:a.source,...(a.assignedRecordedAt&&a.assignedSequence?{assignedRecordedAt:a.assignedRecordedAt,assignedSequence:a.assignedSequence}:{birthEvidence:Date.parse(a.assignedAt)===Date.parse(state.project.startsAt)?'seed_fixed':'unproven_legacy'}),...(legacyByAssignment.has(a.id)?{legacyFirstValidSubmittedAt:legacyByAssignment.get(a.id)!.firstValidSubmittedAt,legacyEvidenceGap:true}:{})},{enrollmentId:a.enrollmentId});
 for(const e of state.assignmentCancellations??[])if(known(e.recordedAt,e.sequence,cutoff,revision))add('assignmentCancellation',e.id,`psp.assignmentCancellations[id=${e.id}]`,e,{enrollmentId:e.enrollmentId,assignmentId:e.assignmentId});
 for(const e of state.serviceEvents)if(known(e.recordedAt,e.sequence,cutoff,revision))add('contact',e.id,`psp.serviceEvents[id=${e.id}]`,e,{enrollmentId:e.enrollmentId,assignmentId:e.assignmentId});
 for(const e of state.corrections??[])if(e.status==='verified'&&e.verificationSequence!==null&&e.verifiedAt!==null&&known(e.verifiedAt,e.verificationSequence,cutoff,revision))add('correction',e.id,`psp.corrections[id=${e.id}]`,e,{enrollmentId:e.enrollmentId,assignmentId:e.assignmentId,sourceRefId:e.sourceRef.id});
 for(const e of state.questionnaireEvidence??[])if(known(e.recordedAt,e.sequence,cutoff,revision)){
  add('questionnaireEvidence',e.id,`psp.questionnaireEvidence[id=${e.id}]`,{id:e.id,projectId:e.projectId,enrollmentId:e.enrollmentId,assignmentId:e.assignmentId,responseId:e.responseId,scaleId:e.scaleId,occurredAt:e.occurredAt,recordedAt:e.recordedAt,actorId:e.actorId,sequence:e.sequence,stopIntent:e.stopIntent,...(e.revisionOf?{revisionOf:e.revisionOf}:{})},{enrollmentId:e.enrollmentId,assignmentId:e.assignmentId,revisionOf:e.revisionOf});
  for(const alert of e.alerts)if(Date.parse(alert.triggeredAt)<=cutoff)add('alertBirth',alert.id,`psp.questionnaireEvidence[id=${e.id}].alerts[id=${alert.id}]`,{...alert,projectId:e.projectId,enrollmentId:e.enrollmentId,questionnaireEvidenceId:e.id,sequence:e.sequence},{enrollmentId:e.enrollmentId,assignmentId:e.assignmentId,questionnaireEvidenceId:e.id});
 }
 for(const e of state.alertActions??[])if(known(e.recordedAt,e.sequence,cutoff,revision))add('alertAction',e.id,`psp.alertActions[id=${e.id}]`,e,{enrollmentId:e.enrollmentId});
 for(const e of state.educationEvents??[])if(known(e.recordedAt,e.sequence,cutoff,revision))add('educationEvent',e.id,`psp.educationEvents[id=${e.id}]`,e,{enrollmentId:e.enrollmentId,assignmentId:e.assignmentId,contentVersionId:e.contentVersionId});
 for(const c of state.educationContents)if(Date.parse(c.approvedAt)<=cutoff)add('educationContent',c.id,`psp.educationContents[id=${c.id}]`,{id:c.id,version:c.version,title:c.title,scope:c.scope,status:c.status,approvedAt:c.approvedAt,approvedBy:c.approvedBy});
 for(const e of state.educationResults)if(e.sequence<=revision&&Date.parse(e.sentAt)<=cutoff){
  const a=state.assignments.find(a=>a.id===e.assignmentId);if(!a)continue;
  const openedAt=e.openedAt&&Date.parse(e.openedAt)<=cutoff?e.openedAt:null,feedbackAt=e.feedbackAt&&Date.parse(e.feedbackAt)<=cutoff?e.feedbackAt:null;
  add('educationResult',`education-result:${e.assignmentId}:${e.sequence}`,`psp.educationResults[assignmentId=${e.assignmentId},sequence=${e.sequence}]`,{assignmentId:e.assignmentId,contentVersionId:e.contentVersionId,sentAt:e.sentAt,openedAt,feedbackAt,understood:feedbackAt?e.understood:null,needsHelp:feedbackAt?e.needsHelp:null,actorId:e.actorId,sequence:e.sequence,projectId:a.projectId,enrollmentId:a.enrollmentId},{enrollmentId:a.enrollmentId,assignmentId:e.assignmentId,contentVersionId:e.contentVersionId});
 }
 for(const e of state.selfReportRevisions??[])if(known(e.recordedAt,e.sequence,cutoff,revision))add('selfReport',e.sourceId,`psp.selfReportRevisions[sourceId=${e.sourceId}]`,e,{enrollmentId:e.enrollmentId,revisionOf:e.revisionOf});
 const graph=createSnapshotSourceGraph([...candidates.values()],{projectId:state.project.id,projectStartsAt:state.project.startsAt,projectEndsAt:state.project.endsAt,window,sourceLedgerRevision:revision}),include=new Set<string>();
 const evidence:SnapshotMetricEvidence[]=[];
 for(const scope of ['internal','aggregate'] as const)for(const metric of metrics[scope]){
  const direct=[...metric.sourceRefs],cohortRefs=cohorts[scope].get(metric.key)??[],cohortQualifications=qualifications[scope].get(metric.key)??[];
  const closure=graph.closure([...direct,...cohortRefs,...cohortQualifications.flatMap(q=>q.basis==='historical_result'?[q.sourceRef]:q.basis==='legacy_gap'&&q.firstTypedSourceRef?[q.firstTypedSourceRef]:[])]);for(const ref of closure)include.add(ref);
  evidence.push({scope,metricKey:metric.key,sourceRefs:direct,cohortRefs,cohortQualifications,supportingRefs:closure.filter(ref=>!direct.includes(ref))});
 }
 const sources=[...include].sort().map(ref=>{const {kind,locator,value}=candidates.get(ref)!;return {kind,ref,locator,value};});
 return {sources,evidence};
}

function assertSnapshot(snapshotId:string,role:string|null,actorId:string|null,seedVersion?:number){
 requireIdentity(role,actorId,readers);
 const current=getStore();if(seedVersion!==undefined&&seedVersion!==current.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新后重新操作');
 const snapshot=current.psp.snapshots?.find(s=>s.id===snapshotId&&s.seedVersion===current.seedVersion&&s.projectId===current.psp.project.id);
 if(!snapshot)throw new PspError(404,'not_found','服务快照不存在');return {current,snapshot};
}
export function listPspSnapshots(projectId:string,role:string|null,actorId:string|null):PspSnapshotList{
 requireIdentity(role,actorId,readers);const current=getStore();if(projectId!==current.psp.project.id)throw new PspError(404,'not_found','项目不存在');
 return {project:clone(current.psp.project),serverNow:now(),seedVersion:current.seedVersion,ledgerRevision:current.psp.ledgerRevision,authorizationVersion:current.psp.authorizationVersion,summaries:(current.psp.snapshots??[]).map(({id,projectId,window,createdAt,createdBy,sourceLedgerRevision})=>({id,projectId,window:clone(window),createdAt,createdBy,sourceLedgerRevision}))};
}
export function getPspSnapshot(snapshotId:string,role:string|null,actorId:string|null,seedVersion?:number):PspSnapshotDetail{
 const {current,snapshot}=assertSnapshot(snapshotId,role,actorId,seedVersion);return {snapshot:clone(snapshot),seedVersion:current.seedVersion,ledgerRevision:current.psp.ledgerRevision,serverNow:now()};
}
export function getMetricEvidence(snapshotId:string,metricKey:string,scope:SnapshotScope='internal',role:string|null,actorId:string|null,seedVersion?:number):PspMetricEvidence{
 const {current,snapshot}=assertSnapshot(snapshotId,role,actorId,seedVersion);
 if(scope!=='internal'&&scope!=='aggregate')throw new PspError(400,'invalid_input','来源范围无效');
 const metric=(scope==='internal'?snapshot.internalMetrics:snapshot.aggregateMetrics).find(m=>m.key===metricKey),evidence=snapshot.evidence.find(e=>e.scope===scope&&e.metricKey===metricKey);
 if(!metric||!evidence)throw new PspError(404,'not_found','指标来源不存在');const refs=new Set([...evidence.sourceRefs,...evidence.supportingRefs]);
 return {snapshotId,scope,metric:clone(metric),sourceRefs:[...evidence.sourceRefs],cohortRefs:[...evidence.cohortRefs],cohortQualifications:clone(evidence.cohortQualifications),supportingRefs:[...evidence.supportingRefs],sources:snapshot.sources.filter(s=>refs.has(s.ref)).map(clone),seedVersion:current.seedVersion};
}
export function freezePspSnapshot(projectId:string,window:SnapshotWindow,rawMeta:CommandMetaType):CommandResult<PspServiceSnapshot>{
 const meta=CommandMeta.parse(rawMeta),current=getStore();
 if(meta.seedVersion!==current.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新后重新操作');
 if(projectId!==current.psp.project.id)throw new PspError(404,'not_found','项目不存在');requireIdentity(meta.role,meta.actorId,writers);
 const parsed=SnapshotWindowSchema.parse(window),start=Date.parse(parsed.periodStart),end=Date.parse(parsed.periodEnd),cutoff=Date.parse(parsed.cutoffAt),createdAt=now();
 if(end<=start||cutoff<start||cutoff>Date.parse(createdAt))throw new PspError(400,'invalid_time','快照窗口或截止时间无效');
 const normalized={periodStart:new Date(start).toISOString(),periodEnd:new Date(end).toISOString(),cutoffAt:new Date(cutoff).toISOString()};
 const scopeKey=JSON.stringify([current.seedVersion,projectId,'freeze',meta.actorId,meta.clientRequestId]),bodyDigest=digest(normalized);
 const existing=current.psp.commandReceipts.find(r=>r.scopeKey===scopeKey);
 if(existing){if(existing.bodyDigest!==bodyDigest)throw new PspError(400,'request_reused','同一请求编号不能用于其他操作');return clone(existing.result) as CommandResult<PspServiceSnapshot>;}
 if(meta.expectedVersion!==current.psp.ledgerRevision)throw new PspError(409,'stale_version','项目账本已更新，请刷新后重试');
 const draft=clone(current),revision=draft.psp.ledgerRevision;
 const cohorts:Record<SnapshotScope,Map<string,string[]>>={internal:new Map(),aggregate:new Map()},qualifications:Record<SnapshotScope,Map<string,SnapshotCohortQualification[]>>={internal:new Map(),aggregate:new Map()};
 const internalMetrics=computePspMetrics(draft.psp,{projectId,...normalized,scope:'internal',ledgerRevision:revision},(key,refs,items)=>{cohorts.internal.set(key,refs);qualifications.internal.set(key,items??[]);});
 const aggregateMetrics=computePspMetrics(resolveAggregateGrantProjection(draft.psp,{asOf:createdAt,maxSequence:revision}),{projectId,...normalized,scope:'aggregate',ledgerRevision:revision},(key,refs,items)=>{cohorts.aggregate.set(key,refs);qualifications.aggregate.set(key,items??[]);});
 const protectedMetrics=protectMetricGroups(aggregateMetrics),{sources,evidence}=collectSources(draft.psp,normalized,revision,{internal:internalMetrics,aggregate:aggregateMetrics},cohorts,qualifications);
 const body:Omit<PspServiceSnapshot,'contentDigest'>={id:`psp-snapshot:${randomUUID()}`,version:1,projectId,project:clone(draft.psp.project),seedVersion:draft.seedVersion,createdAt,createdBy:meta.actorId,sourceLedgerRevision:revision,authorizationVersionAtFreeze:draft.psp.authorizationVersion,aggregateAuthorizationPolicy:'current_grants_v1',window:normalized,algorithmVersion:PSP_METRIC_ALGORITHM_VERSION,protectionVersion:PSP_PROTECTION_VERSION,internalMetrics,aggregateMetrics,protectedMetrics,sources,evidence};
 const snapshot:PspServiceSnapshot={...body,contentDigest:snapshotDigest(body)};
 draft.psp.snapshots=[...(draft.psp.snapshots??[]),snapshot];draft.psp.ledgerRevision++;
 const result={data:snapshot,objectVersion:draft.psp.ledgerRevision,ledgerRevision:draft.psp.ledgerRevision,seedVersion:draft.seedVersion};
 draft.psp.commandReceipts.push({id:`receipt:${scopeKey}`,scopeKey,bodyDigest,result:clone(result),objectVersion:result.objectVersion,ledgerRevision:result.ledgerRevision});
 validatePspState(draft.psp);validatePspSnapshots(draft.psp,draft.seedVersion);validatePspClinicalLinks(draft.psp,draft.patients.values());validatePspServiceLinks(draft);validatePspEvidenceLinks(draft);validatePspMetricEvidenceLinks(draft);
 replaceStore(hydrateImmutableState(draft));return clone(result);
}
