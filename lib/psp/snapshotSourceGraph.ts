import type {SnapshotSource,SnapshotSourceKind,SnapshotWindow} from './snapshotTypes';

type Context={projectId:string;projectStartsAt:string;projectEndsAt:string;window:SnapshotWindow;sourceLedgerRevision:number};
const at=(value:unknown)=>Date.parse(String(value));
const str=(value:unknown)=>String(value);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** A pure graph over frozen PSP source values. It never reads the mutable store. */
export function createSnapshotSourceGraph(sources:readonly SnapshotSource[],context:Context){
 const byRef=new Map<string,SnapshotSource>();
 for(const source of sources){if(byRef.has(source.ref))throw new Error('Duplicate PSP snapshot source');byRef.set(source.ref,source);}
 const cutoff=at(context.window.cutoffAt),revision=context.sourceLedgerRevision;
 const linked=(ref:unknown,kind:SnapshotSourceKind,owner?:unknown):SnapshotSource=>{
  const source=byRef.get(str(ref));
  if(!source||source.kind!==kind||(owner!==undefined&&source.value.enrollmentId!==owner))throw new Error(`Invalid PSP snapshot ${kind} link`);
  return source;
 };
 const enrollmentHistory=(id:string)=>sources.filter(source=>(source.kind==='membership'||source.kind==='permission')&&source.value.enrollmentId===id).map(source=>source.ref);
 const stage=(source:SnapshotSource,action:'send'|'open'):SnapshotSource=>{
  const v=source.value;
  const matches=sources.filter(other=>other.kind==='educationEvent'&&other.value.action===action&&other.value.assignmentId===v.assignmentId&&other.value.contentVersionId===v.contentVersionId&&other.value.enrollmentId===v.enrollmentId&&Number(other.value.sequence)<Number(v.sequence)&&at(other.value.occurredAt)<=at(v.occurredAt));
  if(matches.length!==1)throw new Error(`PSP typed education ${action} stage missing or ambiguous`);
  return matches[0];
 };
 const dependencies=(source:SnapshotSource):string[]=>{
  const v=source.value,refs=new Set<string>();
  const add=(ref:unknown,kind:SnapshotSourceKind,owner?:unknown)=>{const parent=linked(ref,kind,owner);refs.add(parent.ref);return parent;};
  if(v.projectId!==undefined&&v.projectId!==context.projectId)throw new Error('PSP snapshot source project mismatch');
  if(v.sequence!==undefined&&(!Number.isInteger(v.sequence)||Number(v.sequence)>revision))throw new Error('PSP snapshot source revision mismatch');
  if(v.recordedAt!==undefined&&(at(v.recordedAt)>cutoff||at(v.recordedAt)<at(v.occurredAt)))throw new Error('PSP snapshot source recorded time invalid');
  if(v.occurredAt!==undefined&&v.occurredAt!==null&&at(v.occurredAt)>cutoff)throw new Error('PSP snapshot source event after cutoff');
  if(v.enrollmentId!==undefined){add(v.enrollmentId,'enrollment');for(const ref of enrollmentHistory(str(v.enrollmentId)))if(ref!==source.ref)refs.add(ref);}
  const assignment=v.assignmentId!==undefined?add(v.assignmentId,'assignment',v.enrollmentId):undefined;
  if(assignment&&assignment.value.projectId!==context.projectId)throw new Error('PSP source assignment project mismatch');
  switch(source.kind){
   case 'enrollment':for(const ref of enrollmentHistory(source.ref))refs.add(ref);break;
   case 'assignment':{
    if(at(v.assignedAt)>cutoff||at(v.dueAt)<at(v.assignedAt))throw new Error('PSP assignment dates invalid');
    if((v.legacyEvidenceGap===true)!==(v.legacyFirstValidSubmittedAt!==undefined)||(v.legacyEvidenceGap===true&&(v.kind!=='questionnaire'||at(v.legacyFirstValidSubmittedAt)<at(v.assignedAt)||at(v.legacyFirstValidSubmittedAt)>cutoff)))throw new Error('PSP legacy gap assignment time invalid');
    if(v.assignedSequence!==undefined){
     if(at(v.assignedRecordedAt)>cutoff||at(v.assignedRecordedAt)<at(v.assignedAt)||Number(v.assignedSequence)>revision)throw new Error('PSP assignment birth after cutoff');
     const parents=sources.filter(other=>(other.kind==='alertAction'||other.kind==='educationEvent')&&other.value.followupAssignmentId===source.ref&&other.value.enrollmentId===v.enrollmentId&&at(other.value.occurredAt)===at(v.assignedAt)&&(
      other.kind==='alertAction'?other.value.action==='close'&&Number(other.value.sequence)<Number(v.assignedSequence):other.value.action==='feedback'&&Number(v.assignedSequence)<Number(other.value.sequence)
     ));
     const fixed=[['questionnaire','PRO',13,'patient'],['contact','CONTACT',8,'case_manager'],['education','EDUCATION',10,'case_manager']] as const;
     const template=fixed.find(([kind])=>kind===v.kind);
     const firstActive=sources.filter(other=>other.kind==='membership'&&other.value.enrollmentId===v.enrollmentId&&other.value.status==='active'&&at(other.value.occurredAt)===at(v.assignedAt)&&at(other.value.recordedAt)===at(v.assignedRecordedAt)&&Number(other.value.sequence)<Number(v.assignedSequence));
     const activation=firstActive.length===1?firstActive[0]:undefined;
     const chosen=template&&['10','11','12'].map(month=>({month,due:`2026-${month}-${String(template[2]).padStart(2,'0')}T01:00:00.000Z`})).find(item=>at(item.due)>=at(v.assignedAt)&&at(item.due)<=at(context.projectEndsAt));
     const fixedParent=activation&&template&&chosen&&v.id===`${context.projectId}:${v.enrollmentId}:${template[1]}:2026-${chosen.month}`&&at(v.dueAt)===at(chosen.due)&&v.ownerRole===template[3]&&v.source==='psp-v1'&&Number(v.assignedSequence)===Number(activation.value.sequence)+fixed.indexOf(template)+1&&!sources.some(other=>other.kind==='membership'&&other.value.enrollmentId===v.enrollmentId&&other.value.status==='active'&&Number(other.value.sequence)<Number(activation.value.sequence))?activation:undefined;
     if(parents.length+(fixedParent?1:0)!==1)throw new Error('PSP dynamic assignment birth source missing');refs.add((parents[0]??fixedParent)!.ref);
    }else if(v.birthEvidence==='seed_fixed'){
     if(at(v.assignedAt)!==at(context.projectStartsAt))throw new Error('Invalid seed assignment birth');
    }else if(v.birthEvidence!=='unproven_legacy')throw new Error('Unexplained PSP assignment birth');
    break;
   }
   case 'assignmentCancellation':if(!assignment||assignment.value.enrollmentId!==v.enrollmentId||at(v.occurredAt)<at(assignment.value.assignedAt))throw new Error('PSP cancellation assignment mismatch');break;
   case 'contact':{
    if(assignment&&(assignment.value.kind!=='contact'||at(v.occurredAt)<at(assignment.value.assignedAt)))throw new Error('PSP contact assignment mismatch');
    for(const alertId of v.alertIds as string[]){const birth=byRef.get(alertId);if(birth){if(birth.kind!=='alertBirth'||birth.value.enrollmentId!==v.enrollmentId||at(birth.value.triggeredAt)>at(v.occurredAt))throw new Error('PSP contact alert mismatch');refs.add(alertId);}}
    break;
   }
   case 'correction':{
    const original=add((v.sourceRef as {id:string}).id,'contact',v.enrollmentId),o=original.value;
    if(v.interactionId!==o.interactionId||v.assignmentId!==o.assignmentId||!same(v.alertIds,o.alertIds)||!same(v.sourceValue,{channel:o.channel??null,outcome:o.outcome,occurredAt:o.occurredAt})||Number(v.sequence)<=Number(o.sequence)||v.status!=='verified'||Number(v.verificationSequence)<=Number(v.sequence)||Number(v.verificationSequence)>revision||at(v.verifiedAt)>cutoff||at(v.verifiedAt)<at(v.recordedAt))throw new Error('PSP correction original or verification mismatch');
    break;
   }
   case 'questionnaireEvidence':{
    if(assignment?.value.kind!=='questionnaire'||at(v.occurredAt)<at(assignment.value.assignedAt))throw new Error('PSP questionnaire assignment mismatch');
    if(v.revisionOf){const parents=sources.filter(other=>other.kind==='questionnaireEvidence'&&other.value.responseId===v.revisionOf);if(parents.length){if(parents.length!==1||parents[0].value.assignmentId!==v.assignmentId||parents[0].value.enrollmentId!==v.enrollmentId||Number(parents[0].value.sequence)>=Number(v.sequence))throw new Error('PSP questionnaire revision mismatch');refs.add(parents[0].ref);}}
    break;
   }
   case 'alertBirth':{
    const evidence=add(v.questionnaireEvidenceId,'questionnaireEvidence',v.enrollmentId);
    if(evidence.value.projectId!==v.projectId||evidence.value.sequence!==v.sequence||at(v.triggeredAt)<at(evidence.value.occurredAt)||at(v.triggeredAt)>cutoff)throw new Error('PSP alert birth evidence mismatch');
    break;
   }
   case 'alertAction':{
    const birth=add(v.alertId,'alertBirth',v.enrollmentId);
    if(Number(v.sequence)<Number(birth.value.sequence)||at(v.occurredAt)<at(birth.value.triggeredAt))throw new Error('PSP alert action birth mismatch');
    if(v.action==='submit_review'){
     const disposition=v.disposition as {interactionIds:string[]}|undefined;
     if(!disposition?.interactionIds?.length)throw new Error('PSP alert review disposition missing');
     for(const id of disposition.interactionIds){
      const calls=sources.filter(other=>other.kind==='contact'&&other.value.interactionId===id&&other.value.enrollmentId===v.enrollmentId&&Array.isArray(other.value.alertIds)&&(other.value.alertIds as string[]).includes(str(v.alertId))&&Number(other.value.sequence)<Number(v.sequence)&&at(other.value.occurredAt)<=at(v.occurredAt));
      if(calls.length!==1)throw new Error('PSP alert review interaction missing or mismatched');refs.add(calls[0].ref);
     }
    }
    if(v.action==='close'){
     const reviews=sources.filter(other=>other.kind==='alertAction'&&other.value.action==='submit_review'&&other.value.alertId===v.alertId&&other.value.enrollmentId===v.enrollmentId&&Number(other.value.sequence)<Number(v.sequence)&&at(other.value.occurredAt)<=at(v.occurredAt));
     if(reviews.length!==1)throw new Error('PSP alert close review source missing');refs.add(reviews[0].ref);
    }
    if(v.followupAssignmentId){const followup=add(v.followupAssignmentId,'assignment',v.enrollmentId);if(Number(followup.value.assignedSequence)<=Number(v.sequence)||at(followup.value.assignedAt)!==at(v.occurredAt))throw new Error('PSP alert followup birth mismatch');}
    break;
   }
   case 'educationEvent':{
    if(assignment?.value.kind!=='education'||at(v.occurredAt)<at(assignment.value.assignedAt))throw new Error('PSP education assignment mismatch');
    const content=add(v.contentVersionId,'educationContent');if(at(content.value.approvedAt)>at(v.occurredAt))throw new Error('PSP education content not approved at event');
    if(v.action==='open'||v.action==='feedback')refs.add(stage(source,'send').ref);
    if(v.action==='feedback'){
     refs.add(stage(source,'open').ref);
     if(typeof v.understood!=='boolean'||typeof v.needsHelp!=='boolean')throw new Error('PSP feedback fields missing');
    }else if(v.understood!==undefined||v.needsHelp!==undefined)throw new Error('PSP education stage fields invalid');
    if(v.followupAssignmentId){const followup=add(v.followupAssignmentId,'assignment',v.enrollmentId);if(v.action!=='feedback'||Number(followup.value.assignedSequence)>=Number(v.sequence)||at(followup.value.assignedAt)!==at(v.occurredAt))throw new Error('PSP education followup birth mismatch');}
    break;
   }
   case 'educationResult':{
    if(assignment?.value.kind!=='education'||at(v.sentAt)<at(assignment.value.assignedAt))throw new Error('PSP education result assignment mismatch');
    const content=add(v.contentVersionId,'educationContent');if(at(content.value.approvedAt)>at(v.sentAt))throw new Error('PSP education result content mismatch');
    const sent=at(v.sentAt),opened=v.openedAt===null?null:at(v.openedAt),feedback=v.feedbackAt===null?null:at(v.feedbackAt);
    if(sent>cutoff||(opened!==null&&(opened<sent||opened>cutoff))||(feedback!==null&&(opened===null||feedback<opened||feedback>cutoff))||(feedback===null&&(v.understood!==null||v.needsHelp!==null))||(feedback!==null&&(typeof v.understood!=='boolean'||typeof v.needsHelp!=='boolean')))throw new Error('PSP legacy education stage time invalid');
    break;
   }
   case 'educationContent':if(at(v.approvedAt)>cutoff)throw new Error('PSP education content after cutoff');break;
   case 'selfReport':{
    if(v.revisionOf){const prior=add(v.revisionOf,'selfReport',v.enrollmentId);if(Number(prior.value.sequence)>=Number(v.sequence)||prior.value.logDate!==v.logDate)throw new Error('PSP self-report revision mismatch');}
    break;
   }
  }
  refs.delete(source.ref);return [...refs];
 };
 const closure=(roots:readonly string[]):string[]=>{
  const seen=new Set<string>(),visit=(ref:string)=>{if(seen.has(ref))return;const source=byRef.get(ref);if(!source)throw new Error(`Missing PSP snapshot source ${ref}`);seen.add(ref);for(const parent of dependencies(source))visit(parent);};
  for(const root of roots)visit(root);return [...seen].sort();
 };
 return {closure,validateAll:()=>closure([...byRef.keys()])};
}
