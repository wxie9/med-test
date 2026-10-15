import {formatPspTime} from './Common';
import type {ReportContent,ReportFact,ReportWorkflowMetadata} from '@/lib/psp/reportTypes';
const units:Record<ReportFact['unit'],string>={people:'人',forms:'份',assignments:'项',alerts:'件',interactions:'次',doses:'剂',hours:'小时',days:'天',records:'条'};
function FactValue({fact}:{fact:Omit<ReportFact,'id'>}){
 if(fact.status==='suppressed')return <span>已保护 · 不展示精确结果</span>;
 if(fact.status==='unknown')return <span>未知 · 证据不足</span>;
 if(fact.status==='no_applicable')return <span>无适用样本</span>;
 if(typeof fact.value!=='number'||!Number.isFinite(fact.value))return <span>未知 · 报告值缺失</span>;
 return <span>{fact.numerator!==undefined&&fact.denominator!==undefined?`${fact.numerator} / ${fact.denominator}`:`${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(fact.value)} ${units[fact.unit]}`}{fact.sampleN!==undefined&&<span> · 适用样本 {fact.sampleN}</span>}</span>;
}
type DisplayContent=Pick<ReportContent,'title'|'notice'>&{chapters:{title:string;paragraphs:string[];facts:Omit<ReportFact,'id'>[]}[]};
export function ReportBody({content,testId='psp-report-content',context='受保护汇总正文 · 内部核对预览，当前状态见工作流。'}:{content:DisplayContent;testId?:string;context?:string}){
 return <article data-testid={testId} className="min-w-0 space-y-6">
  <header className="space-y-2"><h2 className="text-lg font-semibold">{content.title}</h2><p className="text-sm font-medium text-pink-800">{content.notice}</p><p className="text-sm text-gray-700">{context}</p></header>
  {content.chapters.map((chapter,index)=><section key={index} className="min-w-0 space-y-3 border-t border-gray-200 pt-4"><h3 className="font-semibold">{chapter.title}</h3>{chapter.paragraphs.map((paragraph,i)=><p key={i} className="max-w-prose break-words text-sm leading-6 text-gray-700">{paragraph}</p>)}{chapter.facts.length>0&&<ul className="divide-y divide-gray-200">{chapter.facts.map(fact=><li key={fact.metricKey} data-testid={`psp-report-fact-${fact.metricKey}`} className="space-y-2 py-3 text-sm"><div className="flex min-w-0 flex-wrap justify-between gap-2"><h4 className="font-medium">{fact.label}</h4><FactValue fact={fact}/></div><p className="max-w-prose text-gray-700">{fact.definition}</p></li>)}</ul>}</section>)}
 </article>;
}
export function ReportPreview({content,workflow}:{content:ReportContent;workflow:ReportWorkflowMetadata}){
 return <div className="min-w-0 space-y-4"><ReportBody content={content}/>
  <section data-testid="psp-report-workflow" aria-label="审核与交付工作流" className="min-w-0 space-y-2 bg-gray-50 p-3 text-sm"><p className="font-medium">{workflow.label}</p><p>数据审核：{workflow.dataReview===null?'尚未签署':`已签署 · ${workflow.dataReview.actorId} · ${formatPspTime(workflow.dataReview.recordedAt)}`} · 医学审核：{workflow.medicalReview===null?'尚未签署':`已签署 · ${workflow.medicalReview.actorId} · ${formatPspTime(workflow.medicalReview.recordedAt)}`}</p>
   {workflow.submission&&<p className="break-all">本次提交：{workflow.submission.id} · 报告修订 {workflow.submission.revision} · 提交版本 {workflow.submission.submittedVersion}</p>}
   {workflow.status==='in_review'&&<p>待补签：{workflow.missingReviews.map(kind=>kind==='data'?'数据审核':'医学审核').join('、')||'正在核对'}</p>}
   {workflow.returnReview&&<p className="break-words">退回理由：{workflow.returnReview.reason}</p>}
   {workflow.status==='changes_requested'&&<p>原版签署记录保留；修订版需重新提交并完成两类审核。</p>}
   <p>交付：{workflow.delivery===null?'尚未交付':formatPspTime(workflow.delivery.recordedAt)} · 客户验收：{workflow.acceptance===null?'尚未验收':formatPspTime(workflow.acceptance.recordedAt)}</p>{workflow.clientFeedback&&<p className="break-words">客户{workflow.clientFeedback.action==='accept'?'验收意见':'修改请求'}：{workflow.clientFeedback.comment||'未填写意见'}</p>}<p className="text-gray-700">正文保留生成时的模板标记，当前状态见本区。交付后的固定下载保留原字节；客户意见另行记录。</p></section>
 </div>;
}
