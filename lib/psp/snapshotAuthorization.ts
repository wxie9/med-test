import type {PspState,PspPermissionEvent} from './types';
import type {PspServiceSnapshot,SnapshotSource} from './snapshotTypes';
export type SnapshotAggregateUsability={usable:boolean;reason:string|null};
const unusable:SnapshotAggregateUsability={usable:false,reason:'快照汇总来源的授权已不可用于新草稿，请选择授权可用的新快照或统计范围'};
const epoch=(value:unknown)=>Date.parse(String(value));
/** Pure current-use gate. Frozen aggregate roots identify grant intervals; supporting history alone is not a contribution. */
export function snapshotAggregateUsability(snapshot:PspServiceSnapshot,state:PspState,now:string):SnapshotAggregateUsability {
 if(snapshot.projectId!==state.project.id||snapshot.sourceLedgerRevision>state.ledgerRevision)return unusable;
 const byRef=new Map(snapshot.sources.map(s=>[s.ref,s])),revision=snapshot.sourceLedgerRevision,cutoff=epoch(snapshot.window.cutoffAt);
 const used=new Map<string,PspPermissionEvent>();let missing=false;
 const history=(id:string)=>snapshot.sources.filter(s=>(s.kind==='permission'||s.kind==='membership')&&s.value.enrollmentId===id);
 const latest=(id:string,kind:'permission'|'membership',at:number,sequence:number,scope?:string,visible?:SnapshotSource[]) =>(visible??history(id)).filter(s=>s.kind===kind&&(scope===undefined||s.value.scope===scope)&&Number(s.value.sequence)<=sequence&&epoch(s.value.occurredAt)<=at&&epoch(s.value.recordedAt)<=at).sort((a,b)=>epoch(b.value.occurredAt)-epoch(a.value.occurredAt)||Number(b.value.sequence)-Number(a.value.sequence))[0]?.value;
 const qualified=(id:string,at:number,sequence:number,visible?:SnapshotSource[])=>latest(id,'membership',at,sequence,undefined,visible)?.status==='active'&&latest(id,'permission',at,sequence,'service',visible)?.action==='grant'&&latest(id,'permission',at,sequence,'aggregate',visible)?.action==='grant';
 const recordGrant=(id:string,at:number,sequence=revision,requireService=true,visible?:SnapshotSource[])=>{
  if(!Number.isFinite(at)||at>cutoff)return false;
  if(requireService&&!qualified(id,at,sequence,visible))return false;
  const grant=latest(id,'permission',at,sequence,'aggregate',visible);
  if(grant?.action==='grant'){used.set(String(grant.id),grant as PspPermissionEvent);return true;}return false;
 };
 const point=(id:string,at:number,sequence=revision,requireService=true)=>{if(!recordGrant(id,at,sequence,requireService))missing=true;};
 // Enumerate all actual qualifying intervals. At a left boundary, final same-clock
 // state applies unless a transition itself witnesses a period contribution.
 const interval=(id:string,left:number,right:number,maxSequence=revision)=>{
  if(left>right)return false;let found=false;
  const events=history(id).filter(s=>Number(s.value.sequence)<=maxSequence&&epoch(s.value.recordedAt)<=cutoff);
  const effective=(s:SnapshotSource)=>Math.max(epoch(s.value.occurredAt),epoch(s.value.recordedAt));
  const visible=events.filter(s=>effective(s)<left);
  const transitions=events.filter(s=>effective(s)>=left&&effective(s)<=right).sort((a,b)=>effective(a)-effective(b)||Number(a.value.sequence)-Number(b.value.sequence));
  if(!transitions.some(s=>effective(s)===left))found=recordGrant(id,left,maxSequence,true,visible)||found;
  for(const source of transitions){visible.push(source);found=recordGrant(id,effective(source),maxSequence,true,visible)||found;}
  found=recordGrant(id,right,maxSequence,true,visible)||found;return found;
 };
 const sourcePoint=(source:SnapshotSource)=>{
  const v=source.value,id=String(v.enrollmentId),sequence=Number(v.sequence??revision);
  if(source.kind==='selfReport'&&v.precision==='date_only'){
   const start=epoch(`${v.logDate}T00:00:00+08:00`);point(id,start,sequence);interval(id,start+1,start+86400000-1,sequence);return;
  }
  if(source.kind==='contact'||source.kind==='correction'||source.kind==='questionnaireEvidence'||source.kind==='alertAction'||source.kind==='educationEvent'||source.kind==='selfReport')point(id,epoch(v.occurredAt),sequence);
  else if(source.kind==='alertBirth')point(id,epoch(v.triggeredAt),sequence);
  else if(source.kind==='educationResult')point(id,epoch(v.feedbackAt),sequence);
 };
 for(const evidence of snapshot.evidence.filter(e=>e.scope==='aggregate')){
  const roots=evidence.sourceRefs.map(ref=>byRef.get(ref)).filter((s):s is SnapshotSource=>!!s);
  if(roots.length!==evidence.sourceRefs.length){missing=true;continue;}
  if(evidence.metricKey==='period_members'||evidence.metricKey==='active_members'){
   for(const id of new Set(roots.map(s=>String(s.value.enrollmentId)))){
    if(evidence.metricKey==='active_members')point(id,cutoff);
    else if(!interval(id,Math.max(epoch(snapshot.window.periodStart),epoch(snapshot.project.startsAt)),Math.min(epoch(snapshot.window.periodEnd)-1,cutoff,epoch(snapshot.project.endsAt))))missing=true;
   }
   continue;
  }
  const corrected=new Set(roots.filter(s=>s.kind==='correction').map(s=>String((s.value.sourceRef as {id:string}).id)));
  for(const source of roots){
   if(source.kind==='permission'||source.kind==='membership'||source.kind==='enrollment'||corrected.has(source.ref))continue;
   // Alert questionnaire parents establish source linkage; alert births establish qualification.
   if(evidence.metricKey.startsWith('alert_')&&source.kind==='questionnaireEvidence')continue;
   if(source.kind==='assignment'){
    const v=source.value,id=String(v.enrollmentId),due=epoch(v.dueAt);
    if(due>=epoch(snapshot.window.periodStart)&&due<epoch(snapshot.window.periodEnd)&&due<=cutoff)point(id,due,revision,false);
    // Unknown prefixes retain their possible historical qualification even without a result.
    if(v.legacyEvidenceGap===true)interval(id,Math.max(epoch(v.legacyFirstValidSubmittedAt),epoch(v.assignedAt),epoch(snapshot.project.startsAt)),cutoff);
    else if(snapshot.aggregateMetrics.find(m=>m.key===evidence.metricKey)?.status==='unknown') {
     // Older non-early unknown facts lack a frozen gap-start witness. Only this
     // uncertain branch conservatively checks possible historical qualification.
     interval(id,Math.max(epoch(v.assignedAt),epoch(snapshot.project.startsAt)),cutoff);
    }
   }else sourcePoint(source);
  }
  for(const qualification of evidence.cohortQualifications){
   const source=byRef.get(qualification.ref);if(!source){missing=true;continue;}
   if(qualification.basis==='cutoff_grant')point(String(source.value.enrollmentId),cutoff);
   else if(qualification.basis==='legacy_gap')point(String(source.value.enrollmentId),epoch(qualification.witnessAt),qualification.witnessSequence);
   else {const result=byRef.get(qualification.sourceRef);if(result)sourcePoint(result);else missing=true;}
  }
  // Alert denominator cohorts can have no direct result root.
  for(const ref of evidence.cohortRefs){const source=byRef.get(ref);if(source?.kind==='alertBirth')sourcePoint(source);}
 }
 const visible=state.permissionEvents.filter(e=>e.scope==='aggregate'&&e.sequence<=state.ledgerRevision&&epoch(e.occurredAt)<=epoch(now)&&epoch(e.recordedAt)<=epoch(now));
 for(const grant of used.values()){
  if(!visible.some(e=>e.id===grant.id&&e.action==='grant'&&e.enrollmentId===grant.enrollmentId&&e.sequence===grant.sequence&&e.occurredAt===grant.occurredAt))return unusable;
  if(visible.some(e=>e.enrollmentId===grant.enrollmentId&&e.action==='withdraw'&&(epoch(e.occurredAt)>epoch(grant.occurredAt)||epoch(e.occurredAt)===epoch(grant.occurredAt)&&e.sequence>grant.sequence)))return unusable;
 }
 return missing?unusable:{usable:true,reason:null};
}
