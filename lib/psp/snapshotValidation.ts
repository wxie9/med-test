import {createHash} from 'node:crypto';
import {z} from 'zod';
import {PspCorrection,PspSelfReportRevision} from './evidenceTypes';
import {PspAssignmentCancellation} from './metricEvidenceTypes';
import type {PspState} from './types';
import type {PspServiceSnapshot} from './snapshotTypes';
import {PspServiceSnapshotSchema} from './snapshotTypes';
import type {SnapshotSourceKind} from './snapshotTypes';
import {protectMetricGroups,PSP_PROTECTION_VERSION} from './protection';
import {createSnapshotSourceGraph} from './snapshotSourceGraph';
const canonicalJson=(value:unknown):string=>{
 if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
 if(value!==null&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
 return JSON.stringify(value);
};

export function snapshotDigest(snapshot:Omit<PspServiceSnapshot,'contentDigest'>):string {
 return createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
}
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const common=['id','projectId','enrollmentId','occurredAt','recordedAt','actorId','sequence'];
const allowed:Record<SnapshotSourceKind,readonly string[]>={
 enrollment:['id','projectId'],membership:[...common,'status','reason'],permission:[...common,'scope','action','textVersion'],
 assignment:['id','projectId','enrollmentId','kind','title','assignedAt','dueAt','ownerRole','source','assignedRecordedAt','assignedSequence','birthEvidence','legacyFirstValidSubmittedAt','legacyEvidenceGap'],
 assignmentCancellation:[...common,'assignmentId','reason'],contact:[...common,'assignmentId','channel','kind','interactionId','alertIds','outcome','source'],
 correction:['id','projectId','enrollmentId','sourceRef','interactionId','assignmentId','alertIds','sourceValue','correctedValue','reason','occurredAt','recordedAt','proposedBy','sequence','version','status','verifiedAt','verifiedBy','verificationSequence'],
 questionnaireEvidence:[...common,'assignmentId','responseId','scaleId','stopIntent','revisionOf'],
 alertBirth:['id','kind','level','triggeredAt','projectId','enrollmentId','questionnaireEvidenceId','sequence'],
 alertAction:[...common,'alertId','action','disposition','note','followupTaskId','followupAssignmentId'],
 educationContent:['id','version','title','scope','status','approvedAt','approvedBy'],
 educationEvent:[...common,'assignmentId','contentVersionId','action','understood','needsHelp','followupAssignmentId'],
 educationResult:['assignmentId','contentVersionId','sentAt','openedAt','feedbackAt','understood','needsHelp','actorId','sequence','projectId','enrollmentId'],
 selfReport:['sourceId','projectId','enrollmentId','logDate','due','taken','reason','precision','occurredAt','recordedAt','actorId','sequence','sourceHash','revisionOf'],
};
const id=z.string().min(1),time=z.string().datetime({offset:true}),sequence=z.number().int().positive();
const event={id,enrollmentId:id,occurredAt:time,recordedAt:time,actorId:id,sequence};
const sourceValueSchemas:Record<SnapshotSourceKind,z.ZodTypeAny>={
 enrollment:z.object({id,projectId:id}).strict(),
 membership:z.object({...event,status:z.enum(['invited','active','paused','exited']),reason:id}).strict(),
 permission:z.object({...event,scope:z.enum(['service','aggregate']),action:z.enum(['grant','withdraw']),textVersion:id}).strict(),
 assignment:z.object({id,projectId:id,enrollmentId:id,kind:z.enum(['questionnaire','contact','education']),title:id,assignedAt:time,dueAt:time,ownerRole:id,source:z.literal('psp-v1'),assignedRecordedAt:time.optional(),assignedSequence:sequence.optional(),birthEvidence:z.enum(['seed_fixed','unproven_legacy']).optional(),legacyFirstValidSubmittedAt:time.optional(),legacyEvidenceGap:z.literal(true).optional()}).strict(),
 assignmentCancellation:PspAssignmentCancellation,
 contact:z.object({...event,projectId:id,assignmentId:id.optional(),channel:z.enum(['phone','message']).optional(),kind:z.literal('contact'),interactionId:id,alertIds:z.array(id),outcome:z.enum(['reached','no_answer','refused','channel_unavailable']),source:z.literal('psp-v1')}).strict(),
 correction:PspCorrection,
 questionnaireEvidence:z.object({...event,projectId:id,assignmentId:id,responseId:id,scaleId:z.literal('endocrine_monthly_v1'),stopIntent:z.boolean().nullable(),revisionOf:id.optional()}).strict(),
 alertBirth:z.object({id,kind:z.enum(['symptom','adherence']),level:z.enum(['high','medium']),triggeredAt:time,projectId:id,enrollmentId:id,questionnaireEvidenceId:id,sequence}).strict(),
 alertAction:z.object({...event,projectId:id,alertId:id,action:z.enum(['accept','start','submit_review','close']),disposition:z.object({category:id,summary:id,interactionIds:z.array(id).min(1)}).strict().optional(),note:id.optional(),followupTaskId:id.optional(),followupAssignmentId:id.optional()}).strict(),
 educationContent:z.object({id,version:sequence,title:id,scope:id,status:z.literal('approved'),approvedAt:time,approvedBy:id}).strict(),
 educationEvent:z.object({...event,projectId:id,assignmentId:id,contentVersionId:id,action:z.enum(['send','open','feedback']),understood:z.boolean().optional(),needsHelp:z.boolean().optional(),followupAssignmentId:id.optional()}).strict(),
 educationResult:z.object({assignmentId:id,contentVersionId:id,sentAt:time,openedAt:time.nullable(),feedbackAt:time.nullable(),understood:z.boolean().nullable(),needsHelp:z.boolean().nullable(),actorId:id,sequence,projectId:id,enrollmentId:id}).strict(),
 selfReport:PspSelfReportRevision,
};
function validateSource(source:import('./snapshotTypes').SnapshotSource,snapshot:PspServiceSnapshot,sourceByRef:Map<string,import('./snapshotTypes').SnapshotSource>):void {
 const v=source.value,kind=source.kind;
 sourceValueSchemas[kind].parse(v);
 if(Object.keys(v).some(key=>!allowed[kind].includes(key)))throw new Error('Unexpected PSP snapshot source field');
 const indexed=kind==='educationResult'?`psp.educationResults[assignmentId=${v.assignmentId},sequence=${v.sequence}]`:kind==='selfReport'?`psp.selfReportRevisions[sourceId=${v.sourceId}]`:kind==='alertBirth'?`psp.questionnaireEvidence[id=${v.questionnaireEvidenceId}].alerts[id=${v.id}]`:`psp.${({enrollment:'enrollments',membership:'membershipEvents',permission:'permissionEvents',assignment:'assignments',assignmentCancellation:'assignmentCancellations',contact:'serviceEvents',correction:'corrections',questionnaireEvidence:'questionnaireEvidence',alertAction:'alertActions',educationContent:'educationContents',educationEvent:'educationEvents'} as Partial<Record<SnapshotSourceKind,string>>)[kind]}[id=${v.id}]`;
 const expectedRef=kind==='educationResult'?`education-result:${v.assignmentId}:${v.sequence}`:kind==='selfReport'?v.sourceId:v.id;
 if(source.locator!==indexed||source.ref!==expectedRef)throw new Error('Invalid PSP snapshot source locator');
 if(v.projectId!==undefined&&v.projectId!==snapshot.projectId)throw new Error('Invalid PSP snapshot source project');
 if(v.sequence!==undefined&&(!Number.isInteger(v.sequence)||Number(v.sequence)>snapshot.sourceLedgerRevision))throw new Error('PSP snapshot source ahead of ledger');
 if(typeof v.recordedAt==='string'&&Date.parse(v.recordedAt)>Date.parse(snapshot.window.cutoffAt))throw new Error('PSP snapshot source after cutoff');
 if(kind==='assignment'&&((v.assignedRecordedAt!==undefined&&Date.parse(String(v.assignedRecordedAt))>Date.parse(snapshot.window.cutoffAt))||(v.assignedSequence!==undefined&&Number(v.assignedSequence)>snapshot.sourceLedgerRevision)))throw new Error('PSP assignment birth after cutoff');
 if(kind==='correction'&&(v.status!=='verified'||Number(v.verificationSequence)>snapshot.sourceLedgerRevision||Date.parse(String(v.verifiedAt))>Date.parse(snapshot.window.cutoffAt)))throw new Error('PSP correction not verified at freeze');
 if(kind==='educationContent'&&Date.parse(String(v.approvedAt))>Date.parse(snapshot.window.cutoffAt))throw new Error('PSP content approved after freeze');
 if(kind==='alertBirth'&&!sourceByRef.has(String(v.questionnaireEvidenceId)))throw new Error('PSP alert birth lacks questionnaire evidence');
 if(kind==='educationResult'&&!sourceByRef.has(String(v.assignmentId)))throw new Error('PSP education result lacks assignment');
 if(kind==='correction'&&!sourceByRef.has(String((v.sourceRef as {id?:string})?.id)))throw new Error('PSP correction lacks original contact');
 if(v.enrollmentId!==undefined){const enrollment=sourceByRef.get(String(v.enrollmentId));if(!enrollment||enrollment.kind!=='enrollment'||enrollment.value.projectId!==snapshot.projectId)throw new Error('PSP source enrollment mismatch');}
 if(v.assignmentId!==undefined){const assignment=sourceByRef.get(String(v.assignmentId));if(!assignment||assignment.kind!=='assignment'||assignment.value.enrollmentId!==v.enrollmentId)throw new Error('PSP source assignment mismatch');}
}
/** Only frozen, internally consistent facts are checked; mutable source state can change later. */
export function validatePspSnapshots(state:PspState,seedVersion?:number):void {
 const seen=new Set<string>();
 for(const raw of state.snapshots??[]){
  const snapshot=PspServiceSnapshotSchema.parse(raw) as PspServiceSnapshot;
  if(seedVersion!==undefined&&snapshot.seedVersion!==seedVersion)throw new Error('Invalid PSP snapshot seed binding');
  if(seen.has(snapshot.id)||snapshot.projectId!==state.project.id||snapshot.project.id!==snapshot.projectId||snapshot.sourceLedgerRevision>=state.ledgerRevision||snapshot.authorizationVersionAtFreeze>state.authorizationVersion)throw new Error('Invalid PSP snapshot identity or version');
  seen.add(snapshot.id);
  const {contentDigest,...body}=snapshot;
  if(snapshotDigest(body)!==contentDigest)throw new Error('PSP snapshot digest mismatch');
  if(snapshot.algorithmVersion!=='psp-metrics-v1'||snapshot.protectionVersion!==PSP_PROTECTION_VERSION||Date.parse(snapshot.window.periodEnd)<=Date.parse(snapshot.window.periodStart)||Date.parse(snapshot.window.cutoffAt)>Date.parse(snapshot.createdAt))throw new Error('Invalid PSP snapshot window');
  if(!same(protectMetricGroups(snapshot.aggregateMetrics),snapshot.protectedMetrics))throw new Error('Invalid PSP protected projection');
  const sourceByRef=new Map(snapshot.sources.map(source=>[source.ref,source]));
  if(sourceByRef.size!==snapshot.sources.length)throw new Error('Duplicate PSP snapshot source');
  for(const source of snapshot.sources)validateSource(source,snapshot,sourceByRef);
  const graph=createSnapshotSourceGraph(snapshot.sources,{projectId:snapshot.projectId,projectStartsAt:snapshot.project.startsAt,projectEndsAt:snapshot.project.endsAt,window:snapshot.window,sourceLedgerRevision:snapshot.sourceLedgerRevision});
  graph.validateAll();
  const cutoff=Date.parse(snapshot.window.cutoffAt),projectStart=Date.parse(snapshot.project.startsAt),projectEnd=Date.parse(snapshot.project.endsAt);
  const qualified=(id:string,at:string,revision:number,scope:'internal'|'aggregate')=>{
   const time=Date.parse(at);
   if(time<projectStart||time>projectEnd||time>cutoff||!sourceByRef.has(id))return false;
   const latest=(kind:'membership'|'permission',permissionScope?:'service'|'aggregate')=>snapshot.sources.filter(s=>s.kind===kind&&s.value.enrollmentId===id&&(permissionScope===undefined||s.value.scope===permissionScope)&&Number(s.value.sequence)<=revision&&Date.parse(String(s.value.occurredAt))<=time&&Date.parse(String(s.value.recordedAt))<=time).sort((a,b)=>Date.parse(String(b.value.occurredAt))-Date.parse(String(a.value.occurredAt))||Number(b.value.sequence)-Number(a.value.sequence))[0]?.value;
   return latest('membership')?.status==='active'&&latest('permission','service')?.action==='grant'&&(scope==='internal'||latest('permission','aggregate')?.action==='grant');
  };
  const assignmentKnown=(v:Record<string,unknown>)=>{
   const id=String(v.enrollmentId),at=String(v.assignedAt),seq=Number(v.assignedSequence);
   if(Date.parse(at)>cutoff)return false;
   if(v.assignedSequence!==undefined)return Date.parse(String(v.assignedRecordedAt))<=cutoff&&qualified(id,at,seq,'internal');
   if(v.birthEvidence==='seed_fixed')return snapshot.sources.some(s=>(s.kind==='membership'||s.kind==='permission')&&s.value.enrollmentId===id&&Date.parse(String(s.value.occurredAt))<=projectStart&&Date.parse(String(s.value.recordedAt))<=projectStart&&qualified(id,at,Number(s.value.sequence),'internal'));
   return snapshot.sources.some(s=>(s.kind==='alertAction'||s.kind==='educationEvent')&&s.value.followupAssignmentId===v.id&&s.value.enrollmentId===id&&Date.parse(String(s.value.occurredAt))===Date.parse(at)&&qualified(id,at,Number(s.value.sequence),'internal'));
  };
  const metricPairs=new Map<string,import('./metricTypes').Metric>();
  for(const [scope,metrics] of [['internal',snapshot.internalMetrics],['aggregate',snapshot.aggregateMetrics]] as const)for(const metric of metrics){
   const key=`${scope}:${metric.key}`;
   if(metricPairs.has(key)||metric.window.projectId!==snapshot.projectId||metric.window.scope!==scope||metric.window.ledgerRevision!==snapshot.sourceLedgerRevision||!same({periodStart:metric.window.periodStart,periodEnd:metric.window.periodEnd,cutoffAt:metric.window.cutoffAt},snapshot.window))throw new Error('Invalid PSP snapshot metric window or key');
   metricPairs.set(key,metric);
  }
  if(snapshot.evidence.length!==metricPairs.size)throw new Error('Incomplete PSP snapshot evidence');
  const evidencePairs=new Set<string>();
  for(const evidence of snapshot.evidence){
   const key=`${evidence.scope}:${evidence.metricKey}`,metric=metricPairs.get(key);
   const qualificationRefs=evidence.cohortQualifications.flatMap(q=>q.basis==='historical_result'?[q.sourceRef]:q.basis==='legacy_gap'&&q.firstTypedSourceRef?[q.firstTypedSourceRef]:[]);
   const required=graph.closure([...evidence.sourceRefs,...evidence.cohortRefs,...qualificationRefs]).filter(ref=>!evidence.sourceRefs.includes(ref));
   if(!metric||evidencePairs.has(key)||!same(metric.sourceRefs,evidence.sourceRefs)||!same(evidence.supportingRefs,required))throw new Error('Invalid PSP snapshot evidence closure');
   const cohortKind=evidence.metricKey.endsWith('_early_completed')?evidence.metricKey.slice(0,-'_early_completed'.length):evidence.metricKey==='alert_pending'||evidence.metricKey==='alert_due_uncontacted'?'alert':null;
   if(!same(evidence.cohortRefs,[...new Set(evidence.cohortRefs)].sort())||(!cohortKind&&evidence.cohortRefs.length)||metric.sampleN!==null&&cohortKind&&metric.sampleN!==evidence.cohortRefs.length)throw new Error('Invalid PSP snapshot cohort size or order');
   const aggregateEarly=evidence.scope==='aggregate'&&cohortKind!==null&&cohortKind!=='alert';
   if(aggregateEarly?!same(evidence.cohortQualifications.map(q=>q.ref),evidence.cohortRefs):evidence.cohortQualifications.length!==0)throw new Error('Invalid PSP snapshot cohort qualifications');
   if(cohortKind){
    for(const ref of evidence.cohortRefs){
     const source=sourceByRef.get(ref),v=source?.value;
     if(!source||!v)throw new Error('Missing PSP snapshot cohort source');
     if(cohortKind==='alert'){
      const triggered=Date.parse(String(v.triggeredAt));
      if(source.kind!=='alertBirth'||triggered<Date.parse(snapshot.window.periodStart)||triggered>=Date.parse(snapshot.window.periodEnd)||triggered>cutoff||!qualified(String(v.enrollmentId),String(v.triggeredAt),Number(v.sequence),evidence.scope))throw new Error('Invalid PSP snapshot alert cohort source');
     }else {
      if(source.kind!=='assignment'||v.kind!==cohortKind||Date.parse(String(v.dueAt))<=cutoff||!assignmentKnown(v)||!qualified(String(v.enrollmentId),String(v.assignedAt),Number(v.assignedSequence??snapshot.sourceLedgerRevision),'internal'))throw new Error('Invalid PSP snapshot early cohort source');
      if(aggregateEarly){
       const witness=evidence.cohortQualifications.find(q=>q.ref===ref)!;
       if(witness.basis==='cutoff_grant'){
        if(!qualified(String(v.enrollmentId),snapshot.window.cutoffAt,snapshot.sourceLedgerRevision,'aggregate'))throw new Error('PSP aggregate cutoff qualification missing');
       }else if(witness.basis==='historical_result'){
        const result=sourceByRef.get(witness.sourceRef),r=result?.value;
        if(!result||!r||r.assignmentId!==ref||r.enrollmentId!==v.enrollmentId)throw new Error('PSP aggregate historical result source mismatch');
        let occurredAt:string,sequence:number,valid=false;
        if(result.kind==='questionnaireEvidence'&&cohortKind==='questionnaire'){occurredAt=String(r.occurredAt);sequence=Number(r.sequence);valid=true;}
        else if(result.kind==='contact'&&cohortKind==='contact'){occurredAt=String(r.occurredAt);sequence=Number(r.sequence);valid=r.outcome==='reached';}
        else if(result.kind==='correction'&&cohortKind==='contact'){const corrected=r.correctedValue as Record<string,unknown>;occurredAt=String(r.occurredAt);sequence=Number(r.sequence);valid=corrected.outcome==='reached';}
        else if(result.kind==='educationEvent'&&cohortKind==='education'){occurredAt=String(r.occurredAt);sequence=Number(r.sequence);valid=r.action==='feedback'&&typeof r.understood==='boolean'&&typeof r.needsHelp==='boolean';}
        else if(result.kind==='educationResult'&&cohortKind==='education'){occurredAt=String(r.feedbackAt);sequence=Number(r.sequence);valid=r.feedbackAt!==null&&typeof r.understood==='boolean'&&typeof r.needsHelp==='boolean';}
        else throw new Error('PSP aggregate historical result type mismatch');
        if(!valid||Date.parse(occurredAt)<Date.parse(String(v.assignedAt))||!qualified(String(v.enrollmentId),occurredAt,sequence,'aggregate'))throw new Error('PSP aggregate historical result qualification missing');
       }else{
        const first=String(v.legacyFirstValidSubmittedAt),witnessAt=Date.parse(witness.witnessAt),firstTyped=witness.firstTypedSourceRef?sourceByRef.get(witness.firstTypedSourceRef):undefined;
        const typed=snapshot.sources.filter(s=>s.kind==='questionnaireEvidence'&&s.value.assignmentId===ref).sort((a,b)=>Number(a.value.sequence)-Number(b.value.sequence));
        const left=Math.max(Date.parse(first),Date.parse(String(v.assignedAt)),projectStart),right=Math.min(cutoff,projectEnd,firstTyped?Date.parse(String(firstTyped.value.occurredAt)):Infinity);
        const transitions=snapshot.sources.filter(s=>(s.kind==='membership'||s.kind==='permission')&&s.value.enrollmentId===v.enrollmentId&&Number(s.value.sequence)<=snapshot.sourceLedgerRevision&&Math.max(Date.parse(String(s.value.occurredAt)),Date.parse(String(s.value.recordedAt)))>=left&&Math.max(Date.parse(String(s.value.occurredAt)),Date.parse(String(s.value.recordedAt)))<=right);
        const candidateTimes=[left,right,...transitions.map(s=>Math.max(Date.parse(String(s.value.occurredAt)),Date.parse(String(s.value.recordedAt))))];
        const atTime=transitions.filter(s=>Math.max(Date.parse(String(s.value.occurredAt)),Date.parse(String(s.value.recordedAt)))===witnessAt).map(s=>Number(s.value.sequence));
        const candidateSequences=[snapshot.sourceLedgerRevision,...atTime,...(atTime.length?[Math.min(...atTime)-1]:[])];
        if(cohortKind!=='questionnaire'||v.legacyEvidenceGap!==true||first!==witness.firstValidSubmittedAt||left>right||!candidateTimes.includes(witnessAt)||!candidateSequences.includes(witness.witnessSequence)||!!firstTyped!==!!typed.length||firstTyped&&(firstTyped.kind!=='questionnaireEvidence'||firstTyped.ref!==typed[0].ref||firstTyped.value.enrollmentId!==v.enrollmentId||!firstTyped.value.revisionOf)||!qualified(String(v.enrollmentId),witness.witnessAt,witness.witnessSequence,'aggregate'))throw new Error('PSP aggregate legacy gap qualification missing');
       }
      }
     }
    }
   }
   evidencePairs.add(key);
  }
  if(!same(graph.closure(snapshot.evidence.flatMap(e=>[...e.sourceRefs,...e.cohortRefs,...e.cohortQualifications.flatMap(q=>q.basis==='historical_result'?[q.sourceRef]:q.basis==='legacy_gap'&&q.firstTypedSourceRef?[q.firstTypedSourceRef]:[])])),snapshot.sources.map(s=>s.ref).sort()))throw new Error('Unreferenced PSP snapshot source');
 }
}
