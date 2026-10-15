import { z } from 'zod';
import { now } from '@/lib/state/clock';
import { transact } from './transaction';
import { PspError } from './errors';
import type { CommandMeta, PspState, PspAssignment, PspMembershipEvent, PspPermissionEvent } from './types';

function latest<T extends PspMembershipEvent|PspPermissionEvent>(events:T[], enrollmentId:string, at:string, maxSequence:number):T|undefined {
  const epoch=Date.parse(at);
  if(!Number.isFinite(epoch)) throw new PspError(400,'invalid_time','时间格式无效');
  return events.filter(e=>e.enrollmentId===enrollmentId && Date.parse(e.occurredAt)<=epoch && Date.parse(e.recordedAt)<=epoch && e.sequence<=maxSequence)
    .sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||b.sequence-a.sequence)[0];
}
export function permissionAt(state:PspState,enrollmentId:string,scope:'service'|'aggregate',at=now(),maxSequence=state.ledgerRevision):boolean {
  return latest(state.permissionEvents.filter(e=>e.scope===scope),enrollmentId,at,maxSequence)?.action==='grant';
}
export function membershipAt(state:PspState,enrollmentId:string,at=now(),maxSequence=state.ledgerRevision) {
  return latest(state.membershipEvents,enrollmentId,at,maxSequence)?.status ?? 'invited';
}
export function recordPermission(enrollmentId:string,scope:'service'|'aggregate',action:'grant'|'withdraw',meta:CommandMeta) {
  z.enum(['service','aggregate']).parse(scope);z.enum(['grant','withdraw']).parse(action);
  return transact(enrollmentId,{command:'permission',scope,action},meta,['patient'],(s,e,m)=>{
    if(e.status==='exited'&&action==='grant') throw new PspError(409,'invalid_transition','已退出项目，不能重新授权加入');
    const at=now(), sequence=++s.psp.ledgerRevision;
    s.psp.permissionEvents.push({id:`permission:${sequence}`,enrollmentId,scope,action,textVersion:'psp-consent-v1',occurredAt:at,recordedAt:at,actorId:m.actorId,sequence});
    if(scope==='service'&&action==='withdraw'&&e.status==='active') {
      e.status='paused'; const sequence=++s.psp.ledgerRevision;
      s.psp.membershipEvents.push({id:`membership:${sequence}`,enrollmentId,status:'paused',reason:'患者撤回服务授权',occurredAt:at,recordedAt:at,actorId:m.actorId,sequence});
    }
    return {enrollmentId};
  });
}
export const EnrollmentAction=z.object({state:z.enum(['active','invited','paused','exited']),reason:z.string().trim().min(1).max(500),eligibilityConfirmed:z.literal(true).optional()}).strict();
export type EnrollmentAction=z.infer<typeof EnrollmentAction>;
const templates = [
  {kind:'questionnaire',key:'PRO',title:'项目月度问卷',day:13,ownerRole:'patient'},
  {kind:'contact',key:'CONTACT',title:'固定联系随访',day:8,ownerRole:'case_manager'},
  {kind:'education',key:'EDUCATION',title:'患者教育服务',day:10,ownerRole:'case_manager'},
] as const;
function assignFixedPlans(s:PspState,enrollmentId:string,at:string) {
  for(const template of templates) {
    // Predefined project calendar: new enrollees start at the next available slot.
    for(const month of ['10','11','12']) {
      const dueAt=`2026-${month}-${String(template.day).padStart(2,'0')}T01:00:00.000Z`;
      if(Date.parse(dueAt)<Date.parse(at)||Date.parse(dueAt)>Date.parse(s.project.endsAt)) continue;
      const id=`${s.project.id}:${enrollmentId}:${template.key}:2026-${month}`;
      if(!s.assignments.some(a=>a.id===id)) {
        const assignment:PspAssignment={id,projectId:s.project.id,enrollmentId,kind:template.kind,title:template.title,assignedAt:at,assignedRecordedAt:at,assignedSequence:++s.ledgerRevision,dueAt,ownerRole:template.ownerRole,status:'open',version:1,firstValidSubmittedAt:null,latestValidResponseId:null,source:'psp-v1'};
        s.assignments.push(assignment);
      }
      break;
    }
  }
}
export function recordEnrollmentState(enrollmentId:string,rawAction:EnrollmentAction,meta:CommandMeta) {
  const action=EnrollmentAction.parse(rawAction);
  return transact(enrollmentId,{command:'enrollment',...action},meta,['doctor','case_manager','project_manager'],(s,e,m)=>{
    const at=now();
    if(m.role==='doctor') {
      if(!action.eligibilityConfirmed||action.state!==e.status||e.status==='exited') throw new PspError(403,'forbidden','医生仅可确认当前成员的服务适用性');
      e.eligibilityConfirmed=true;e.eligibilityConfirmedAt=at;e.eligibilityConfirmedBy=m.actorId;
      return {enrollmentId};
    }
    if(action.eligibilityConfirmed) throw new PspError(403,'forbidden','服务适用性须由医生确认');
    const allowed:Record<string,string[]>={invited:['active','exited'],active:['paused','exited'],paused:['active','exited'],exited:[]};
    if(!allowed[e.status].includes(action.state)) throw new PspError(409,'invalid_transition','当前成员状态不允许此操作');
    if(action.state==='active') {
      if(!permissionAt(s.psp,enrollmentId,'service',at)||!e.eligibilityConfirmed) throw new PspError(403,'consent_required','激活前须完成服务授权和医生适用性确认');
      if(Date.parse(at)<Date.parse(s.psp.project.startsAt)||Date.parse(at)>Date.parse(s.psp.project.endsAt)) throw new PspError(409,'outside_project','当前不在项目服务期内');
    }
    e.status=action.state;
    const sequence=++s.psp.ledgerRevision;
    s.psp.membershipEvents.push({id:`membership:${sequence}`,enrollmentId,status:action.state,reason:action.reason,occurredAt:at,recordedAt:at,actorId:m.actorId,sequence});
    if(action.state==='active'&&s.psp.membershipEvents.filter(event=>event.enrollmentId===enrollmentId&&event.status==='active').length===1) assignFixedPlans(s.psp,enrollmentId,at);
    return {enrollmentId};
  });
}
