import type {ProjectSummary} from './views';
import type {PspCorrection,PspEnrollment,PspSelfReportRevision} from './types';
import {getStore} from '@/lib/state/store';
import {now,today} from '@/lib/state/clock';
import {displayName} from '@/lib/patient/display';
import {currentPermissions,projectSummary} from './views';
import {requireIdentity} from './transaction';
import {serviceAllowed} from './serviceRules';
import {selectSelfReportSourcesAsOf} from './evidenceWindow';
import {PspError} from './errors';
export type ProjectAdherenceView={patientId:string;displayName:string;project:ProjectSummary;enrollment:Pick<PspEnrollment,'id'|'status'|'version'>;permissions:{service:boolean;aggregate:boolean};serverToday:string;serverNow:string;seedVersion:number;canSubmit:boolean;latestToday:PspSelfReportRevision|null;records:PspSelfReportRevision[];history:{importedCount:number;includedCount:number;excludedCount:number;notice:string}};
export type CorrectionDeskView={project:ProjectSummary;seedVersion:number;serverNow:string;enrollments:(Pick<PspEnrollment,'id'|'patientId'|'status'|'version'>&{displayName:string;canImport:boolean})[];contacts:{sourceRef:{kind:'contact';id:string};interactionId:string;enrollmentId:string;displayName:string;assignmentId?:string;alertIds:string[];channel:'phone'|'message'|null;outcome:'reached'|'no_answer'|'refused'|'channel_unavailable';occurredAt:string;recordedAt:string;background:boolean;canPropose:boolean}[];corrections:(PspCorrection&{displayName:string;canVerify:boolean})[];historyNotice:string};
export function getProjectAdherenceView(enrollmentId:string,role:string|null,actorId:string|null):ProjectAdherenceView {
 const s=getStore(),enrollment=s.psp.enrollments.find(e=>e.id===enrollmentId&&e.projectId===s.psp.project.id);
 if(!enrollment)throw new PspError(404,'not_found','项目成员不存在');
 requireIdentity(role,actorId,['patient','case_manager','doctor','data_reviewer','project_manager'],enrollment.patientId);
 const at=now(),serverToday=today(),records=(s.psp.selfReportRevisions??[]).filter(r=>r.enrollmentId===enrollmentId&&r.projectId===s.psp.project.id);
 const legacy=records.filter(r=>r.precision==='date_only'),selected=selectSelfReportSourcesAsOf(s.psp,enrollmentId,{periodStart:s.psp.project.startsAt,periodEnd:s.psp.project.endsAt,cutoffAt:s.psp.project.cutoffAt,ledgerRevision:s.psp.ledgerRevision,scope:'internal'});
 const included=legacy.filter(r=>selected.some(v=>v.sourceId===r.sourceId)).length;
 return structuredClone({patientId:enrollment.patientId,displayName:displayName(enrollment.patientId),project:projectSummary(s.psp.project),enrollment:{id:enrollment.id,status:enrollment.status,version:enrollment.version},permissions:currentPermissions(s,enrollmentId,at),serverToday,serverNow:at,seedVersion:s.seedVersion,canSubmit:role==='patient'&&serviceAllowed(s,enrollmentId,at),latestToday:records.filter(r=>r.precision==='instant'&&r.logDate===serverToday).sort((a,b)=>b.sequence-a.sequence)[0]??null,records,history:{importedCount:legacy.length,includedCount:included,excludedCount:legacy.length-included,notice:'历史日期级记录仅采用完整授权服务日；当天与边界日不导入，迟到入账不进入旧截止版本。数量表示已保存来源的可用性，非月报指标。'}});
}
export function getCorrectionDeskView(projectId:string,role:string|null,actorId:string|null):CorrectionDeskView {
 requireIdentity(role,actorId,['case_manager','data_reviewer','project_manager']);
 const s=getStore();if(projectId!==s.psp.project.id)throw new PspError(404,'not_found','项目不存在');
 const at=now(),corrections=s.psp.corrections??[],enrollments=s.psp.enrollments.filter(e=>e.projectId===projectId);
 const name=(id:string)=>displayName(enrollments.find(e=>e.id===id)!.patientId);
 return structuredClone({project:projectSummary(s.psp.project),seedVersion:s.seedVersion,serverNow:at,enrollments:enrollments.map(e=>({id:e.id,patientId:e.patientId,displayName:name(e.id),status:e.status,version:e.version,canImport:role==='case_manager'&&serviceAllowed(s,e.id,at)})),contacts:s.psp.serviceEvents.filter(e=>e.projectId===projectId).map(e=>({sourceRef:{kind:'contact' as const,id:e.id},interactionId:e.interactionId,enrollmentId:e.enrollmentId,displayName:name(e.enrollmentId),...(e.assignmentId?{assignmentId:e.assignmentId}:{}),alertIds:[...e.alertIds],channel:e.channel??null,outcome:e.outcome,occurredAt:e.occurredAt,recordedAt:e.recordedAt,background:!e.channel,canPropose:role==='case_manager'&&serviceAllowed(s,e.enrollmentId,at)&&!corrections.some(c=>c.sourceRef.id===e.id)})),corrections:corrections.map(c=>({...c,displayName:name(c.enrollmentId),canVerify:role==='data_reviewer'&&c.status==='proposed'&&serviceAllowed(s,c.enrollmentId,at)})),historyNotice:'补录保留原始来源，待数据审核者核验后才可供后续新快照采用；不会修改已保存来源、原计划或医生复核记录。'});
}
