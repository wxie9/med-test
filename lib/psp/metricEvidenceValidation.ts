import type {DemoStore} from '@/lib/state/store';
import {membershipAt,permissionAt} from './permissions';
import {actors} from './transaction';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const validTime=(time:string,start:string,end:string)=>Date.parse(time)>=Date.parse(start)&&Date.parse(time)<=Date.parse(end);
/** Cross-check copied metric facts against their exact clinical and PSP sources on every write and recovery. */
export function validatePspMetricEvidenceLinks(store:DemoStore):void {
 const p=store.psp,project=p.project,seenIds=new Set<string>([...p.membershipEvents,...p.permissionEvents,...p.serviceEvents,...(p.alertActions??[]),...(p.educationEvents??[]),...(p.corrections??[])].map(e=>e.id)),seenResponses=new Set<string>(),seenAlerts=new Set<string>();
 const enrollment=(id:string)=>p.enrollments.find(e=>e.id===id);
 const assignment=(id:string)=>p.assignments.find(a=>a.id===id);
 const unique=(id:string)=>{if(seenIds.has(id))throw new Error('Duplicate PSP metric evidence ID');seenIds.add(id);};
 for(const a of p.assignments){
  if(a.assignedSequence===undefined){
   if(a.assignedRecordedAt!==undefined)throw new Error('Incomplete PSP assignment birth metadata');
   // Schema-2 states written before this extension may have dynamic plans with
   // no birth proof. Keep them readable; the metric window excludes unknown births.
   continue;
  }
  if(!a.assignedRecordedAt||Date.parse(a.assignedRecordedAt)<Date.parse(a.assignedAt)||!validTime(a.assignedAt,project.startsAt,project.endsAt)||!validTime(a.assignedRecordedAt,project.startsAt,project.endsAt)||membershipAt(p,a.enrollmentId,a.assignedAt,a.assignedSequence)!=='active'||!permissionAt(p,a.enrollmentId,'service',a.assignedAt,a.assignedSequence))throw new Error('Invalid PSP assignment creation evidence');
 }
 for(const e of p.questionnaireEvidence??[]){
  unique(e.id);
  const a=assignment(e.assignmentId),owner=enrollment(e.enrollmentId),patient=owner?store.patients.get(owner.patientId):undefined,pro=patient?.pro.find(r=>r.id===e.responseId);
  if(seenResponses.has(e.responseId)||!a||a.kind!=='questionnaire'||a.enrollmentId!==e.enrollmentId||a.projectId!==e.projectId||e.projectId!==project.id||!owner||!pro||pro.scaleId!==e.scaleId||pro.submittedAt!==e.occurredAt||e.recordedAt!==e.occurredAt||e.actorId!==owner.patientId||!validTime(e.occurredAt,project.startsAt,project.endsAt)||Date.parse(e.occurredAt)<Date.parse(a.assignedAt)||membershipAt(p,e.enrollmentId,e.occurredAt,e.sequence)!=='active'||!permissionAt(p,e.enrollmentId,'service',e.occurredAt,e.sequence)||e.stopIntent!==(pro.flags.stopIntent??null)||e.revisionOf!==pro.revisionOf)throw new Error('Invalid PSP questionnaire metric evidence');
  const chain=new Set<string>();let cursor=a.latestValidResponseId;
  while(cursor&&!chain.has(cursor)){chain.add(cursor);cursor=patient!.pro.find(response=>response.id===cursor)?.revisionOf??null;}
  if(!chain.has(e.responseId)||cursor)throw new Error('PSP metric questionnaire response is outside assignment chain');
  seenResponses.add(e.responseId);
  if(e.revisionOf){
   const parent=patient!.pro.find(r=>r.id===e.revisionOf),prior=(p.questionnaireEvidence??[]).find(x=>x.responseId===e.revisionOf);
   if(!parent||parent.id===pro.id||Date.parse(parent.submittedAt)>Date.parse(e.occurredAt)||(prior&&(prior.assignmentId!==e.assignmentId||prior.sequence>=e.sequence)))throw new Error('Invalid PSP metric questionnaire revision chain');
  }
  const actual=store.alerts.filter(alert=>alert.proId===e.responseId&&alert.patientId===owner.patientId).map(alert=>({id:alert.id,kind:alert.kind,level:alert.level,triggeredAt:alert.timestamps.triggered}));
  if(!same([...actual].sort((x,y)=>x.id.localeCompare(y.id)),[...e.alerts].sort((x,y)=>x.id.localeCompare(y.id))))throw new Error('Invalid PSP copied questionnaire alerts');
  for(const alert of e.alerts){if(seenAlerts.has(alert.id))throw new Error('Duplicate PSP metric alert');seenAlerts.add(alert.id);}
 }
 for(const a of p.assignments.filter(a=>a.kind==='questionnaire')){
  const copies=(p.questionnaireEvidence??[]).filter(e=>e.assignmentId===a.id).sort((x,y)=>x.sequence-y.sequence);
  if(copies.length&&copies.at(-1)!.responseId!==a.latestValidResponseId)throw new Error('PSP latest questionnaire lacks metric evidence');
 }
 for(const c of p.assignmentCancellations??[]){
  unique(c.id);
  const a=assignment(c.assignmentId);
  if(!a||a.enrollmentId!==c.enrollmentId||a.projectId!==c.projectId||c.projectId!==project.id||a.status!=='cancelled'||!c.reason.trim()||![actors.case_manager,actors.project_manager].includes(c.actorId)||c.recordedAt!==c.occurredAt||!validTime(c.occurredAt,project.startsAt,project.endsAt)||Date.parse(c.occurredAt)<Date.parse(a.assignedAt)||(membershipAt(p,c.enrollmentId,c.occurredAt,c.sequence)==='active'&&permissionAt(p,c.enrollmentId,'service',c.occurredAt,c.sequence)))throw new Error('Invalid PSP assignment cancellation evidence');
  if((p.assignmentCancellations??[]).filter(other=>other.assignmentId===c.assignmentId).length!==1)throw new Error('Duplicate PSP assignment cancellation');
 }
}
