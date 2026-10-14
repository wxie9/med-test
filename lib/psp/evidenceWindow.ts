import type {PspState,PspSelfReportRevision} from './types';
import {EvidenceDate} from './evidenceTypes';
import {membershipAt,permissionAt} from './permissions';
export type EvidenceWindow={periodStart:string;periodEnd:string;cutoffAt:string;ledgerRevision:number;scope:'internal'|'aggregate'};
const dayBounds=(date:string)=>{const start=Date.parse(`${date}T00:00:00+08:00`);return {start,end:start+86400000};};
const qualifiedAt=(state:PspState,id:string,epoch:number,scope:EvidenceWindow['scope'],revision:number)=>{
 const at=new Date(epoch).toISOString();
 return membershipAt(state,id,at,revision)==='active'&&permissionAt(state,id,'service',at,revision)&&(scope==='internal'||permissionAt(state,id,'aggregate',at,revision));
};
/** Dates are intervals; every visible interruption inside the day matters. */
export function wholeDayEligible(state:PspState,enrollmentId:string,logDate:string,options:EvidenceWindow):boolean {
 if(!EvidenceDate.safeParse(logDate).success)return false;
 const {start,end}=dayBounds(logDate),cutoff=Date.parse(options.cutoffAt),periodStart=Date.parse(options.periodStart),periodEnd=Date.parse(options.periodEnd);
 if(![cutoff,periodStart,periodEnd].every(Number.isFinite)||!Number.isInteger(options.ledgerRevision)||options.ledgerRevision<0||start<periodStart||end>periodEnd||end>cutoff||start<Date.parse(state.project.startsAt)||end-1>Date.parse(state.project.endsAt))return false;
 const known=(e:{sequence:number;recordedAt:string})=>e.sequence<=options.ledgerRevision&&Date.parse(e.recordedAt)<=cutoff;
 const effectiveAt=(e:{occurredAt:string;recordedAt:string})=>Math.max(Date.parse(e.occurredAt),Date.parse(e.recordedAt));
 const relevant=(e:{enrollmentId:string;sequence:number;recordedAt:string})=>e.enrollmentId===enrollmentId&&known(e);
 const memberships=state.membershipEvents.filter(relevant),permissions=state.permissionEvents.filter(relevant);
 // Midnight uses its final known state; later transitions must remain individually visible.
 const visible={...state,membershipEvents:memberships.filter(e=>effectiveAt(e)<=start),permissionEvents:permissions.filter(e=>effectiveAt(e)<=start)};
 if(!qualifiedAt(visible,enrollmentId,start,options.scope,options.ledgerRevision))return false;
 const transitions=[...memberships.map(event=>({kind:'membership' as const,event,epoch:effectiveAt(event)})),...permissions.map(event=>({kind:'permission' as const,event,epoch:effectiveAt(event)}))]
  .filter(e=>e.epoch>start&&e.epoch<end).sort((a,b)=>a.epoch-b.epoch||a.event.sequence-b.event.sequence);
 for(const transition of transitions){
  if(transition.kind==='membership')visible.membershipEvents.push(transition.event);else visible.permissionEvents.push(transition.event);
  if(!qualifiedAt(visible,enrollmentId,transition.epoch,options.scope,options.ledgerRevision))return false;
 }
 return true;
}
/** Select fixed values known at a cutoff; never consult the mutable clinical rows. */
export function selectSelfReportSourcesAsOf(state:PspState,enrollmentId:string,options:EvidenceWindow):PspSelfReportRevision[] {
 const cutoff=Date.parse(options.cutoffAt),start=Date.parse(options.periodStart),end=Date.parse(options.periodEnd);
 if(![cutoff,start,end].every(Number.isFinite)||end<=start||!Number.isInteger(options.ledgerRevision)||options.ledgerRevision<0)return [];
 const candidates=(state.selfReportRevisions??[]).filter(source=>{
  if(source.projectId!==state.project.id||source.enrollmentId!==enrollmentId||source.sequence>options.ledgerRevision||Date.parse(source.recordedAt)>cutoff)return false;
  const revision=Math.min(source.sequence,options.ledgerRevision);
  if(source.precision==='date_only')return wholeDayEligible(state,enrollmentId,source.logDate,{...options,ledgerRevision:revision});
  const at=Date.parse(source.occurredAt??'');
  return Number.isFinite(at)&&at>=start&&at<end&&at<=cutoff&&at>=Date.parse(state.project.startsAt)&&at<=Date.parse(state.project.endsAt)&&qualifiedAt(state,enrollmentId,at,options.scope,revision)&&qualifiedAt(state,enrollmentId,Date.parse(source.recordedAt),'internal',revision);
 });
 const selected=new Map<string,PspSelfReportRevision>();
 for(const source of candidates){const prior=selected.get(source.logDate);if(!prior||(source.precision==='instant'&&prior.precision==='date_only')||(source.precision===prior.precision&&source.sequence>prior.sequence))selected.set(source.logDate,source);}
 return structuredClone([...selected.values()].sort((a,b)=>a.logDate.localeCompare(b.logDate)));
}
