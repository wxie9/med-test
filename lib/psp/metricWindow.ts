import type {PspAssignment,PspState} from './types';
import type {MetricOptions} from './metricTypes';
import {membershipAt,permissionAt} from './permissions';
import {PspError} from './errors';
import {z} from 'zod';
export type MetricWindow={options:MetricOptions;inWindow:(at:string)=>boolean;known:(recordedAt:string,sequence:number)=>boolean;qualifiedAt:(enrollmentId:string,at:string,sequence?:number,scope?:MetricOptions['scope'])=>boolean;periodMember:(enrollmentId:string)=>boolean;assignmentKnown:(assignment:PspAssignment)=>boolean;dueApplicable:(assignment:PspAssignment)=>boolean;scopeSourceRefs:(enrollmentId:string)=>string[]};
/** Pure historical qualification shared by every PSP metric family. */
export function createMetricWindow(state:PspState,raw:MetricOptions):MetricWindow {
 if(raw.projectId!==state.project.id)throw new PspError(404,'not_found','指标项目不存在');
 const start=Date.parse(raw.periodStart),end=Date.parse(raw.periodEnd),cutoff=Date.parse(raw.cutoffAt),projectStart=Date.parse(state.project.startsAt),projectEnd=Date.parse(state.project.endsAt);
 if(![raw.periodStart,raw.periodEnd,raw.cutoffAt].every(at=>z.string().datetime({offset:true}).safeParse(at).success)||![start,end,cutoff].every(Number.isFinite)||end<=start||cutoff<start||!['internal','aggregate'].includes(raw.scope)||!Number.isInteger(raw.ledgerRevision)||raw.ledgerRevision<0||raw.ledgerRevision>state.ledgerRevision)throw new PspError(400,'invalid_time','指标窗口、范围或账版本无效');
 const options:MetricOptions={...raw,periodStart:new Date(start).toISOString(),periodEnd:new Date(end).toISOString(),cutoffAt:new Date(cutoff).toISOString()};
 const inWindow=(at:string)=>{const time=Date.parse(at);return Number.isFinite(time)&&time>=start&&time<end&&time<=cutoff&&time>=projectStart&&time<=projectEnd;};
 const known=(recordedAt:string,sequence:number)=>Number.isInteger(sequence)&&sequence>0&&sequence<=options.ledgerRevision&&Number.isFinite(Date.parse(recordedAt))&&Date.parse(recordedAt)<=cutoff;
 const eligible=(s:PspState,id:string,at:string,sequence=options.ledgerRevision,scope=options.scope)=>{
  const time=Date.parse(at),revision=Math.min(sequence,options.ledgerRevision);
  return Number.isFinite(time)&&time>=projectStart&&time<=projectEnd&&time<=cutoff&&Number.isInteger(revision)&&revision>=0&&s.enrollments.some(e=>e.id===id&&e.projectId===options.projectId)&&membershipAt(s,id,at,revision)==='active'&&permissionAt(s,id,'service',at,revision)&&(scope==='internal'||permissionAt(s,id,'aggregate',at,revision));
 };
 const qualifiedAt=(id:string,at:string,sequence=options.ledgerRevision,scope=options.scope)=>eligible(state,id,at,sequence,scope);
 const relevant=(id:string)=>({memberships:state.membershipEvents.filter(e=>e.enrollmentId===id&&known(e.recordedAt,e.sequence)),permissions:state.permissionEvents.filter(e=>e.enrollmentId===id&&known(e.recordedAt,e.sequence)&&(e.scope==='service'||options.scope==='aggregate'))});
 const periodMember=(id:string)=>{
  const left=Math.max(start,projectStart),right=Math.min(end,cutoff,projectEnd);if(left>right||left>=end)return false;
  const {memberships,permissions}=relevant(id),effective=(e:{occurredAt:string;recordedAt:string})=>Math.max(Date.parse(e.occurredAt),Date.parse(e.recordedAt));
  const visible={...state,membershipEvents:memberships.filter(e=>effective(e)<left),permissionEvents:permissions.filter(e=>effective(e)<left)};
  const changes=[...memberships.map(event=>({kind:'membership' as const,event,at:effective(event)})),...permissions.map(event=>({kind:'permission' as const,event,at:effective(event)}))].filter(e=>e.at>=left&&e.at<=right&&e.at<end).sort((a,b)=>a.at-b.at||a.event.sequence-b.event.sequence);
  // At the start boundary apply its transitions first; a prior interval ending
  // exactly here alone is not a period membership. Qualified same-clock facts remain ordered.
  if(!changes.some(e=>e.at===left)&&eligible(visible,id,new Date(left).toISOString()))return true;
  for(const change of changes){if(change.kind==='membership')visible.membershipEvents.push(change.event);else visible.permissionEvents.push(change.event);if(eligible(visible,id,new Date(change.at).toISOString()))return true;}
  return false;
 };
 const assignmentKnown=(a:PspAssignment)=>{
  if(!a||a.projectId!==options.projectId||!state.enrollments.some(e=>e.id===a.enrollmentId)||Date.parse(a.assignedAt)>cutoff)return false;
  if(a.assignedSequence!==undefined||a.assignedRecordedAt!==undefined)return a.assignedSequence!==undefined&&a.assignedRecordedAt!==undefined&&known(a.assignedRecordedAt,a.assignedSequence)&&Date.parse(a.assignedRecordedAt)>=Date.parse(a.assignedAt)&&qualifiedAt(a.enrollmentId,a.assignedAt,a.assignedSequence,'internal');
  if(Date.parse(a.assignedAt)===projectStart&&a.source==='psp-v1'){
   // Seed definitions existed at their original grant, before any later same-clock withdrawal.
   const {memberships,permissions}=relevant(a.enrollmentId);
   return [...memberships,...permissions].filter(e=>Date.parse(e.occurredAt)<=projectStart&&Date.parse(e.recordedAt)<=projectStart).some(e=>qualifiedAt(a.enrollmentId,a.assignedAt,e.sequence,'internal'));
  }
  const parents=[...(state.alertActions??[]),...(state.educationEvents??[])].filter(e=>e.followupAssignmentId===a.id&&e.projectId===a.projectId&&e.enrollmentId===a.enrollmentId&&Date.parse(e.occurredAt)===Date.parse(a.assignedAt)&&known(e.recordedAt,e.sequence));
  return parents.some(e=>qualifiedAt(a.enrollmentId,a.assignedAt,e.sequence,'internal'));
 };
 const dueApplicable=(a:PspAssignment)=>{
  if(!assignmentKnown(a)||!inWindow(a.dueAt))return false;
  if(options.scope==='aggregate'&&!permissionAt(state,a.enrollmentId,'aggregate',a.dueAt,options.ledgerRevision))return false;
  const cancelled=(state.assignmentCancellations??[]).some(e=>e.assignmentId===a.id&&e.enrollmentId===a.enrollmentId&&e.projectId===a.projectId&&e.reason.trim()&&known(e.recordedAt,e.sequence)&&Date.parse(e.occurredAt)<=Date.parse(a.dueAt)&&!qualifiedAt(a.enrollmentId,a.dueAt,options.ledgerRevision,'internal')&&!qualifiedAt(a.enrollmentId,a.dueAt,e.sequence,'internal'));
  return !cancelled;
 };
 const scopeSourceRefs=(id:string)=>{const {memberships,permissions}=relevant(id);return [...memberships,...permissions].sort((a,b)=>a.sequence-b.sequence).map(e=>e.id);};
 return {options,inWindow,known,qualifiedAt,periodMember,assignmentKnown,dueApplicable,scopeSourceRefs};
}
