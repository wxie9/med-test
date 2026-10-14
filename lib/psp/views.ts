import { getStore, type DemoStore } from '@/lib/state/store';
import { now } from '@/lib/state/clock';
import { displayName } from '@/lib/patient/display';
import { permissionAt, membershipAt } from './permissions';
import { requireIdentity } from './transaction';
import { PspError } from './errors';
import type { PspProject,PspPermissionEvent,PspEnrollment,PspAssignment } from './types';
import {assignmentCompletion,educationFor,type EducationSummary} from './serviceSummary';
export type ProjectSummary=PspProject;
export type AssignmentSummary=Pick<PspAssignment,'id'|'kind'|'title'|'assignedAt'|'dueAt'|'status'|'version'|'firstValidSubmittedAt'|'latestValidResponseId'>&{actionable:boolean;completion?:{at:string;background:boolean}};
type Permissions={service:boolean;aggregate:boolean};
export type PatientProjectsView={patientId:string;displayName:string;projects:{project:ProjectSummary;enrollment:Pick<PspEnrollment,'id'|'status'|'version'|'eligibilityConfirmed'>;permissions:Permissions;permissionHistory:PspPermissionEvent[];assignments:AssignmentSummary[];education?:EducationSummary[]}[];seedVersion:number;serverNow:string};
export type InternalProjectView={project:ProjectSummary;counts:{candidates:number;activeService:number;aggregateAllowed:number};enrollments:(Pick<PspEnrollment,'id'|'patientId'|'status'|'version'|'eligibilityConfirmed'>&{displayName:string;permissions:Permissions;assignments:AssignmentSummary[]})[];seedVersion:number;serverNow:string};
export function projectSummary(p:PspProject):ProjectSummary {
  return {id:p.id,title:p.title,sponsor:p.sponsor,scope:p.scope,population:p.population,startsAt:p.startsAt,endsAt:p.endsAt,period:p.period,cutoffAt:p.cutoffAt,configVersion:p.configVersion,status:p.status,contactTargets:{high:p.contactTargets.high,medium:p.contactTargets.medium}};
}
export const currentPermissions=(s:DemoStore,id:string,at:string):Permissions=>({service:permissionAt(s.psp,id,'service',at),aggregate:permissionAt(s.psp,id,'aggregate',at)});
export function assignments(s:DemoStore,e:PspEnrollment,at:string):AssignmentSummary[] {
  const active=membershipAt(s.psp,e.id,at)==='active'&&permissionAt(s.psp,e.id,'service',at);
  return s.psp.assignments.filter(a=>a.enrollmentId===e.id).map(a=>({id:a.id,kind:a.kind,title:a.title,assignedAt:a.assignedAt,dueAt:a.dueAt,status:a.status,version:a.version,firstValidSubmittedAt:a.firstValidSubmittedAt,latestValidResponseId:a.latestValidResponseId,actionable:active&&a.status==='open',...(assignmentCompletion(s.psp,a)?{completion:assignmentCompletion(s.psp,a)}:{})}));
}
export function getPatientProjectsView(patientId:string,role:string|null,actorId:string|null):PatientProjectsView {
  requireIdentity(role,actorId,['patient'],patientId);
  const s=getStore(), patient=s.patients.get(patientId),at=now();
  if(!patient) throw new PspError(404,'not_found','患者不存在');
  return {patientId,displayName:displayName(patientId),projects:s.psp.enrollments.filter(e=>e.patientId===patientId).map(e=>({project:projectSummary(s.psp.project),enrollment:{id:e.id,status:e.status,version:e.version,eligibilityConfirmed:e.eligibilityConfirmed},permissions:currentPermissions(s,e.id,at),permissionHistory:s.psp.permissionEvents.filter(event=>event.enrollmentId===e.id).map(event=>({...event})),assignments:assignments(s,e,at),education:educationFor(s.psp,e.id)})),seedVersion:s.seedVersion,serverNow:at};
}
export function getInternalProjectView(projectId:string,role:string|null,actorId:string|null):InternalProjectView {
  requireIdentity(role,actorId,['case_manager','doctor','project_manager','data_reviewer','medical_reviewer']);
  const s=getStore(),at=now();
  if(projectId!==s.psp.project.id) throw new PspError(404,'not_found','项目不存在');
  const enrollments=s.psp.enrollments.map(e=>({id:e.id,patientId:e.patientId,status:e.status,version:e.version,eligibilityConfirmed:e.eligibilityConfirmed,displayName:displayName(e.patientId),permissions:currentPermissions(s,e.id,at),assignments:assignments(s,e,at)}));
  return {project:projectSummary(s.psp.project),counts:{candidates:enrollments.length,activeService:enrollments.filter(e=>e.status==='active'&&e.permissions.service).length,aggregateAllowed:enrollments.filter(e=>e.status==='active'&&e.permissions.service&&e.permissions.aggregate).length},enrollments,seedVersion:s.seedVersion,serverNow:at};
}
