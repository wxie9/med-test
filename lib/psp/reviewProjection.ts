import type {PspReportVersion,ReportWorkflowMetadata} from './reportTypes';
import type {ReportActionEvent,ReportSubmitEvent,ReportReviewEvent} from './reviewTypes';
export const initialReport=(report:PspReportVersion):PspReportVersion=>({...report,status:'draft',version:1});
/** Replay is authoritative; caller validates all bindings and receipts separately. */
export function projectReport(report:PspReportVersion,events:ReportActionEvent[]):{report:PspReportVersion;workflow:ReportWorkflowMetadata}{
 const projected=initialReport(report);let submission:ReportSubmitEvent|null=null,dataReview:ReportReviewEvent|null=null,medicalReview:ReportReviewEvent|null=null,returnReview:ReportReviewEvent|null=null;
 let previousSequence=report.creationLedgerRevision,previousTime=Date.parse(report.createdAt);
 for(const event of events){
  if(event.sequence<=previousSequence||Date.parse(event.occurredAt)<previousTime||event.recordedAt!==event.occurredAt||event.previousVersion!==projected.version||event.newVersion!==projected.version+1)throw new Error('Invalid PSP report action order/version');
  if(event.action==='submit'){
   if(projected.status!=='draft'||submission||event.submissionId!==event.id||event.submittedVersion!==2)throw new Error('Invalid PSP report submission');
   submission=event;projected.status='in_review';
  }else{
   if(projected.status!=='in_review'||!submission||event.submissionId!==submission.id||event.submittedVersion!==submission.submittedVersion)throw new Error('Invalid PSP report review submission');
   if(event.decision==='return'){
    if(!event.reason||event.reason.trim()!==event.reason)throw new Error('Invalid PSP report return reason');
    returnReview=event;projected.status='changes_requested';
   }else{
    if(event.reason!==undefined||event.kind==='data'&&dataReview||event.kind==='medical'&&medicalReview)throw new Error('Invalid PSP report duplicate approval');
    if(event.kind==='data')dataReview=event;else medicalReview=event;
    if(dataReview&&medicalReview)projected.status='approved';
   }
  }
  projected.version=event.newVersion;previousSequence=event.sequence;previousTime=Date.parse(event.recordedAt);
 }
 const labels={draft:'模板草稿，待人工审核',in_review:'审核中',approved:'双签审核通过（尚未交付）',changes_requested:'已退回，待修订'};
 const missingReviews:('data'|'medical')[]=[];if(!dataReview)missingReviews.push('data');if(!medicalReview)missingReviews.push('medical');
 return {report:projected,workflow:{status:projected.status,label:labels[projected.status],submission,dataReview,medicalReview,returnReview,missingReviews,history:events,delivery:null,acceptance:null}};
}
export const reportActionBody=(event:ReportActionEvent)=>event.action==='submit'?{action:'submit' as const}:{action:'review' as const,kind:event.kind,decision:event.decision,...(event.reason===undefined?{}:{reason:event.reason})};
export const reportActionScope=(event:ReportActionEvent)=>JSON.stringify([event.seedVersion,event.projectId,'report_action',event.reportVersionId,event.actorId,event.clientRequestId]);
