import type {PspAssignment,PspState,PspServiceEvent} from './types';
export type ContactSummary={id:string;interactionId:string;enrollmentId:string;assignmentId?:string;channel?:PspServiceEvent['channel'];outcome:PspServiceEvent['outcome'];alertIds:string[];occurredAt:string;recordedAt:string;actorId:string;background:boolean};
export type EducationSummary={assignmentId:string;version:number;title:string;dueAt:string;status:PspAssignment['status'];contentVersionId:string|null;sentAt:string|null;openedAt:string|null;feedbackAt:string|null;understood:boolean|null;needsHelp:boolean|null;background:boolean};
export function contactsFor(state:PspState,enrollmentId:string):ContactSummary[] {
 return state.serviceEvents.filter(e=>e.enrollmentId===enrollmentId).map(e=>({id:e.id,interactionId:e.interactionId,enrollmentId:e.enrollmentId,...(e.assignmentId?{assignmentId:e.assignmentId}:{}),...(e.channel?{channel:e.channel}:{}),outcome:e.outcome,alertIds:[...e.alertIds],occurredAt:e.occurredAt,recordedAt:e.recordedAt,actorId:e.actorId,background:e.channel===undefined}));
}
export function educationFor(state:PspState,enrollmentId:string):EducationSummary[] {
 return state.assignments.filter(a=>a.enrollmentId===enrollmentId&&a.kind==='education').map(a=>{
  const result=state.educationResults.find(r=>r.assignmentId===a.id);
  return {assignmentId:a.id,version:a.version,title:a.title,dueAt:a.dueAt,status:a.status,contentVersionId:result?.contentVersionId??null,sentAt:result?.sentAt??null,openedAt:result?.openedAt??null,feedbackAt:result?.feedbackAt??null,understood:result?.understood??null,needsHelp:result?.needsHelp??null,background:!!result&&!state.educationEvents?.some(e=>e.assignmentId===a.id)};
 });
}
export function assignmentCompletion(state:PspState,a:PspAssignment):{at:string;background:boolean}|undefined {
 if(a.status!=='completed')return;
 if(a.kind==='questionnaire'&&a.firstValidSubmittedAt)return {at:a.firstValidSubmittedAt,background:false};
 if(a.kind==='contact') {
  const event=state.serviceEvents.filter(e=>e.assignmentId===a.id&&e.outcome==='reached').sort((x,y)=>Date.parse(x.occurredAt)-Date.parse(y.occurredAt)||x.sequence-y.sequence)[0];
  if(event)return {at:event.occurredAt,background:event.channel===undefined};
 }
 if(a.kind==='education') {
  const result=state.educationResults.find(r=>r.assignmentId===a.id);
  if(result?.feedbackAt)return {at:result.feedbackAt,background:!state.educationEvents?.some(e=>e.assignmentId===a.id&&e.action==='feedback')};
 }
}
