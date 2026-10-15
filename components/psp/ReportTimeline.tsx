import type {ReportTimelineEntry} from '@/lib/psp/reportTypes';
import type {PharmaReportView} from '@/lib/psp/pharmaView';
import {formatPspTime} from './Common';
const actions={create:'创建模板草稿',submit:'提交审核',approve:'签署通过',return:'审核退回',deliver:'交付报告',accept:'客户验收',request_changes:'客户请求修改'};
const roles={project_manager:'项目经理',data_reviewer:'数据审核者',medical_reviewer:'医学审核者',pharma_owner:'药企客户'};
export function ReportTimeline({entries,title='批次签署与版本时间线',notice='各修订独立签署；相同时刻按记录顺序展示。'}:{entries:ReportTimelineEntry[];title?:string;notice?:string}){
 return <section aria-label={title} className="min-w-0 space-y-3 border-t border-gray-200 pt-4"><h2 className="font-semibold">{title}</h2><p className="text-sm text-gray-700">{notice}</p>{!entries.length?<p className="text-sm text-gray-700">尚无签署或交付记录。</p>:<ol className="space-y-2 text-sm">{entries.map((entry,index)=><li key={`${entry.reportVersionId}:${entry.sequence}:${index}`} className="border-l-2 border-gray-200 pl-3">修订 {entry.revision} · {actions[entry.action]} · {roles[entry.role]}<span className="block text-gray-600">{formatPspTime(entry.occurredAt)}</span></li>)}</ol>}</section>;
}
/** Only the gated public DTO is accepted; no internal history can enter this projection. */
export function PublicReportTimeline({report}:{report:PharmaReportView}){
 if(report.gate.status!=='available'||!('signatures' in report))return null;
 const entries:ReportTimelineEntry[]=report.signatures.map((signature,index)=>({reportVersionId:report.id,revision:report.revision,action:'approve',role:signature.role,occurredAt:signature.occurredAt,sequence:index}));
 entries.push({reportVersionId:report.id,revision:report.revision,action:'deliver',role:'project_manager',occurredAt:report.delivery.deliveredAt,sequence:entries.length});
 if(report.feedback)entries.push({reportVersionId:report.id,revision:report.revision,action:report.feedback.action,role:'pharma_owner',occurredAt:report.feedback.occurredAt,sequence:entries.length});
 entries.sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt));
 return <ReportTimeline entries={entries} title="本修订签署与交付时间线" notice="相同时刻的公开记录不表示实际先后顺序。"/>;
}
