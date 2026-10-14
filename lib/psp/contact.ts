import {z} from 'zod';
import {now,newId} from '@/lib/state/clock';
import {actOnAlertInStore,closeAlertWithTaskInStore} from '@/lib/clinic/actions';
import {shanghaiCalendarDay} from '@/lib/domain/dates';
import {runServiceCommand,projectEnrollmentForAlert} from './transaction';
import type {CommandMeta,PspAlertActionEvent} from './types';
import {serviceTime,requireService,addContactPlan} from './serviceRules';
import {PspError} from './errors';
const text=z.string().trim().min(1),ids=z.array(text).refine(values=>new Set(values).size===values.length,'重复引用');
export const InteractionInput=z.object({enrollmentId:text,assignmentId:text.optional(),alertIds:ids,channel:z.enum(['phone','message']),outcome:z.enum(['reached','no_answer','refused','channel_unavailable']),occurredAt:serviceTime.optional()}).strict();
export type InteractionInput=z.input<typeof InteractionInput>;
export function recordInteraction(raw:InteractionInput,meta:CommandMeta){
 const input=InteractionInput.parse(raw);if(!input.assignmentId&&!input.alertIds.length)throw new PspError(400,'empty_interaction','联系须关联计划或预警');
 return runServiceCommand(input.assignmentId?{kind:'assignment',id:input.assignmentId}:{kind:'enrollment',id:input.enrollmentId},meta,{command:'interaction',...input},['case_manager'],s=>{
  const recordedAt=now(),occurredAt=input.occurredAt??recordedAt;requireService(s,input.enrollmentId,recordedAt);requireService(s,input.enrollmentId,occurredAt);
  const enrollment=s.psp.enrollments.find(e=>e.id===input.enrollmentId);if(!enrollment)throw new PspError(404,'not_found','项目成员不存在');
  const assignment=input.assignmentId?s.psp.assignments.find(a=>a.id===input.assignmentId):undefined;
  if(assignment&&(assignment.kind!=='contact'||assignment.enrollmentId!==input.enrollmentId||assignment.projectId!==s.psp.project.id))throw new PspError(400,'invalid_assignment','联系计划不属于本患者项目');
  if(assignment&&assignment.status!=='open')throw new PspError(409,'invalid_assignment','联系计划当前不可执行');
  if(Date.parse(occurredAt)>Date.parse(recordedAt)||(assignment&&Date.parse(occurredAt)<Date.parse(assignment.assignedAt)))throw new PspError(400,'invalid_time','联系时间须在计划分配后且不晚于当前时间');
  for(const id of input.alertIds){const linked=projectEnrollmentForAlert(s,id),alert=s.alerts.find(a=>a.id===id);if(!linked||linked.id!==enrollment.id||!alert)throw new PspError(400,'invalid_alert','预警不属于本患者项目');if(Date.parse(occurredAt)<Date.parse(alert.timestamps.triggered))throw new PspError(400,'invalid_time','联系时间须在预警触发后');}
  const sequence=++s.psp.ledgerRevision,id=newId('interaction'),event={id,interactionId:id,enrollmentId:input.enrollmentId,projectId:s.psp.project.id,...(input.assignmentId?{assignmentId:input.assignmentId}:{}),kind:'contact' as const,channel:input.channel,outcome:input.outcome,alertIds:input.alertIds,occurredAt,recordedAt,actorId:meta.actorId,sequence,source:'psp-v1' as const};
  s.psp.serviceEvents.push(event);if(assignment&&input.outcome==='reached')assignment.status='completed';return {data:event,changed:true};
 });
}
export const ProjectAlertAction=z.discriminatedUnion('action',[
 z.object({action:z.literal('accept')}).strict(),z.object({action:z.literal('start')}).strict(),
 z.object({action:z.literal('submit_review'),disposition:z.object({category:text,summary:text,interactionIds:ids.refine(values=>values.length>0,'须引用实际联系')}).strict()}).strict(),
 z.object({action:z.literal('close'),note:text,followupTask:z.object({type:text,dueAt:serviceTime,owner:text}).strict()}).strict(),
]);
export type ProjectAlertAction=z.input<typeof ProjectAlertAction>;
export function actOnProjectAlert(alertId:string,raw:ProjectAlertAction,meta:CommandMeta){
 const input=ProjectAlertAction.parse(raw);
 return runServiceCommand({kind:'alert',id:alertId},meta,{command:'alert_action',...input},input.action==='close'?['doctor']:['case_manager'],s=>{
  const at=now(),enrollment=projectEnrollmentForAlert(s,alertId)!;requireService(s,enrollment.id,at);
  const alert=s.alerts.find(a=>a.id===alertId)!,event:PspAlertActionEvent={id:newId('psp-alert-action'),projectId:s.psp.project.id,enrollmentId:enrollment.id,alertId,action:input.action,occurredAt:at,recordedAt:at,actorId:meta.actorId,sequence:++s.psp.ledgerRevision};
  if(input.action==='submit_review'){
   for(const id of input.disposition.interactionIds){const interaction=s.psp.serviceEvents.find(e=>e.interactionId===id);if(!interaction?.channel||interaction.enrollmentId!==enrollment.id||interaction.projectId!==s.psp.project.id||!interaction.alertIds.includes(alertId))throw new PspError(400,'invalid_interaction','处置须引用覆盖本预警的实际联系');}
   event.disposition=input.disposition;
  }
  if(input.action==='close'){
   const disposition=s.psp.alertActions?.find(e=>e.alertId===alertId&&e.action==='submit_review'&&e.disposition);
   if(!disposition)throw new PspError(409,'review_required','须先提交本预警的结构化处置记录');
   const dueAt=input.followupTask.dueAt;
   if(Date.parse(dueAt)<=Math.max(Date.parse(at),Date.parse(s.psp.project.cutoffAt))||Date.parse(dueAt)>Date.parse(s.psp.project.endsAt))throw new PspError(400,'invalid_followup','复评时间须晚于当前复核及项目截止观察时间，且在项目期内');
   try {const result=closeAlertWithTaskInStore(s,alertId,meta.actorId,input.note,{type:input.followupTask.type,owner:input.followupTask.owner,due:shanghaiCalendarDay(dueAt)},at);event.followupTaskId=result.task.id;}catch(error){if(error instanceof Error&&error.message==='invalid transition')throw new PspError(409,'invalid_transition','当前预警状态不允许此操作');throw error;}
   event.note=input.note;event.followupAssignmentId=addContactPlan(s,enrollment.id,`PSP:REVIEW:${alert.id}`,input.followupTask.type,at,dueAt);
  }else{
   try {actOnAlertInStore(s,alertId,input.action,meta.actorId,at,input.action==='submit_review'?input.disposition.summary:undefined);}catch(error){if(error instanceof Error&&error.message==='invalid transition')throw new PspError(409,'invalid_transition','当前预警状态不允许此操作');throw error;}
  }
  (s.psp.alertActions??=[]).push(event);return {data:event,changed:true};
 });
}
