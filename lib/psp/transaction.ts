import { createHash } from 'node:crypto';
import { getStore, replaceStore, type DemoStore } from '@/lib/state/store';
import { hydrateImmutableState } from '@/lib/state/persistence';
import { CommandMeta, validatePspState, validatePspClinicalLinks, type PspEnrollment, type PspRole } from './types';
import { PspError } from './errors';

export const actors:Record<Exclude<PspRole,'patient'>,string> = {
  case_manager:'case-manager-chen', doctor:'doctor-zhang', project_manager:'project-manager-psp',
  data_reviewer:'data-reviewer-psp', medical_reviewer:'medical-reviewer-psp', pharma_owner:'pharma-owner-a',
};
export function requireIdentity(role:string|null, actorId:string|null, allowed:readonly PspRole[], patientId?:string):void {
  if (!role || !actorId || !allowed.includes(role as PspRole) ||
      (role==='patient' ? actorId!==patientId : actors[role as Exclude<PspRole,'patient'>]!==actorId))
    throw new PspError(403,'forbidden','此演示身份无权执行该操作');
}
export type CommandResult<T> = {data:T; objectVersion:number; ledgerRevision:number; seedVersion:number};
const canonical=(value:unknown):string => {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value!==null && typeof value==='object') return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
};
/** Synchronous isolated mutation; the Worker coordinator persists before responding. */
export function transact<T>(enrollmentId:string, body:unknown, rawMeta:CommandMeta, roles:readonly PspRole[], mutate:(store:DemoStore,enrollment:PspEnrollment,meta:CommandMeta)=>T):CommandResult<T> {
  const meta=CommandMeta.parse(rawMeta), current=getStore();
  if(meta.seedVersion!==current.seedVersion) throw new PspError(409,'stale_seed','演示已重置，请刷新后重新操作');
  const enrollment=current.psp.enrollments.find(e=>e.id===enrollmentId);
  if(!enrollment) throw new PspError(404,'not_found','项目成员不存在');
  requireIdentity(meta.role,meta.actorId,roles,enrollment.patientId);
  const scopeKey=JSON.stringify([current.seedVersion,current.psp.project.id,enrollmentId,meta.actorId,meta.clientRequestId]);
  const bodyDigest=createHash('sha256').update(canonical(body)).digest('hex');
  const existing=current.psp.commandReceipts.find(r=>r.scopeKey===scopeKey);
  if(existing) {
    if(existing.bodyDigest!==bodyDigest) throw new PspError(400,'request_reused','同一请求编号不能用于其他操作');
    return structuredClone(existing.result) as CommandResult<T>;
  }
  if(enrollment.version!==meta.expectedVersion) throw new PspError(409,'stale_version','成员状态已更新，请刷新后重试');
  const draft=structuredClone(current), target=draft.psp.enrollments.find(e=>e.id===enrollmentId)!;
  const data=mutate(draft,target,meta);
  target.version++;
  draft.psp.authorizationVersion++;
  // A receipt has its own revision even when eligibility confirmation creates no history event.
  draft.psp.ledgerRevision++;
  const result={data,objectVersion:target.version,ledgerRevision:draft.psp.ledgerRevision,seedVersion:draft.seedVersion};
  draft.psp.commandReceipts.push({id:`receipt:${scopeKey}`,scopeKey,bodyDigest,result,objectVersion:target.version,ledgerRevision:draft.psp.ledgerRevision});
  validatePspState(draft.psp);
  validatePspClinicalLinks(draft.psp,draft.patients.values());
  replaceStore(hydrateImmutableState(draft));
  return structuredClone(result);
}

/** Assignment writes share receipt semantics, without changing membership/authorization CAS. */
export function transactAssignment<T>(assignmentId:string, patientId:string, body:unknown, rawMeta:CommandMeta, mutate:(store:DemoStore,assignment:import('./types').PspAssignment,meta:CommandMeta)=>{data:T;changed:boolean}):CommandResult<T> {
  const meta=CommandMeta.parse(rawMeta),current=getStore();
  if(meta.seedVersion!==current.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新后重新操作');
  const assignment=current.psp.assignments.find(a=>a.id===assignmentId);
  if(!assignment)throw new PspError(404,'not_found','项目计划不存在');
  const enrollment=current.psp.enrollments.find(e=>e.id===assignment.enrollmentId);
  if(!enrollment || enrollment.patientId!==patientId)throw new PspError(403,'forbidden','此演示身份无权执行该操作');
  requireIdentity(meta.role,meta.actorId,['patient'],enrollment.patientId);
  if(assignment.kind!=='questionnaire')throw new PspError(400,'invalid_assignment','仅问卷计划可提交问卷');
  const scopeKey=JSON.stringify([current.seedVersion,current.psp.project.id,assignmentId,meta.actorId,meta.clientRequestId]);
  const bodyDigest=createHash('sha256').update(canonical(body)).digest('hex');
  const existing=current.psp.commandReceipts.find(r=>r.scopeKey===scopeKey);
  if(existing){
    if(existing.bodyDigest!==bodyDigest)throw new PspError(400,'request_reused','同一请求编号不能用于其他操作');
    return structuredClone(existing.result) as CommandResult<T>;
  }
  if(assignment.version!==meta.expectedVersion)throw new PspError(409,'stale_version','计划状态已更新，请刷新后重试');
  const draft=structuredClone(current),target=draft.psp.assignments.find(a=>a.id===assignmentId)!;
  const {data,changed}=mutate(draft,target,meta);
  if(changed)target.version++;
  draft.psp.ledgerRevision++;
  const result={data,objectVersion:target.version,ledgerRevision:draft.psp.ledgerRevision,seedVersion:draft.seedVersion};
  draft.psp.commandReceipts.push({id:`receipt:${scopeKey}`,scopeKey,bodyDigest,result,objectVersion:target.version,ledgerRevision:draft.psp.ledgerRevision});
  validatePspState(draft.psp);
  validatePspClinicalLinks(draft.psp,draft.patients.values());
  replaceStore(hydrateImmutableState(draft));
  return structuredClone(result);
}
