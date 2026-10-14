import {z} from 'zod';
import {getStore,type DemoStore} from '@/lib/state/store';
import {now,newId} from '@/lib/state/clock';
import {displayName} from '@/lib/patient/display';
import {projectSummary,type ProjectSummary} from './views';
import {runServiceCommand,requireIdentity} from './transaction';
import type {CommandMeta,EducationContentVersion,EducationAssignmentResult,PspAssignment} from './types';
import {requireService,serviceAllowed,addContactPlan} from './serviceRules';
import {PspError} from './errors';
export type PatientEducationView={patientId:string;displayName:string;project:ProjectSummary;assignment:Pick<PspAssignment,'id'|'title'|'dueAt'|'status'|'version'>;content:EducationContentVersion|null;result:EducationAssignmentResult|null;background?:boolean;canOpen:boolean;canFeedback:boolean;seedVersion:number;serverNow:string};
export function educationResultForAssignment(s:DemoStore,assignmentId:string):EducationAssignmentResult|null {return s.psp.educationResults.find(r=>r.assignmentId===assignmentId)??null;}
function educationAssignment(s:DemoStore,id:string):PspAssignment {
 const assignment=s.psp.assignments.find(a=>a.id===id);if(!assignment)throw new PspError(404,'not_found','教育计划不存在');
 if(assignment.kind!=='education')throw new PspError(400,'invalid_assignment','仅教育计划可执行此操作');return assignment;
}
export function getPatientEducationView(assignmentId:string,role:string|null,actorId:string|null):PatientEducationView {
 const s=getStore(),assignment=educationAssignment(s,assignmentId),enrollment=s.psp.enrollments.find(e=>e.id===assignment.enrollmentId)!;
 requireIdentity(role,actorId,['patient','case_manager','doctor','project_manager','data_reviewer','medical_reviewer'],enrollment.patientId);
 const at=now(),result=educationResultForAssignment(s,assignmentId),content=result?s.psp.educationContents.find(c=>c.id===result.contentVersionId)??null:null;
 const actionable=role==='patient'&&serviceAllowed(s,enrollment.id,at)&&assignment.status==='open';
 return structuredClone({patientId:enrollment.patientId,displayName:displayName(enrollment.patientId),project:projectSummary(s.psp.project),assignment:{id:assignment.id,title:assignment.title,dueAt:assignment.dueAt,status:assignment.status,version:assignment.version},content,result,background:!!result&&!s.psp.educationEvents?.some(e=>e.assignmentId===assignmentId),canOpen:actionable&&!!result&&!result.openedAt,canFeedback:actionable&&!!result?.openedAt&&!result.feedbackAt,seedVersion:s.seedVersion,serverNow:at});
}
export function sendEducation(assignmentId:string,rawContentVersionId:string,meta:CommandMeta){
 const contentVersionId=z.string().trim().min(1).parse(rawContentVersionId);
 return runServiceCommand({kind:'assignment',id:assignmentId},meta,{command:'education_send',contentVersionId},['case_manager'],s=>{
  const assignment=educationAssignment(s,assignmentId),at=now();requireService(s,assignment.enrollmentId,at);
  const prior=educationResultForAssignment(s,assignmentId);
  if(prior){if(prior.contentVersionId!==contentVersionId)throw new PspError(409,'content_bound','教育已发送，不能更改固定内容版本');return {data:prior,changed:false};}
  if(assignment.status!=='open')throw new PspError(409,'invalid_assignment','教育计划当前不可发送');
  const content=s.psp.educationContents.find(c=>c.id===contentVersionId);
  if(!content||content.status!=='approved'||Date.parse(content.approvedAt)>Date.parse(at))throw new PspError(400,'unapproved_content','仅可发送本项目已批准的固定内容版本');
  if(Date.parse(at)<Date.parse(assignment.assignedAt))throw new PspError(409,'invalid_assignment','教育计划尚未分配');
  const sequence=++s.psp.ledgerRevision,result:EducationAssignmentResult={assignmentId,contentVersionId,sentAt:at,openedAt:null,feedbackAt:null,understood:null,needsHelp:null,actorId:meta.actorId,sequence};
  s.psp.educationResults.push(result);(s.psp.educationEvents??=[]).push({id:newId('education-send'),projectId:s.psp.project.id,enrollmentId:assignment.enrollmentId,assignmentId,contentVersionId,action:'send',occurredAt:at,recordedAt:at,actorId:meta.actorId,sequence});
  const patientId=s.psp.enrollments.find(e=>e.id===assignment.enrollmentId)!.patientId;
  s.messages.push({id:newId('msg'),patientId,kind:'plan_update',at,text:`已发送患者教育：${content.title}（版本 ${content.version}）。请在教育服务页面明确确认已阅读后反馈理解与帮助需求。`});
  return {data:result,changed:true};
 });
}
export function recordEducationOpened(assignmentId:string,meta:CommandMeta){
 return runServiceCommand({kind:'assignment',id:assignmentId},meta,{command:'education_open'},['patient'],s=>{
  const assignment=educationAssignment(s,assignmentId),at=now();requireService(s,assignment.enrollmentId,at);
  const result=educationResultForAssignment(s,assignmentId);if(!result)throw new PspError(409,'not_sent','教育内容尚未发送');
  if(result.openedAt)return {data:result,changed:false};if(assignment.status!=='open')throw new PspError(409,'invalid_assignment','教育计划当前不可阅读确认');
  result.openedAt=at;result.actorId=meta.actorId;result.sequence=++s.psp.ledgerRevision;
  (s.psp.educationEvents??=[]).push({id:newId('education-open'),projectId:s.psp.project.id,enrollmentId:assignment.enrollmentId,assignmentId,contentVersionId:result.contentVersionId,action:'open',occurredAt:at,recordedAt:at,actorId:meta.actorId,sequence:result.sequence});return {data:result,changed:true};
 });
}
export const EducationFeedback=z.object({understood:z.boolean(),needsHelp:z.boolean()}).strict();
export function recordEducationFeedback(assignmentId:string,raw:z.infer<typeof EducationFeedback>,meta:CommandMeta){
 const input=EducationFeedback.parse(raw);
 return runServiceCommand({kind:'assignment',id:assignmentId},meta,{command:'education_feedback',...input},['patient'],s=>{
  const assignment=educationAssignment(s,assignmentId),at=now();requireService(s,assignment.enrollmentId,at);
  const result=educationResultForAssignment(s,assignmentId);if(!result)throw new PspError(409,'not_sent','教育内容尚未发送');if(!result.openedAt)throw new PspError(409,'not_opened','须先明确确认已阅读');
  if(result.feedbackAt){if(result.understood!==input.understood||result.needsHelp!==input.needsHelp)throw new PspError(409,'feedback_final','反馈已记录，不能更改');return {data:result,changed:false};}
  if(assignment.status!=='open')throw new PspError(409,'invalid_assignment','教育计划当前不可反馈');
  const followupAssignmentId=input.needsHelp?addContactPlan(s,assignment.enrollmentId,`PSP:EDUCATION:HELP:${assignmentId}`,'教育反馈联系跟进',at,new Date(Date.parse(at)+s.psp.project.contactTargets.medium*3_600_000).toISOString()):undefined;
  result.feedbackAt=at;result.understood=input.understood;result.needsHelp=input.needsHelp;result.actorId=meta.actorId;result.sequence=++s.psp.ledgerRevision;assignment.status='completed';
  (s.psp.educationEvents??=[]).push({id:newId('education-feedback'),projectId:s.psp.project.id,enrollmentId:assignment.enrollmentId,assignmentId,contentVersionId:result.contentVersionId,action:'feedback',occurredAt:at,recordedAt:at,actorId:meta.actorId,sequence:result.sequence,...input,...(followupAssignmentId?{followupAssignmentId}:{})});
  return {data:result,changed:true};
 });
}
