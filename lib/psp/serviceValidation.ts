import {membershipAt,permissionAt} from './permissions';
import type {DemoStore} from '@/lib/state/store';
import {shanghaiCalendarDay} from '@/lib/domain/dates';
import {projectEnrollmentForAlert,actors} from './transaction';
/** Validates live service evidence against both PSP ledger and unchanged clinical entities. */
export function validatePspServiceLinks(s:DemoStore):void {
 const p=s.psp,actions=p.alertActions??[],education=p.educationEvents??[];
 const unique=(values:string[],label:string)=>{if(new Set(values).size!==values.length)throw new Error(`Duplicate PSP ${label}`);};
 unique(actions.map(e=>e.id),'alert action');unique(education.map(e=>e.id),'education event');unique(p.educationResults.map(e=>e.assignmentId),'education result');unique(p.serviceEvents.map(e=>e.interactionId),'interaction');
 const closes=actions.filter(e=>e.action==='close');
 unique(closes.flatMap(e=>e.followupTaskId?[e.followupTaskId]:[]),'doctor followup task reference');
 unique([...closes,...education].flatMap(e=>e.followupAssignmentId?[e.followupAssignmentId]:[]),'future contact reference');
 const assignment=(id:string|undefined)=>p.assignments.find(a=>a.id===id);
 const validEvent=(e:{projectId:string;enrollmentId:string;occurredAt:string;recordedAt:string;sequence:number})=>{if(e.projectId!==p.project.id||!p.enrollments.some(n=>n.id===e.enrollmentId)||Date.parse(e.recordedAt)<Date.parse(e.occurredAt)||[e.occurredAt,e.recordedAt].some(at=>Date.parse(at)<Date.parse(p.project.startsAt)||Date.parse(at)>Date.parse(p.project.endsAt)))throw new Error('Invalid PSP service event ownership or time');for(const at of [e.occurredAt,e.recordedAt])if(membershipAt(p,e.enrollmentId,at,e.sequence)!=='active'||!permissionAt(p,e.enrollmentId,'service',at,e.sequence))throw new Error('Invalid PSP historical service authorization');};
 const followup=(id:string|undefined,enrollmentId:string,at:string,originId:string)=>{const plan=assignment(id);if(id!==originId||!plan||plan.kind!=='contact'||plan.projectId!==p.project.id||plan.enrollmentId!==enrollmentId||plan.ownerRole!=='case_manager'||plan.assignedAt!==at||Date.parse(plan.dueAt)<=Date.parse(at)||Date.parse(plan.dueAt)>Date.parse(p.project.endsAt))throw new Error('Invalid PSP future contact reference');return plan;};
 for(const e of p.serviceEvents){
  unique(e.alertIds,'contact alert');
  if(!e.channel){if(e.alertIds.length||!e.assignmentId)throw new Error('Legacy PSP contacts cannot claim alert coverage');continue;}
  validEvent(e);if(e.actorId!==actors.case_manager||(!e.assignmentId&&!e.alertIds.length))throw new Error('Invalid PSP contact evidence');
  for(const id of e.alertIds){const owner=projectEnrollmentForAlert(s,id),alert=s.alerts.find(a=>a.id===id);if(!owner||owner.id!==e.enrollmentId||!alert||Date.parse(e.occurredAt)<Date.parse(alert.timestamps.triggered))throw new Error('Invalid PSP contact alert ownership or time');}
 }
 for(const a of p.assignments.filter(a=>a.kind==='contact')) {
  const contacts=p.serviceEvents.filter(e=>e.assignmentId===a.id);
  if(!contacts.some(e=>e.channel))continue;
  const reached=contacts.some(e=>e.outcome==='reached');
  if((a.status==='completed'&&!reached)||(a.status==='open'&&reached))throw new Error('PSP contact completion disagrees with interaction evidence');
  const live=contacts.filter(e=>e.channel).sort((a,b)=>a.sequence-b.sequence),firstSuccess=live.findIndex(e=>e.outcome==='reached');
  if(firstSuccess>=0&&firstSuccess!==live.length-1)throw new Error('PSP completed contact plan has later attempts');
 }
 for(const e of actions){
  validEvent(e);const alert=s.alerts.find(a=>a.id===e.alertId),owner=projectEnrollmentForAlert(s,e.alertId);
  if(!alert||!owner||owner.id!==e.enrollmentId||e.actorId!==(e.action==='close'?actors.doctor:actors.case_manager))throw new Error('Invalid PSP alert action ownership');
  const status={accept:'accepted',start:'in_progress',submit_review:'pending_review',close:'closed'}[e.action];
  if(alert.timestamps[status]!==e.occurredAt||Date.parse(e.occurredAt)<Date.parse(alert.timestamps.triggered))throw new Error('PSP action disagrees with clinical transition');
  if(e.action==='submit_review'){
   if(!e.disposition||!e.disposition.category.trim()||!e.disposition.summary.trim()||e.note||e.followupTaskId||e.followupAssignmentId)throw new Error('Invalid PSP disposition evidence');
   unique(e.disposition.interactionIds,'disposition interaction');
   for(const id of e.disposition.interactionIds){const contact=p.serviceEvents.find(c=>c.interactionId===id);if(!contact?.channel||contact.enrollmentId!==e.enrollmentId||contact.projectId!==e.projectId||!contact.alertIds.includes(e.alertId)||contact.sequence>=e.sequence||Date.parse(contact.occurredAt)>Date.parse(e.occurredAt))throw new Error('Invalid PSP disposition interaction');}
   if(!alert.notes.some(n=>n.at===e.occurredAt&&n.by===e.actorId&&n.text===e.disposition!.summary))throw new Error('Missing PSP clinical disposition note');
  }else if(e.disposition)throw new Error('Disposition belongs only to PSP submit_review');
  if(e.action==='close'){
   if(!e.note?.trim()||!e.followupTaskId||!e.followupAssignmentId||!actions.some(a=>a.alertId===e.alertId&&a.action==='submit_review'&&a.disposition&&a.sequence<e.sequence&&Date.parse(a.occurredAt)<=Date.parse(e.occurredAt)))throw new Error('Missing PSP doctor review evidence');
   const task=s.tasks.find(t=>t.id===e.followupTaskId),plan=followup(e.followupAssignmentId,e.enrollmentId,e.occurredAt,`PSP:REVIEW:${e.alertId}`);
   if(!task||task.patientId!==owner.patientId||task.createdAt!==e.occurredAt||task.type!==plan.title||task.due!==shanghaiCalendarDay(plan.dueAt)||Date.parse(plan.dueAt)<=Date.parse(p.project.cutoffAt)||!task.owner.trim())throw new Error('Invalid PSP clinical followup task');
   if(!alert.notes.some(n=>n.at===e.occurredAt&&n.by===e.actorId&&n.text===e.note))throw new Error('Missing PSP clinical doctor review note');
   const text=`医生已处理您的报告：${e.note}。新增随访：${task.type}（${task.due}）。`;
   if(!s.messages.some(m=>m.patientId===owner.patientId&&m.kind==='plan_update'&&m.at===e.occurredAt&&m.text===text))throw new Error('Missing PSP doctor followup message');
  }else if(e.note||e.followupTaskId||e.followupAssignmentId)throw new Error('Review fields belong only to PSP close');
 }
 for(const e of education){
  validEvent(e);const a=assignment(e.assignmentId),owner=p.enrollments.find(n=>n.id===e.enrollmentId),content=p.educationContents.find(c=>c.id===e.contentVersionId);
  if(!a||a.kind!=='education'||a.enrollmentId!==e.enrollmentId||!owner||!content||Date.parse(content.approvedAt)>Date.parse(e.occurredAt)||Date.parse(a.assignedAt)>Date.parse(e.occurredAt)||e.occurredAt!==e.recordedAt||e.actorId!==(e.action==='send'?actors.case_manager:owner.patientId))throw new Error('Invalid PSP education event reference');
  if(e.action==='feedback'){if(typeof e.understood!=='boolean'||typeof e.needsHelp!=='boolean'||e.needsHelp!==Boolean(e.followupAssignmentId))throw new Error('Invalid PSP education feedback evidence');if(e.followupAssignmentId)followup(e.followupAssignmentId,e.enrollmentId,e.occurredAt,`PSP:EDUCATION:HELP:${e.assignmentId}`);}
  else if(e.understood!==undefined||e.needsHelp!==undefined||e.followupAssignmentId)throw new Error('Education feedback fields belong only to feedback');
 }
 for(const result of p.educationResults){
  const events=education.filter(e=>e.assignmentId===result.assignmentId).sort((a,b)=>a.sequence-b.sequence),a=assignment(result.assignmentId)!;
  if(!events.length){if(!result.openedAt||!result.feedbackAt||result.understood===null||result.needsHelp===null)throw new Error('Missing PSP education stage evidence');continue;}
  const send=events.find(e=>e.action==='send'),open=events.find(e=>e.action==='open'),feedback=events.find(e=>e.action==='feedback'),last=events.at(-1)!;
  unique(events.map(e=>e.action),'education stage');
  if(!send||events[0]!==send||events.some(e=>e.contentVersionId!==result.contentVersionId)||send.occurredAt!==result.sentAt||result.openedAt!==(open?.occurredAt??null)||result.feedbackAt!==(feedback?.occurredAt??null)||result.sequence!==last.sequence||result.actorId!==last.actorId||result.understood!==(feedback?.understood??null)||result.needsHelp!==(feedback?.needsHelp??null)||(open&&(open.sequence<=send.sequence||Date.parse(open.occurredAt)<Date.parse(send.occurredAt)))||(feedback&&(!open||feedback.sequence<=open.sequence||Date.parse(feedback.occurredAt)<Date.parse(open.occurredAt)||a.status!=='completed'))||(!feedback&&a.status==='completed'))throw new Error('PSP education projection disagrees with stage evidence');
  const content=p.educationContents.find(c=>c.id===result.contentVersionId)!,owner=p.enrollments.find(e=>e.id===a.enrollmentId)!;
  const text=`已发送患者教育：${content.title}（版本 ${content.version}）。请在教育服务页面明确确认已阅读后反馈理解与帮助需求。`;
  if(!s.messages.some(m=>m.patientId===owner.patientId&&m.kind==='plan_update'&&m.at===send.occurredAt&&m.text===text))throw new Error('Missing PSP education delivery message');
 }
 for(const e of education)if(!p.educationResults.some(r=>r.assignmentId===e.assignmentId))throw new Error('Missing PSP education result projection');
}
