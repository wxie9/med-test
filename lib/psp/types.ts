import { z } from 'zod';
import {PspSelfReportRevision,PspCorrection} from './evidenceTypes';
import {PspQuestionnaireEvidence,PspAssignmentCancellation} from './metricEvidenceTypes';
import {PspServiceSnapshotSchema} from './snapshotTypes';
import {validatePspSnapshots} from './snapshotValidation';
import {ReportActionEventSchema} from './reviewTypes';
import {DeliveryArtifactSchema} from './deliveryTypes';
import {PspReportVersionSchema} from './reportTypes';
import {validatePspReports} from './reportValidation';
export {PspQuestionnaireEvidence,PspAssignmentCancellation} from './metricEvidenceTypes';
export {PspSelfReportRevision,PspCorrection} from './evidenceTypes';
import { ProBody } from '@/lib/pro/validation';
const id = z.string().min(1), time = z.string().datetime(), version = z.number().int().positive(), seq = z.number().int().positive();
export const PspRole = z.enum(['patient','case_manager','doctor','project_manager','data_reviewer','medical_reviewer','pharma_owner']);
export type PspRole = z.infer<typeof PspRole>;
export const CommandMeta = z.object({seedVersion:version,expectedVersion:version,clientRequestId:id,actorId:id,role:PspRole}).strict();
export type CommandMeta = z.infer<typeof CommandMeta>;
export const EnrollmentStatus = z.enum(['invited','active','paused','exited']);
export const PspProject = z.object({id,title:id,sponsor:id,scope:id,population:id,startsAt:time,endsAt:time,period:id,cutoffAt:time,configVersion:version,status:z.literal('active'),contactTargets:z.object({high:z.number().positive(),medium:z.number().positive()}).strict()}).strict();
export const PspEnrollment = z.object({id,projectId:id,patientId:id,status:EnrollmentStatus,version,eligibilityConfirmed:z.boolean(),eligibilityConfirmedAt:time.nullable(),eligibilityConfirmedBy:id.nullable()}).strict();
const event = {id,enrollmentId:id,occurredAt:time,recordedAt:time,actorId:id,sequence:seq};
export const PspMembershipEvent = z.object({...event,status:EnrollmentStatus,reason:id}).strict();
export const PspPermissionEvent = z.object({...event,scope:z.enum(['service','aggregate']),action:z.enum(['grant','withdraw']),textVersion:id}).strict();
export const PspAssignment = z.object({id,projectId:id,enrollmentId:id,kind:z.enum(['questionnaire','contact','education']),title:id,assignedAt:time,assignedRecordedAt:time.optional(),assignedSequence:seq.optional(),dueAt:time,ownerRole:PspRole,status:z.enum(['open','completed','paused','cancelled']),version,firstValidSubmittedAt:time.nullable(),latestValidResponseId:id.nullable(),source:z.literal('psp-v1')}).strict();
export const PspServiceEvent = z.object({...event,projectId:id,assignmentId:id.optional(),channel:z.enum(['phone','message']).optional(),kind:z.literal('contact'),interactionId:id,alertIds:z.array(id),outcome:z.enum(['reached','no_answer','refused','channel_unavailable']),source:z.literal('psp-v1')}).strict();
export const EducationContentVersion = z.object({id,version,title:id,body:id,scope:id,status:z.literal('approved'),approvedAt:time,approvedBy:id,sourceNote:id}).strict();
export const EducationAssignmentResult = z.object({assignmentId:id,contentVersionId:id,sentAt:time,openedAt:time.nullable(),feedbackAt:time.nullable(),understood:z.boolean().nullable(),needsHelp:z.boolean().nullable(),actorId:id,sequence:seq}).strict();
export const PspDisposition = z.object({category:id,summary:id,interactionIds:z.array(id).min(1)}).strict();
export const PspAlertActionEvent = z.object({...event,projectId:id,alertId:id,action:z.enum(['accept','start','submit_review','close']),disposition:PspDisposition.optional(),note:id.optional(),followupTaskId:id.optional(),followupAssignmentId:id.optional()}).strict();
export const PspEducationEvent = z.object({...event,projectId:id,assignmentId:id,contentVersionId:id,action:z.enum(['send','open','feedback']),understood:z.boolean().optional(),needsHelp:z.boolean().optional(),followupAssignmentId:id.optional()}).strict();
export type PspAlertActionEvent = z.infer<typeof PspAlertActionEvent>;
export type PspEducationEvent = z.infer<typeof PspEducationEvent>;
export const CommandReceipt = z.object({id,scopeKey:id,bodyDigest:id,result:z.unknown(),objectVersion:version,ledgerRevision:z.number().int().nonnegative()}).strict();
export const PspState = z.object({fixtureVersion:id,checksum:z.string().regex(/^[a-f0-9]{64}$/),ledgerRevision:z.number().int().nonnegative(),authorizationVersion:version,project:PspProject,enrollments:z.array(PspEnrollment),membershipEvents:z.array(PspMembershipEvent),permissionEvents:z.array(PspPermissionEvent),assignments:z.array(PspAssignment),serviceEvents:z.array(PspServiceEvent),educationContents:z.array(EducationContentVersion),educationResults:z.array(EducationAssignmentResult),commandReceipts:z.array(CommandReceipt),alertActions:z.array(PspAlertActionEvent).optional(),educationEvents:z.array(PspEducationEvent).optional(),selfReportRevisions:z.array(PspSelfReportRevision).optional(),corrections:z.array(PspCorrection).optional(),questionnaireEvidence:z.array(PspQuestionnaireEvidence).optional(),assignmentCancellations:z.array(PspAssignmentCancellation).optional(),snapshots:z.array(PspServiceSnapshotSchema).optional(),reportVersions:z.array(PspReportVersionSchema).optional(),reportActions:z.array(ReportActionEventSchema).optional(),deliveryArtifacts:z.array(DeliveryArtifactSchema).optional()}).strict();
export type PspProject = z.infer<typeof PspProject>;
export type PspEnrollment = z.infer<typeof PspEnrollment>;
export type PspMembershipEvent = z.infer<typeof PspMembershipEvent>;
export type PspPermissionEvent = z.infer<typeof PspPermissionEvent>;
export type PspAssignment = z.infer<typeof PspAssignment>;
export type PspServiceEvent = z.infer<typeof PspServiceEvent>;
export type EducationContentVersion = z.infer<typeof EducationContentVersion>;
export type EducationAssignmentResult = z.infer<typeof EducationAssignmentResult>;
export type CommandReceipt = z.infer<typeof CommandReceipt>;
export type PspState = z.infer<typeof PspState>;
export function validatePspState(value:unknown):PspState {
 const s=PspState.parse(value);
 const unique=(values:string[],label:string)=>{if(new Set(values).size!==values.length)throw new Error(`Duplicate PSP ${label}`);};
 for(const [label,items] of Object.entries({enrollments:s.enrollments,assignments:s.assignments,membership:s.membershipEvents,permissions:s.permissionEvents,services:s.serviceEvents,contents:s.educationContents,receipts:s.commandReceipts}))unique(items.map(x=>x.id),label);
 unique(s.enrollments.map(e=>e.patientId),'patient');
 const enrollments=new Set(s.enrollments.map(e=>e.id)), assignments=new Map(s.assignments.map(a=>[a.id,a])),contents=new Map(s.educationContents.map(c=>[c.id,c]));
 const events=[...(s.reportActions??[]),...(s.reportVersions??[]).map(r=>({sequence:r.creationLedgerRevision})),...(s.selfReportRevisions??[]),...(s.corrections??[]),...(s.corrections??[]).filter(c=>c.verificationSequence!==null).map(c=>({sequence:c.verificationSequence!})),...s.membershipEvents,...s.permissionEvents,...s.serviceEvents,...(s.alertActions??[]),...(s.educationEvents??[]),...s.educationResults.filter(r=>!s.educationEvents?.some(e=>e.assignmentId===r.assignmentId)),...(s.questionnaireEvidence??[]),...(s.assignmentCancellations??[]),...s.assignments.filter(a=>a.assignedSequence!==undefined).map(a=>({sequence:a.assignedSequence!}))];
 unique(events.map(e=>String(e.sequence)),'sequence');
 if(events.some(e=>e.sequence>s.ledgerRevision))throw new Error('PSP revision behind ledger');
 for(const e of s.enrollments)if(e.projectId!==s.project.id || e.eligibilityConfirmed!==Boolean(e.eligibilityConfirmedAt && e.eligibilityConfirmedBy))throw new Error('Invalid PSP enrollment');
 // Persisted materialized state must describe the full ledger, including future-dated
 // valid entries. Recovery cannot reinterpret data according to the host clock.
 const latest=<T extends {occurredAt:string;sequence:number}>(items:T[]):T|undefined=>items.reduce<T|undefined>((current,item)=>!current||Date.parse(item.occurredAt)>Date.parse(current.occurredAt)||(Date.parse(item.occurredAt)===Date.parse(current.occurredAt)&&item.sequence>current.sequence)?item:current,undefined);
 for(const enrollment of s.enrollments){
  const membership=latest(s.membershipEvents.filter(e=>e.enrollmentId===enrollment.id));
  if(!membership||membership.status!==enrollment.status)throw new Error('PSP enrollment status disagrees with membership ledger');
  const service=latest(s.permissionEvents.filter(e=>e.enrollmentId===enrollment.id&&e.scope==='service'));
  if(enrollment.status==='active'&&(!enrollment.eligibilityConfirmed||service?.action!=='grant'))throw new Error('Active PSP enrollment requires eligibility and service grant');
 }
 if(s.commandReceipts.some(r=>r.ledgerRevision>s.ledgerRevision))throw new Error('PSP receipt revision ahead of ledger');
 for(const e of [...s.membershipEvents,...s.permissionEvents,...s.serviceEvents])if(!enrollments.has(e.enrollmentId) || Date.parse(e.recordedAt)<Date.parse(e.occurredAt))throw new Error('Invalid PSP event');
 for(const a of s.assignments)if(!enrollments.has(a.enrollmentId)||a.projectId!==s.project.id||Date.parse(a.dueAt)<Date.parse(a.assignedAt)||Boolean(a.assignedRecordedAt)!==Boolean(a.assignedSequence)||(a.assignedRecordedAt!==undefined&&(Date.parse(a.assignedRecordedAt)<Date.parse(a.assignedAt)||a.assignedSequence!>s.ledgerRevision)))throw new Error('Invalid PSP assignment');
 for(const a of s.assignments.filter(a=>a.kind==='questionnaire'))if(Boolean(a.firstValidSubmittedAt)!==Boolean(a.latestValidResponseId)||(a.status==='completed'&&!a.firstValidSubmittedAt)||(a.status==='open'&&a.firstValidSubmittedAt))throw new Error('Invalid PSP questionnaire completion fields');
 for(const e of s.serviceEvents){const a=e.assignmentId?assignments.get(e.assignmentId):undefined;if((e.assignmentId&&(!a||a.kind!=='contact'||a.enrollmentId!==e.enrollmentId||Date.parse(e.occurredAt)<Date.parse(a.assignedAt)))||e.projectId!==s.project.id||(!e.assignmentId&&!e.channel))throw new Error('Invalid PSP contact reference or time');}
 for(const e of s.educationResults){const a=assignments.get(e.assignmentId),c=contents.get(e.contentVersionId);if(!a||a.kind!=='education'||!c||Date.parse(e.sentAt)<Date.parse(a.assignedAt)||Date.parse(c.approvedAt)>Date.parse(e.sentAt)||(e.openedAt!==null&&Date.parse(e.sentAt)>Date.parse(e.openedAt))||(e.feedbackAt!==null&&(!e.openedAt||Date.parse(e.openedAt)>Date.parse(e.feedbackAt)))||(e.feedbackAt===null&&(e.understood!==null||e.needsHelp!==null))||(e.feedbackAt!==null&&(e.understood===null||e.needsHelp===null)))throw new Error('Invalid PSP education reference or time');}
 validatePspSnapshots(s);
 validatePspReports(s);
 return s;
}

/** Cross-store questionnaire links are validated at transaction and persistence boundaries. */
export function validatePspClinicalLinks(state:PspState, patients:Iterable<{id:string;pro:import('@/lib/domain/types').ProResponse[]}>):void {
 const patientList=[...patients],enrollments=new Map(state.enrollments.map(e=>[e.id,e]));
 for(const a of state.assignments.filter(a=>a.kind==='questionnaire')){
  const first=a.firstValidSubmittedAt,latest=a.latestValidResponseId;
  if(Boolean(first)!==Boolean(latest)||(a.status==='completed'&&!first)||(a.status==='open'&&first))throw new Error('Invalid PSP questionnaire completion fields');
  if(!first||!latest)continue;
  const patientId=enrollments.get(a.enrollmentId)?.patientId,patient=patientList.find(p=>p.id===patientId);
  const references=patientList.flatMap(p=>p.pro.filter(pro=>pro.id===latest).map(pro=>({patientId:p.id,pro})));
  if(!patient||references.length!==1||references[0].patientId!==patientId)throw new Error('Invalid PSP questionnaire response ownership');
  const seen=new Set<string>();let pro=references[0].pro;
  while(true){
   const submitted=Date.parse(pro.submittedAt);
   if(seen.has(pro.id)||pro.scaleId!=='endocrine_monthly_v1'||!Number.isFinite(submitted)||submitted<Date.parse(a.assignedAt)||submitted<Date.parse(state.project.startsAt)||submitted>Date.parse(state.project.endsAt)||submitted<Date.parse(first))throw new Error('Invalid PSP questionnaire response scale or time');
   ProBody.parse({patientId:patient.id,scaleId:pro.scaleId,items:pro.items,flags:pro.flags});
   seen.add(pro.id);
   if(!pro.revisionOf){if(submitted!==Date.parse(first))throw new Error('Invalid PSP questionnaire first completion time');break;}
   const parents=patient.pro.filter(p=>p.id===pro.revisionOf);
   if(parents.length!==1||Date.parse(parents[0].submittedAt)>submitted)throw new Error('Invalid PSP questionnaire revision reference');
   pro=parents[0];
  }
 }
}
