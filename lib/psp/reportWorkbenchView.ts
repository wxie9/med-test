import type {PspReportVersion,ReportTimelineEntry} from './reportTypes';
import type {ReportActionEvent} from './reviewTypes';
/** A read projection only. Ledger sequence, rather than the fixed demo clock, orders events. */
export function reportBatchTimeline(selected:PspReportVersion,versions:PspReportVersion[],events:ReportActionEvent[]):ReportTimelineEntry[]{
 const batch=versions.filter(report=>report.projectId===selected.projectId&&report.seedVersion===selected.seedVersion&&report.batchId===selected.batchId);
 return batch.flatMap(report=>[
  {reportVersionId:report.id,revision:report.revision,action:'create' as const,role:'project_manager' as const,occurredAt:report.createdAt,sequence:report.creationLedgerRevision},
  ...events.filter(event=>event.reportVersionId===report.id&&event.projectId===report.projectId&&event.seedVersion===report.seedVersion&&event.revision===report.revision).map(event=>({reportVersionId:report.id,revision:report.revision,action:event.action==='review'?event.decision:event.action,role:event.role,occurredAt:event.occurredAt,sequence:event.sequence})),
 ]).sort((a,b)=>a.sequence-b.sequence);
}
