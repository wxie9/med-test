import type {PharmaActionReceipt} from './deliveryTypes';
import type {PspReportVersion,ReportWorkflowMetadata} from './reportTypes';
import type {ReportActionEvent,ReportSubmitEvent,ReportReviewEvent,ReportDeliverEvent,ReportClientEvent} from './reviewTypes';
export const initialReport=(report:PspReportVersion):PspReportVersion=>({...report,status:'draft',version:1});
/** Replay is authoritative; caller validates all bindings and receipts separately. */
export function projectReport(report:PspReportVersion,events:ReportActionEvent[]):{report:PspReportVersion;workflow:ReportWorkflowMetadata}{
 const projected=initialReport(report);let submission:ReportSubmitEvent|null=null,dataReview:ReportReviewEvent|null=null,medicalReview:ReportReviewEvent|null=null,returnReview:ReportReviewEvent|null=null,delivery:ReportDeliverEvent|null=null,clientFeedback:ReportClientEvent|null=null;
 let previousSequence=report.creationLedgerRevision,previousTime=Date.parse(report.createdAt);
 for(const event of events){
  if(event.sequence<=previousSequence||Date.parse(event.occurredAt)<previousTime||event.recordedAt!==event.occurredAt||event.previousVersion!==projected.version||event.newVersion!==projected.version+1)throw new Error('Invalid PSP report action order/version');
  if(event.action==='submit'){
   if(projected.status!=='draft'||submission||event.submissionId!==event.id||event.submittedVersion!==2)throw new Error('Invalid PSP report submission');
   submission=event;projected.status='in_review';
  }else{
   if(!submission||event.submissionId!==submission.id||event.submittedVersion!==submission.submittedVersion)throw new Error('Invalid PSP report review submission');
   if(event.action==='review'){
    if(projected.status!=='in_review')throw new Error('Invalid PSP report review state');
    if(event.decision==='return'){
     if(!event.reason||event.reason.trim()!==event.reason)throw new Error('Invalid PSP report return reason');
     returnReview=event;projected.status='changes_requested';
    }else{
     if(event.reason!==undefined||event.kind==='data'&&dataReview||event.kind==='medical'&&medicalReview)throw new Error('Invalid PSP report duplicate approval');
     if(event.kind==='data')dataReview=event;else medicalReview=event;
     if(dataReview&&medicalReview)projected.status='approved';
    }
   }else if(event.action==='deliver'){
    if(projected.status!=='approved'||!dataReview||!medicalReview||delivery)throw new Error('Invalid PSP delivery state');
    delivery=event;projected.status='delivered';
   }else{
    if(projected.status!=='delivered'||!delivery||event.deliveryId!==delivery.id||event.artifactDigest!==delivery.artifactDigest||event.comment.trim()!==event.comment)throw new Error('Invalid PSP client feedback');
    clientFeedback=event;projected.status=event.action==='accept'?'accepted':'client_changes_requested';
   }
  }
  projected.version=event.newVersion;previousSequence=event.sequence;previousTime=Date.parse(event.recordedAt);
 }
 const labels={draft:'模板草稿，待人工审核',in_review:'审核中',approved:'双签审核通过（尚未交付）',changes_requested:'已退回，待修订',delivered:'已交付，待客户验收',accepted:'客户已验收',client_changes_requested:'客户请求修改，待新版本重审'};
 const missingReviews:('data'|'medical')[]=[];if(!dataReview)missingReviews.push('data');if(!medicalReview)missingReviews.push('medical');
 return {report:projected,workflow:{status:projected.status,label:labels[projected.status],submission,dataReview,medicalReview,returnReview,missingReviews,history:events,delivery,acceptance:clientFeedback?.action==='accept'?clientFeedback:null,clientFeedback}};
}
export const reportActionBody=(event:ReportActionEvent)=>event.action==='submit'?{action:'submit' as const}:event.action==='review'?{action:'review' as const,kind:event.kind,decision:event.decision,...(event.reason===undefined?{}:{reason:event.reason})}:event.action==='deliver'?{action:'deliver' as const}:{action:event.action,comment:event.comment};
export const reportActionScope=(event:ReportActionEvent)=>JSON.stringify([event.seedVersion,event.projectId,'report_action',event.reportVersionId,event.actorId,event.clientRequestId]);

export function publicActionReceipt(report:PspReportVersion,event:Extract<ReportActionEvent,{action:'accept'|'request_changes'}>):PharmaActionReceipt{return {id:report.id,projectId:report.projectId,version:event.newVersion,status:event.action==='accept'?'accepted':'client_changes_requested',event:{id:event.id,action:event.action,occurredAt:event.occurredAt}};}
