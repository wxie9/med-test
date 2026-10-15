import type {PspAssignment,PspServiceEvent,PspState} from './types';
import {selectVerifiedContactCorrectionsAsOf} from './corrections';
import {selectSelfReportSourcesAsOf} from './evidenceWindow';
import {permissionAt} from './permissions';
import {createMetricWindow} from './metricWindow';
import {PSP_METRIC_ALGORITHM_VERSION,type Metric,type MetricOptions} from './metricTypes';

type RefFact={refs:string[]};
type Contact=PspServiceEvent&{refs:string[]};
type Alert={id:string;enrollmentId:string;triggeredAt:string;level:'high'|'medium';sequence:number;refs:string[]};
const epoch=(at:string)=>Date.parse(at);
const unique=(refs:string[])=>[...new Set(refs)].sort();
const refs=(facts:RefFact[])=>unique(facts.flatMap(f=>f.refs));
const nearestRank=(values:number[],percentile:number):number|null=>values.length?values.slice().sort((a,b)=>a-b)[Math.ceil(percentile*values.length)-1]:null;
const firstByTime=<T extends {occurredAt:string;sequence:number}>(values:T[]):T|undefined=>values.slice().sort((a,b)=>epoch(a.occurredAt)-epoch(b.occurredAt)||a.sequence-b.sequence)[0];

/** Compute only from the supplied, immutable PSP ledger view. */
export function computePspMetrics(state:PspState,rawOptions:MetricOptions):Metric[] {
 const w=createMetricWindow(state,rawOptions),options=w.options;
 const baseRefs=(id:string)=>w.scopeSourceRefs(id);
 const assignments=state.assignments.filter(a=>a.projectId===options.projectId&&w.assignmentKnown(a));
 const unavailablePlans=state.assignments.filter(a=>a.projectId===options.projectId&&epoch(a.assignedAt)<=epoch(options.cutoffAt)&&!w.assignmentKnown(a)&&a.assignedSequence===undefined&&a.assignedRecordedAt===undefined&&epoch(a.assignedAt)!==epoch(state.project.startsAt)&&![...(state.alertActions??[]),...(state.educationEvents??[])].some(e=>e.followupAssignmentId===a.id)&&(options.scope==='internal'||(epoch(a.dueAt)<=epoch(options.cutoffAt)&&permissionAt(state,a.enrollmentId,'aggregate',a.dueAt,options.ledgerRevision)))).length;
 const note=`本期到期/本期触发的责任观察截至 cutoff；关联结果可跨月，事件次数仍按发生月。旧问卷证据缺失及动态计划创建证据不足不推断。未可用计划 ${unavailablePlans} 项；日期精度日志仅在完整自然日资格成立时纳入。`;
 const metric=(key:string,label:string,unit:Metric['unit'],sampleUnit:Metric['sampleUnit'],sampleN:number,value:number|null,sourceRefs:string[],extra:Partial<Pick<Metric,'numerator'|'denominator'|'complementCells'|'applicability'>>={}):Metric=>({
  key,label,unit,sampleUnit,sampleN,value,status:value===null?'no_applicable':'available',sourceRefs:unique(sourceRefs),window:{...options},applicability:extra.applicability??note,algorithmVersion:PSP_METRIC_ALGORITHM_VERSION,...extra,
 });
 const ratio=(key:string,label:string,unit:Metric['unit'],sampleUnit:Metric['sampleUnit'],numerator:number,denominator:number,sourceRefs:string[],applicability?:string)=>metric(key,label,unit,sampleUnit,denominator,denominator?numerator/denominator:null,sourceRefs,{numerator,denominator,complementCells:[numerator,denominator-numerator],...(applicability?{applicability}:{})});
 const count=(key:string,label:string,unit:Metric['unit'],sampleUnit:Metric['sampleUnit'],value:number,sampleN:number,sourceRefs:string[])=>metric(key,label,unit,sampleUnit,sampleN,value,sourceRefs);
 const duration=(key:string,label:string,values:number[],percentile:number,sourceRefs:string[])=>metric(key,label,'hours','alerts',values.length,nearestRank(values,percentile),sourceRefs);
 const results:Metric[]=[];

 const members=state.enrollments.filter(e=>e.projectId===options.projectId&&w.periodMember(e.id));
 const active=state.enrollments.filter(e=>e.projectId===options.projectId&&w.qualifiedAt(e.id,options.cutoffAt));
 results.push(count('period_members','期内服务成员','people','people',members.length,members.length,members.flatMap(e=>baseRefs(e.id))));
 results.push(count('active_members','截至日活跃服务成员','people','people',active.length,active.length,active.flatMap(e=>baseRefs(e.id))));

 const evidence=(state.questionnaireEvidence??[]).filter(e=>{
  const assignment=state.assignments.find(a=>a.id===e.assignmentId);
  return e.projectId===options.projectId&&w.known(e.recordedAt,e.sequence)&&!!assignment&&w.assignmentKnown(assignment)&&epoch(e.occurredAt)>=epoch(assignment.assignedAt)&&w.qualifiedAt(e.enrollmentId,e.occurredAt,e.sequence);
 });
 const evidenceByPlan=new Map<string,typeof evidence>();
 for(const e of evidence){const list=evidenceByPlan.get(e.assignmentId)??[];list.push(e);evidenceByPlan.set(e.assignmentId,list);}
 for(const list of evidenceByPlan.values())list.sort((a,b)=>a.sequence-b.sequence);
 const firstTypedByPlan=new Map<string,NonNullable<PspState['questionnaireEvidence']>[number]>();
 for(const e of state.questionnaireEvidence??[]){const first=firstTypedByPlan.get(e.assignmentId);if(!first||e.sequence<first.sequence)firstTypedByPlan.set(e.assignmentId,e);}
 // A revision with an absent typed parent leaves an opaque prefix: the root
 // timestamp says nothing about possible intermediate submissions.
 const proProof=(a:PspAssignment)=>{
  const typed=evidenceByPlan.get(a.id)??[],firstTyped=firstTypedByPlan.get(a.id);
  const missingPrefix=!!a.firstValidSubmittedAt&&!!a.latestValidResponseId&&(!firstTyped||!!firstTyped.revisionOf);
  const gapPossible=(from:string,to:string)=>{
   if(!missingPrefix||!a.firstValidSubmittedAt)return false;
   const left=Math.max(epoch(a.firstValidSubmittedAt),epoch(a.assignedAt),epoch(state.project.startsAt),epoch(from));
   const right=Math.min(firstTyped?epoch(firstTyped.occurredAt):Infinity,epoch(state.project.endsAt),epoch(options.cutoffAt),epoch(to));
   if(left>right)return false;
   const transitions=[...state.membershipEvents,...state.permissionEvents].filter(e=>e.enrollmentId===a.enrollmentId&&e.sequence<=options.ledgerRevision&&Math.max(epoch(e.occurredAt),epoch(e.recordedAt))>=left&&Math.max(epoch(e.occurredAt),epoch(e.recordedAt))<=right);
   const times=unique([new Date(left).toISOString(),new Date(right).toISOString(),...transitions.map(e=>new Date(Math.max(epoch(e.occurredAt),epoch(e.recordedAt))).toISOString())]);
   return times.some(at=>{
    const same=transitions.filter(e=>Math.max(epoch(e.occurredAt),epoch(e.recordedAt))===epoch(at)).map(e=>e.sequence);
    const revisions=[options.ledgerRevision,...same,...(same.length?[Math.min(...same)-1]:[])];
    return revisions.some(revision=>revision>=0&&w.qualifiedAt(a.enrollmentId,at,revision));
   });
  };
  const first=typed[0]&&(!missingPrefix||!gapPossible(a.firstValidSubmittedAt!,typed[0].occurredAt))?typed[0]:undefined;
  return {typed,first,latest:typed.at(-1),missingPrefix,gapPossible};
 };
 const proProofs=new Map(assignments.filter(a=>a.kind==='questionnaire').map(a=>[a.id,proProof(a)]));
 const proof=(a:PspAssignment)=>proProofs.get(a.id)!;
 const firstPro=(a:PspAssignment)=>proof(a).first;
 const latestPro=(a:PspAssignment)=>proof(a).latest;
 const unknown=(output:Metric,plans:PspAssignment[],cohort=false,detail='旧问卷修订前缀缺失，无法证明当前范围的首次提交或归期。')=>{
  output.value=null;output.status='unknown';if(cohort)output.sampleN=null;
  delete output.numerator;if(cohort)delete output.denominator;delete output.complementCells;
  output.applicability=`${note} ${detail}`;
  output.sourceRefs=unique([...output.sourceRefs,...plans.flatMap(a=>[a.id,...baseRefs(a.enrollmentId),...proof(a).typed.map(e=>e.id)])]);
  return output;
 };
 const corrections=new Map(selectVerifiedContactCorrectionsAsOf(state,options).map(c=>[c.sourceRef.id,c]));
 const allContacts:Contact[]=state.serviceEvents.flatMap(original=>{
  if(original.projectId!==options.projectId||!w.known(original.recordedAt,original.sequence))return [];
  const correction=corrections.get(original.id);
  const effective:Contact={...original,occurredAt:correction?.occurredAt??original.occurredAt,outcome:correction?.correctedValue.outcome??original.outcome,sequence:correction?.sequence??original.sequence,...(correction?{channel:correction.correctedValue.channel}:{}),refs:correction?[original.id,correction.id]:[original.id]};
  return w.qualifiedAt(effective.enrollmentId,effective.occurredAt,effective.sequence)?[effective]:[];
 });
 const contacts=allContacts.filter(c=>w.inWindow(c.occurredAt));
 const interactionMap=new Map<string,Contact>();
 for(const c of contacts)if(!interactionMap.has(c.interactionId)||c.sequence<interactionMap.get(c.interactionId)!.sequence)interactionMap.set(c.interactionId,c);
 const interactions=[...interactionMap.values()];
 const contactFor=(a:PspAssignment)=>allContacts.filter(c=>c.assignmentId===a.id&&c.enrollmentId===a.enrollmentId&&epoch(c.occurredAt)>=epoch(a.assignedAt));
 const reachedFor=(a:PspAssignment)=>firstByTime(contactFor(a).filter(c=>c.outcome==='reached'));

 const educationFor=(a:PspAssignment):{occurredAt:string;sequence:number;refs:string[]}|undefined=>{
  const events=(state.educationEvents??[]).filter(e=>e.projectId===options.projectId&&e.assignmentId===a.id&&e.enrollmentId===a.enrollmentId&&e.action==='feedback'&&typeof e.understood==='boolean'&&typeof e.needsHelp==='boolean'&&w.known(e.recordedAt,e.sequence)&&epoch(e.occurredAt)>=epoch(a.assignedAt)&&w.qualifiedAt(e.enrollmentId,e.occurredAt,e.sequence)&&state.educationContents.some(c=>c.id===e.contentVersionId&&c.status==='approved'&&epoch(c.approvedAt)<=epoch(e.occurredAt))).map(e=>({...e,refs:[e.id]}));
  const live=firstByTime(events);if(live)return live;
  // Older seed results carry an immutable feedback time and ledger sequence.
  if(state.educationEvents?.some(e=>e.assignmentId===a.id))return undefined;
  const r=state.educationResults.find(r=>r.assignmentId===a.id);
  if(!r||r.feedbackAt===null||r.understood===null||r.needsHelp===null||!w.known(r.feedbackAt,r.sequence)||epoch(r.feedbackAt)<epoch(a.assignedAt)||!w.qualifiedAt(a.enrollmentId,r.feedbackAt,r.sequence)||!state.educationContents.some(c=>c.id===r.contentVersionId&&c.status==='approved'&&epoch(c.approvedAt)<=epoch(r.sentAt)))return undefined;
  return {occurredAt:r.feedbackAt,sequence:r.sequence,refs:[`education-result:${r.assignmentId}:${r.sequence}`]};
 };
 const assignmentResult=(a:PspAssignment)=>a.kind==='questionnaire'?firstPro(a):a.kind==='contact'?reachedFor(a):educationFor(a);
 const due=(kind:PspAssignment['kind'])=>assignments.filter(a=>a.kind===kind&&w.dueApplicable(a));
 const proDue=due('questionnaire'),contactDue=due('contact'),educationDue=due('education');
 const completed=(plans:PspAssignment[])=>plans.filter(a=>!!assignmentResult(a));
 const planRefs=(plans:PspAssignment[])=>plans.flatMap(a=>{const fact=assignmentResult(a);return [a.id,...baseRefs(a.enrollmentId),...(a.kind==='questionnaire'?proof(a).typed.map(e=>e.id):fact?('refs' in fact?fact.refs:[fact.id]):[])];});
 const cancellationRefs=(kinds:PspAssignment['kind'][])=>state.assignmentCancellations?.flatMap(e=>{
  const a=assignments.find(a=>a.id===e.assignmentId&&a.enrollmentId===e.enrollmentId&&kinds.includes(a.kind));
  if(!a||!w.inWindow(a.dueAt)||!w.known(e.recordedAt,e.sequence)||(options.scope==='aggregate'&&!permissionAt(state,a.enrollmentId,'aggregate',a.dueAt,options.ledgerRevision)))return [];
  return [a.id,e.id,...baseRefs(a.enrollmentId)];
 })??[];
 const dueRefs=(plans:PspAssignment[],kinds:PspAssignment['kind'][])=>[...planRefs(plans),...cancellationRefs(kinds)];
 const completionUnknown=proDue.filter(a=>!proof(a).typed.length&&proof(a).gapPossible(a.firstValidSubmittedAt??a.assignedAt,options.cutoffAt));
 const onTimeUnknown=proDue.filter(a=>!proof(a).typed.some(e=>epoch(e.occurredAt)<=epoch(a.dueAt))&&proof(a).gapPossible(a.firstValidSubmittedAt??a.assignedAt,a.dueAt));
 const proRatio=(key:string,label:string,numerator:number,uncertain:PspAssignment[])=>{
  const output=ratio(key,label,'forms','forms',numerator,proDue.length,dueRefs(proDue,['questionnaire']));
  return uncertain.length?unknown(output,uncertain):output;
 };
 results.push(proRatio('questionnaire_completion','到期问卷完成率',proDue.filter(a=>proof(a).typed.length>0).length,completionUnknown));
 results.push(proRatio('questionnaire_on_time','按时问卷完成率',proDue.filter(a=>proof(a).typed.some(e=>epoch(e.occurredAt)<=epoch(a.dueAt))).length,onTimeUnknown));
 results.push(ratio('contact_completion','到期计划联系成功率','assignments','assignments',completed(contactDue).length,contactDue.length,dueRefs(contactDue,['contact'])));
 results.push(ratio('education_completion','到期教育反馈完成率','assignments','assignments',completed(educationDue).length,educationDue.length,dueRefs(educationDue,['education'])));
 const serviceDue=[...contactDue,...educationDue];
 results.push(ratio('service_completion','到期服务任务完成率（联系+教育）','assignments','assignments',completed(serviceDue).length,serviceDue.length,dueRefs(serviceDue,['contact','education'])));
 const firstCohortUnknown=(a:PspAssignment)=>!proof(a).first&&(proof(a).gapPossible(options.periodStart,options.periodEnd)||(!!proof(a).typed[0]&&w.inWindow(proof(a).typed[0].occurredAt)&&proof(a).gapPossible(a.firstValidSubmittedAt??a.assignedAt,proof(a).typed[0].occurredAt)));
 for(const [kind,key,label] of [['questionnaire','questionnaire_early_completed','未到期问卷提前完成'],['contact','contact_early_completed','未到期联系提前完成'],['education','education_early_completed','未到期教育提前完成']] as const){
  const future=assignments.filter(a=>a.kind===kind&&epoch(a.dueAt)>epoch(options.cutoffAt)&&w.qualifiedAt(a.enrollmentId,a.assignedAt,a.assignedSequence??options.ledgerRevision,'internal')&&(options.scope==='internal'||w.qualifiedAt(a.enrollmentId,options.cutoffAt,options.ledgerRevision,'aggregate')||!!assignmentResult(a)||(a.kind==='questionnaire'&&proof(a).gapPossible(a.firstValidSubmittedAt??a.assignedAt,options.cutoffAt))));
  const firstCompletedInPeriod=future.filter(a=>{const fact=assignmentResult(a);return fact&&w.inWindow(fact.occurredAt);});
  const unit=kind==='questionnaire'?'forms':'assignments';
  const early=count(key,label,unit,unit,firstCompletedInPeriod.length,future.length,planRefs(firstCompletedInPeriod));
  const uncertain=kind==='questionnaire'?future.filter(firstCohortUnknown):[];
  results.push(uncertain.length?unknown(early,uncertain,true):early);
 }

 const births:Alert[]=[];
 for(const e of state.questionnaireEvidence??[]){
  const assignment=state.assignments.find(a=>a.id===e.assignmentId);
  if(e.projectId!==options.projectId||!w.known(e.recordedAt,e.sequence)||!assignment||!w.assignmentKnown(assignment))continue;
  for(const alert of e.alerts){if(epoch(alert.triggeredAt)>epoch(options.cutoffAt)||!w.qualifiedAt(e.enrollmentId,alert.triggeredAt,e.sequence))continue;births.push({id:alert.id,enrollmentId:e.enrollmentId,triggeredAt:alert.triggeredAt,level:alert.level,sequence:e.sequence,refs:[e.id,alert.id]});}
 }
 const relevantBirths=births.filter(a=>w.inWindow(a.triggeredAt));
 const alertContact=(a:Alert)=>firstByTime(allContacts.filter(c=>c.enrollmentId===a.enrollmentId&&c.alertIds.includes(a.id)&&c.sequence>=a.sequence&&c.outcome==='reached'&&epoch(c.occurredAt)>=epoch(a.triggeredAt)));
 const action=(a:Alert,kind:'accept'|'close')=>firstByTime((state.alertActions??[]).filter(x=>x.projectId===options.projectId&&x.enrollmentId===a.enrollmentId&&x.alertId===a.id&&x.action===kind&&x.sequence>=a.sequence&&w.known(x.recordedAt,x.sequence)&&w.qualifiedAt(x.enrollmentId,x.occurredAt,x.sequence)&&epoch(x.occurredAt)>=epoch(a.triggeredAt)));
 const carryBirths=births.filter(a=>epoch(a.triggeredAt)<epoch(options.periodStart)&&!((state.alertActions??[]).some(x=>x.projectId===options.projectId&&x.enrollmentId===a.enrollmentId&&x.alertId===a.id&&x.action==='close'&&x.sequence>=a.sequence&&w.known(x.recordedAt,x.sequence)&&epoch(x.occurredAt)<epoch(options.periodStart)&&w.qualifiedAt(x.enrollmentId,x.occurredAt,x.sequence))));
 const alertContactInPeriod=(a:Alert)=>firstByTime(allContacts.filter(c=>w.inWindow(c.occurredAt)&&c.enrollmentId===a.enrollmentId&&c.alertIds.includes(a.id)&&c.sequence>=a.sequence&&c.outcome==='reached'&&epoch(c.occurredAt)>=epoch(a.triggeredAt)));
 const closeInPeriod=(a:Alert)=>{const x=action(a,'close');return x&&w.inWindow(x.occurredAt)?x:undefined;};
 const deadline=(a:Alert)=>epoch(a.triggeredAt)+state.project.contactTargets[a.level]*3_600_000;
 const mature=relevantBirths.filter(a=>deadline(a)<=epoch(options.cutoffAt)),pending=relevantBirths.filter(a=>deadline(a)>epoch(options.cutoffAt));
 const alertRefs=(alerts:Alert[])=>alerts.flatMap(a=>[...a.refs,...baseRefs(a.enrollmentId),...(alertContact(a)?.refs??[]),...(action(a,'accept')?[action(a,'accept')!.id]:[]),...(action(a,'close')?[action(a,'close')!.id]:[])]);
 results.push(ratio('alert_contact_coverage','本期预警成功联系覆盖率','alerts','alerts',relevantBirths.filter(a=>alertContact(a)).length,relevantBirths.length,alertRefs(relevantBirths)));
 results.push(ratio('alert_contact_on_time','到期预警按时成功联系率','alerts','alerts',mature.filter(a=>{const c=alertContact(a);return c&&epoch(c.occurredAt)<=deadline(a);}).length,mature.length,alertRefs(mature)));
 results.push(count('alert_pending','尚未成熟联系期限预警','alerts','alerts',pending.length,relevantBirths.length,alertRefs(pending)));
 const dueUncontacted=mature.filter(a=>!alertContact(a));
 results.push(count('alert_due_uncontacted','到期未成功联系预警','alerts','alerts',dueUncontacted.length,relevantBirths.length,alertRefs(dueUncontacted)));
 const accepted=relevantBirths.flatMap(a=>{const x=action(a,'accept');return x?[{a,x,hours:(epoch(x.occurredAt)-epoch(a.triggeredAt))/3_600_000}]:[];});
 const contacted=relevantBirths.flatMap(a=>{const x=alertContact(a);return x?[{a,x,hours:(epoch(x.occurredAt)-epoch(a.triggeredAt))/3_600_000}]:[];});
 for(const [key,label,values,reference] of [['alert_accept_p50','接单耗时P50',accepted,accepted.flatMap(v=>[...v.a.refs,v.x.id])],['alert_accept_p90','接单耗时P90',accepted,accepted.flatMap(v=>[...v.a.refs,v.x.id])],['alert_contact_p50','首次成功联系耗时P50',contacted,contacted.flatMap(v=>[...v.a.refs,...v.x.refs])],['alert_contact_p90','首次成功联系耗时P90',contacted,contacted.flatMap(v=>[...v.a.refs,...v.x.refs])]] as const)results.push(duration(key,label,values.map(v=>v.hours),key.endsWith('p50')?.5:.9,reference));
 const reviewed=relevantBirths.filter(a=>action(a,'close'));
 results.push(ratio('alert_review_completion','本期预警医生复核完成率','alerts','alerts',reviewed.length,relevantBirths.length,alertRefs(relevantBirths)));
 results.push(count('alert_review_pending','本期预警待复核','alerts','alerts',relevantBirths.length-reviewed.length,relevantBirths.length,alertRefs(relevantBirths)));
 const carryRefs=(include:'birth'|'contact'|'close')=>carryBirths.flatMap(a=>[...a.refs,...baseRefs(a.enrollmentId),...(include==='contact'?(alertContactInPeriod(a)?.refs??[]):[]),...(include==='close'&&closeInPeriod(a)?[closeInPeriod(a)!.id]:[])]);
 results.push(count('alert_carry_over','上期项目预警积压','alerts','alerts',carryBirths.length,carryBirths.length,carryRefs('birth')));
 results.push(count('alert_carry_over_contacted','上期预警本期成功联系','alerts','alerts',carryBirths.filter(a=>alertContactInPeriod(a)).length,carryBirths.length,carryRefs('contact')));
 results.push(count('alert_carry_over_reviewed','上期预警本期医生复核','alerts','alerts',carryBirths.filter(a=>closeInPeriod(a)).length,carryBirths.length,carryRefs('close')));

 const interactionRefs=refs(interactions);
 results.push(count('interaction_attempts','联系尝试次数','interactions','interactions',interactions.length,interactions.length,interactionRefs));
 for(const [outcome,key,label] of [['reached','interaction_successes','成功联系次数'],['no_answer','interaction_no_answer','未接通次数'],['refused','interaction_refused','拒绝联系次数'],['channel_unavailable','interaction_channel_unavailable','渠道不可用次数']] as const)results.push(count(key,label,'interactions','interactions',interactions.filter(c=>c.outcome===outcome).length,interactions.length,interactionRefs));

 const reports=state.enrollments.filter(e=>e.projectId===options.projectId).flatMap(e=>selectSelfReportSourcesAsOf(state,e.id,options));
 const dosePeople=new Set(reports.map(r=>r.enrollmentId)),days=new Set(reports.map(r=>r.logDate));
 const dueDoses=reports.reduce((n,r)=>n+r.due,0),taken=reports.reduce((n,r)=>n+r.taken,0),reportRefs=reports.flatMap(r=>[r.sourceId,...baseRefs(r.enrollmentId)]);
 const selfReport=ratio('self_report_ratio','自报服药记录剂次比例','doses','people',taken,dueDoses,reportRefs);
 selfReport.sampleN=dosePeople.size;
 selfReport.applicability=`${note} 有效成员-日 ${reports.length} 条；剂次比例不是客观服药率。`;
 results.push(selfReport,count('self_report_people','自报日志覆盖成员','people','people',dosePeople.size,dosePeople.size,reportRefs),count('self_report_days','自报日志覆盖自然日','days','people',days.size,dosePeople.size,reportRefs));

 const stopPlans=assignments.filter(a=>a.kind==='questionnaire'&&(proDue.includes(a)||(!!firstPro(a)&&w.inWindow(firstPro(a)!.occurredAt))));
 const latestAnswers=stopPlans.flatMap(a=>{const e=latestPro(a);return e?[e]:[]});
 const knownFlags=latestAnswers.filter(e=>typeof e.stopIntent==='boolean');
 const firstCohortUnknownPlans=assignments.filter(a=>a.kind==='questionnaire'&&!proDue.includes(a)&&firstCohortUnknown(a));
 const stopFieldUnknown=unique([...firstCohortUnknownPlans.map(a=>a.id),...stopPlans.filter(a=>!proof(a).latest&&proof(a).gapPossible(a.firstValidSubmittedAt??a.assignedAt,options.cutoffAt)).map(a=>a.id)]).map(id=>assignments.find(a=>a.id===id)!);
 const stopUnknown=unique([...stopFieldUnknown.map(a=>a.id),...stopPlans.filter(a=>proof(a).latest?.stopIntent===null).map(a=>a.id)]).map(id=>assignments.find(a=>a.id===id)!);
 const stopRatio=ratio('stop_intent_ratio','问卷停药念头比例','forms','forms',knownFlags.filter(e=>e.stopIntent===true).length,knownFlags.length,knownFlags.map(e=>e.id));
 results.push(stopUnknown.length?unknown(stopRatio,stopUnknown,true):stopRatio);
 for(const [field,key,label,missing] of [
  ['channel','quality_contact_channel','联系渠道缺失率',(c:Contact)=>!c.channel],
  ['outcome','quality_contact_outcome','联系结果缺失率',(c:Contact)=>!c.outcome],
  ['occurredAt','quality_contact_occurred_at','联系发生时间缺失率',(c:Contact)=>!c.occurredAt],
  ['recordedAt','quality_contact_recorded_at','联系入账时间缺失率',(c:Contact)=>!c.recordedAt],
  ['actorId','quality_contact_actor','联系记录人缺失率',(c:Contact)=>!c.actorId],
  ['sourceLink','quality_contact_source_link','联系来源关联缺失率',(c:Contact)=>!c.assignmentId&&!c.alertIds.length],
 ] as const)results.push(ratio(key,label,'records','records',interactions.filter(missing).length,interactions.length,interactionRefs,`${note} 字段：${field}。`));
 const stopQuality=ratio('quality_questionnaire_stop_intent','问卷停药念头字段缺失率','records','records',latestAnswers.filter(e=>e.stopIntent===null).length,latestAnswers.length,latestAnswers.map(e=>e.id));
 results.push(stopFieldUnknown.length?unknown(stopQuality,stopFieldUnknown,true):stopQuality);
 const questionnairePlans=assignments.filter(a=>a.kind==='questionnaire'&&w.dueApplicable(a));
 const knownEvidencePlans=questionnairePlans.filter(a=>evidenceByPlan.has(a.id));
 const missingEvidencePlans=assignments.filter(a=>a.kind==='questionnaire'&&proof(a).missingPrefix&&((questionnairePlans.includes(a)&&proof(a).gapPossible(a.firstValidSubmittedAt??a.assignedAt,options.cutoffAt))||(epoch(a.dueAt)>epoch(options.cutoffAt)&&proof(a).gapPossible(options.periodStart,options.periodEnd))));
 const evidenceExpected=unique([...knownEvidencePlans.map(a=>a.id),...missingEvidencePlans.map(a=>a.id)]);
 results.push(ratio('quality_questionnaire_evidence','旧问卷结构化证据缺失率','records','records',missingEvidencePlans.length,evidenceExpected.length,evidenceExpected.flatMap(id=>[id,...baseRefs(state.assignments.find(a=>a.id===id)!.enrollmentId)]),`${note} 分母为已知或可能适用且应有结构化副本的计划，不推定未知旧答卷实际条数。`));
 const alertGapEnd=new Date(Math.min(epoch(options.periodEnd)-1,epoch(options.cutoffAt))).toISOString();
 const alertUnknown=assignments.filter(a=>a.kind==='questionnaire'&&proof(a).gapPossible(state.project.startsAt,alertGapEnd));
 if(alertUnknown.length)for(const output of results)if(output.key.startsWith('alert_'))unknown(output,alertUnknown,true,'旧问卷修订前缀可能包含本期或期初存续预警，预警来源总数不可证。');
 return results.map(r=>({...r,sourceRefs:[...r.sourceRefs],window:{...r.window},...(r.complementCells?{complementCells:[...r.complementCells]}:{})}));
}
