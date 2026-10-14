import {z} from 'zod';
import {now,newId} from '@/lib/state/clock';
import {shanghaiCalendarDay} from '@/lib/domain/dates';
import {recordAdherenceInStore} from '@/lib/adherence/checkin';
import {EvidenceDate} from './evidenceTypes';
import type {CommandMeta,PspSelfReportRevision} from './types';
import {runServiceCommand} from './transaction';
import {requireService} from './serviceRules';
import {selfReportHash} from './evidenceValidation';
import {wholeDayEligible} from './evidenceWindow';
import {PspError} from './errors';
export const AdherenceInput=z.object({enrollmentId:z.string().min(1),logDate:EvidenceDate.optional(),due:z.literal(1),taken:z.union([z.literal(0),z.literal(1)]),reason:z.string().trim().max(500).optional(),revisionOf:z.string().min(1).optional()}).strict();
export type AdherenceInput=z.input<typeof AdherenceInput>;
export function submitProjectAdherence(raw:AdherenceInput,meta:CommandMeta){
 const input=AdherenceInput.parse(raw);
 return runServiceCommand({kind:'enrollment',id:input.enrollmentId},meta,{command:'adherence',...input},['patient'],s=>{
  const at=now(),logDate=shanghaiCalendarDay(at);requireService(s,input.enrollmentId,at);
  if(input.logDate&&input.logDate!==logDate)throw new PspError(400,'invalid_date','现场打卡仅支持上海今天');
  const enrollment=s.psp.enrollments.find(e=>e.id===input.enrollmentId)!,reason=input.taken===1?null:input.reason||null;
  const latest=(s.psp.selfReportRevisions??[]).filter(r=>r.enrollmentId===enrollment.id&&r.logDate===logDate&&r.precision==='instant').sort((a,b)=>b.sequence-a.sequence)[0];
  if(input.revisionOf){if(!latest||latest.sourceId!==input.revisionOf)throw new PspError(409,'invalid_revision','须引用今天最新证据作显式修订');}
  else if(latest){if(latest.taken===input.taken&&latest.due===input.due&&latest.reason===reason)return {data:latest,changed:false};throw new PspError(409,'revision_required','已有今天的证据，修改须显式修订');}
  recordAdherenceInStore(s,{patientId:enrollment.patientId,taken:input.taken,...(reason?{missedReason:reason}:{})},at);
  const payload={projectId:s.psp.project.id,enrollmentId:enrollment.id,logDate,due:input.due,taken:input.taken,reason,precision:'instant' as const,occurredAt:at,...(input.revisionOf?{revisionOf:input.revisionOf}:{})};
  const source:PspSelfReportRevision={...payload,sourceId:newId('psp-self-report'),recordedAt:at,actorId:meta.actorId,sequence:++s.psp.ledgerRevision,sourceHash:selfReportHash(enrollment.patientId,payload)};
  (s.psp.selfReportRevisions??=[]).push(source);return {data:source,changed:true};
 });
}
export function importLegacySelfReports(enrollmentId:string,meta:CommandMeta){
 z.string().min(1).parse(enrollmentId);
 return runServiceCommand({kind:'enrollment',id:enrollmentId},meta,{command:'import_legacy',enrollmentId},['case_manager'],s=>{
  const at=now();requireService(s,enrollmentId,at);const enrollment=s.psp.enrollments.find(e=>e.id===enrollmentId)!,patient=s.patients.get(enrollment.patientId)!,sourceIds:string[]=[];
  const clinicalDates=new Set<string>();
  for(const row of patient.adherence){
   if(clinicalDates.has(row.date))throw new PspError(409,'duplicate_clinical_date','临床日期重复，须先核对');clinicalDates.add(row.date);
   if(!EvidenceDate.safeParse(row.date).success||row.date>=shanghaiCalendarDay(at)||(s.psp.selfReportRevisions??[]).some(r=>r.enrollmentId===enrollmentId&&r.logDate===row.date)||!wholeDayEligible(s.psp,enrollmentId,row.date,{periodStart:s.psp.project.startsAt,periodEnd:s.psp.project.endsAt,cutoffAt:at,ledgerRevision:s.psp.ledgerRevision,scope:'internal'}))continue;
   const payload={projectId:s.psp.project.id,enrollmentId,logDate:row.date,due:row.due,taken:row.taken,reason:row.missedReason??null,precision:'date_only' as const,occurredAt:null};
   const source:PspSelfReportRevision={...payload,sourceId:`PSP:LEGACY:${s.psp.project.id}:${enrollmentId}:${row.date}`,recordedAt:at,actorId:meta.actorId,sequence:++s.psp.ledgerRevision,sourceHash:selfReportHash(enrollment.patientId,payload)};
   (s.psp.selfReportRevisions??=[]).push(source);sourceIds.push(source.sourceId);
  }
  return {data:{enrollmentId,importedCount:sourceIds.length,sourceIds},changed:sourceIds.length>0};
 });
}
