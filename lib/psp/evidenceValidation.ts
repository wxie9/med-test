import {createHash} from 'node:crypto';
import {canonicalJson} from './seed';
import {membershipAt,permissionAt} from './permissions';
import {actors,projectEnrollmentForAlert} from './transaction';
import {wholeDayEligible} from './evidenceWindow';
import {shanghaiCalendarDay} from '@/lib/domain/dates';
import type {DemoStore} from '@/lib/state/store';
import type {PspSelfReportRevision,PspCorrection} from './types';
export function selfReportHash(patientId:string,s:Pick<PspSelfReportRevision,'projectId'|'enrollmentId'|'logDate'|'due'|'taken'|'reason'|'precision'|'occurredAt'|'revisionOf'>):string {
 const {projectId,enrollmentId,logDate,due,taken,reason,precision,occurredAt,revisionOf}=s;
 return createHash('sha256').update(canonicalJson({patientId,projectId,enrollmentId,logDate,due,taken,reason,precision,occurredAt,...(revisionOf?{revisionOf}:{})})).digest('hex');
}
function qualified(s:DemoStore,enrollmentId:string,at:string,sequence:number):boolean {return Date.parse(at)>=Date.parse(s.psp.project.startsAt)&&Date.parse(at)<=Date.parse(s.psp.project.endsAt)&&membershipAt(s.psp,enrollmentId,at,sequence)==='active'&&permissionAt(s.psp,enrollmentId,'service',at,sequence);}
export function correctionOrigin(s:DemoStore,c:Pick<PspCorrection,'projectId'|'enrollmentId'|'sourceRef'|'interactionId'|'assignmentId'|'alertIds'|'sourceValue'|'occurredAt'|'sequence'>):void {
 const original=s.psp.serviceEvents.find(e=>e.id===c.sourceRef.id),assignment=c.assignmentId?s.psp.assignments.find(a=>a.id===c.assignmentId):undefined;
 if(!original||original.sequence>=c.sequence||c.projectId!==s.psp.project.id||c.projectId!==original.projectId||c.enrollmentId!==original.enrollmentId||c.interactionId!==original.interactionId||c.assignmentId!==original.assignmentId||canonicalJson(c.alertIds)!==canonicalJson(original.alertIds)||canonicalJson(c.sourceValue)!==canonicalJson({channel:original.channel??null,outcome:original.outcome,occurredAt:original.occurredAt})||(c.assignmentId&&(!assignment||assignment.kind!=='contact'||assignment.enrollmentId!==c.enrollmentId||Date.parse(c.occurredAt)<Date.parse(assignment.assignedAt))))throw new Error('Invalid PSP correction source reference or time');
 if(new Set(c.alertIds).size!==c.alertIds.length)throw new Error('Duplicate PSP correction alerts');
 for(const id of c.alertIds){const alert=s.alerts.find(a=>a.id===id);if(!alert||projectEnrollmentForAlert(s,id)?.id!==c.enrollmentId||Date.parse(c.occurredAt)<Date.parse(alert.timestamps.triggered))throw new Error('Invalid PSP correction alert reference or time');}
}
export function validatePspEvidenceLinks(s:DemoStore):void {
 const sources=s.psp.selfReportRevisions??[],corrections=s.psp.corrections??[],seen=new Set<string>(),legacy=new Set<string>();
 for(const source of sources){
  const enrollment=s.psp.enrollments.find(e=>e.id===source.enrollmentId);
  if(seen.has(source.sourceId)||!enrollment||!s.patients.has(enrollment.patientId)||source.projectId!==s.psp.project.id||source.sourceHash!==selfReportHash(enrollment.patientId,source)||!qualified(s,enrollment.id,source.recordedAt,source.sequence))throw new Error('Invalid PSP self-report identity, hash or authorization');
  seen.add(source.sourceId);
  if(source.precision==='date_only'){
   if(source.actorId!==actors.case_manager||source.sourceId!==`PSP:LEGACY:${source.projectId}:${source.enrollmentId}:${source.logDate}`||legacy.has(source.sourceId)||source.logDate>=shanghaiCalendarDay(source.recordedAt)||!wholeDayEligible(s.psp,enrollment.id,source.logDate,{periodStart:s.psp.project.startsAt,periodEnd:s.psp.project.endsAt,cutoffAt:source.recordedAt,ledgerRevision:source.sequence,scope:'internal'}))throw new Error('Invalid PSP legacy self-report day authorization');
   legacy.add(source.sourceId);
  }else{
   if(source.due!==1||![0,1].includes(source.taken)||source.actorId!==enrollment.patientId||source.occurredAt!==source.recordedAt||source.logDate!==shanghaiCalendarDay(source.occurredAt!)||!qualified(s,enrollment.id,source.occurredAt!,source.sequence))throw new Error('Invalid PSP precise self-report time or value');
   const prior=sources.filter(r=>r.enrollmentId===source.enrollmentId&&r.logDate===source.logDate&&r.precision==='instant'&&r.sequence<source.sequence).sort((a,b)=>b.sequence-a.sequence)[0];
   if(source.revisionOf!==prior?.sourceId||(prior&&Date.parse(prior.recordedAt)>Date.parse(source.recordedAt)))throw new Error('Invalid PSP self-report latest revision reference');
  }
 }
 const correctionIds=new Set<string>(),sourceIds=new Set<string>();
 for(const c of corrections){
  if(correctionIds.has(c.id)||sourceIds.has(c.sourceRef.id)||c.proposedBy!==actors.case_manager||!qualified(s,c.enrollmentId,c.occurredAt,c.sequence)||!qualified(s,c.enrollmentId,c.recordedAt,c.sequence)||Date.parse(c.occurredAt)>Date.parse(c.recordedAt))throw new Error('Invalid PSP correction identity or historical authorization');
  correctionIds.add(c.id);sourceIds.add(c.sourceRef.id);correctionOrigin(s,c);
  if(c.status==='proposed'){if(c.version!==1||c.verifiedAt!==null||c.verifiedBy!==null||c.verificationSequence!==null)throw new Error('Invalid PSP proposal verification metadata');}
  else if(c.version!==2||c.verifiedAt===null||c.verifiedBy!==actors.data_reviewer||c.verificationSequence===null||c.verificationSequence<=c.sequence||Date.parse(c.verifiedAt)<Date.parse(c.recordedAt)||!qualified(s,c.enrollmentId,c.verifiedAt,c.verificationSequence)||!qualified(s,c.enrollmentId,c.occurredAt,c.verificationSequence))throw new Error('Invalid PSP correction verification metadata or authorization');
 }
}
