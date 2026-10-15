import {z} from 'zod';
import {now,newId} from '@/lib/state/clock';
import {runServiceCommand} from './transaction';
import {membershipAt,permissionAt} from './permissions';
import {PspError} from './errors';
import type {CommandMeta} from './types';

/** Internal domain command: explicit evidence for a service plan no longer applicable. */
export function cancelProjectAssignment(assignmentId:string,rawReason:string,meta:CommandMeta){
 const reason=z.string().trim().min(1).max(500).parse(rawReason);
 return runServiceCommand({kind:'assignment',id:assignmentId},meta,{command:'cancel_assignment',reason},['case_manager','project_manager'],s=>{
  const assignment=s.psp.assignments.find(a=>a.id===assignmentId)!,at=now();
  if(assignment.status!=='open'&&assignment.status!=='paused')throw new PspError(409,'invalid_assignment','仅未完成计划可取消');
  if(Date.parse(at)<Date.parse(assignment.assignedAt)||Date.parse(at)>Date.parse(s.psp.project.endsAt))throw new PspError(409,'outside_project','当前不在计划服务期内');
  if(membershipAt(s.psp,assignment.enrollmentId,at)==='active'&&permissionAt(s.psp,assignment.enrollmentId,'service',at))throw new PspError(409,'still_applicable','成员仍有有效服务资格，不能取消计划');
  const event={id:newId('psp-assignment-cancellation'),projectId:s.psp.project.id,enrollmentId:assignment.enrollmentId,assignmentId,occurredAt:at,recordedAt:at,actorId:meta.actorId,sequence:++s.psp.ledgerRevision,reason};
  (s.psp.assignmentCancellations??=[]).push(event);assignment.status='cancelled';
  return {data:event,changed:true};
 });
}
