import type {Alert} from '@/lib/domain/types';
import type {ProjectSummary,AssignmentSummary} from './views';
import type {PspEnrollment} from './types';
import {getStore} from '@/lib/state/store';
import {now} from '@/lib/state/clock';
import {displayName} from '@/lib/patient/display';
import {assignments,currentPermissions,projectSummary} from './views';
import {requireIdentity,projectEnrollmentForAlert} from './transaction';
import {PspError} from './errors';
import {contactsFor,educationFor,type ContactSummary,type EducationSummary} from './serviceSummary';
export type {ContactSummary,EducationSummary} from './serviceSummary';
export type ProjectAlertSummary=Pick<Alert,'id'|'proId'|'kind'|'level'|'rule'|'status'|'assignee'|'timestamps'>&{version:number;disposition:{category:string;summary:string;interactionIds:string[];at:string;actorId:string}|null;doctorReview:{note:string;at:string;actorId:string;followupTaskId:string;followupAssignmentId:string}|null};
export type PatientServiceView={patientId:string;displayName:string;project:ProjectSummary;enrollment:Pick<PspEnrollment,'id'|'status'|'version'>;permissions:{service:boolean;aggregate:boolean};assignments:AssignmentSummary[];alerts:ProjectAlertSummary[];contacts:ContactSummary[];education:EducationSummary[];approvedContents:{id:string;title:string;version:number;sourceNote:string;approvedAt:string}[];seedVersion:number;serverNow:string};
export function getPatientServiceView(projectId:string,patientId:string,role:string|null,actorId:string|null):PatientServiceView {
 requireIdentity(role,actorId,['case_manager','doctor']);
 const s=getStore(),at=now(),enrollment=s.psp.enrollments.find(e=>e.patientId===patientId&&e.projectId===projectId);
 if(projectId!==s.psp.project.id||!enrollment)throw new PspError(404,'not_found','此患者没有该项目服务记录');
 const events=s.psp.alertActions??[];
 const alerts=s.alerts.filter(a=>a.patientId===patientId&&projectEnrollmentForAlert(s,a.id)?.id===enrollment.id).map(a=>{
  const disposition=events.filter(e=>e.alertId===a.id&&e.action==='submit_review'&&e.disposition).sort((x,y)=>y.sequence-x.sequence)[0];
  const closed=events.filter(e=>e.alertId===a.id&&e.action==='close').sort((x,y)=>y.sequence-x.sequence)[0];
  return {id:a.id,proId:a.proId,kind:a.kind,level:a.level,rule:a.rule,status:a.status,version:a.version??1,assignee:a.assignee,timestamps:{...a.timestamps},disposition:disposition?.disposition?{category:disposition.disposition.category,summary:disposition.disposition.summary,interactionIds:[...disposition.disposition.interactionIds],at:disposition.occurredAt,actorId:disposition.actorId}:null,doctorReview:closed?.note&&closed.followupTaskId&&closed.followupAssignmentId?{note:closed.note,at:closed.occurredAt,actorId:closed.actorId,followupTaskId:closed.followupTaskId,followupAssignmentId:closed.followupAssignmentId}:null};
 });
 return {patientId,displayName:displayName(patientId),project:projectSummary(s.psp.project),enrollment:{id:enrollment.id,status:enrollment.status,version:enrollment.version},permissions:currentPermissions(s,enrollment.id,at),assignments:assignments(s,enrollment,at),alerts,contacts:contactsFor(s.psp,enrollment.id),education:educationFor(s.psp,enrollment.id),approvedContents:s.psp.educationContents.filter(c=>c.status==='approved'&&Date.parse(c.approvedAt)<=Date.parse(at)).map(c=>({id:c.id,title:c.title,version:c.version,sourceNote:c.sourceNote,approvedAt:c.approvedAt})),seedVersion:s.seedVersion,serverNow:at};
}
