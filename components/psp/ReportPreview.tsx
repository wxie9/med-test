import type {ReportContent,ReportFact,ReportWorkflowMetadata} from '@/lib/psp/reportTypes';
const units:Record<ReportFact['unit'],string>={people:'人',forms:'份',assignments:'项',alerts:'件',interactions:'次',doses:'剂',hours:'小时',days:'天',records:'条'};
function FactValue({fact}:{fact:ReportFact}){
 if(fact.status==='suppressed')return <span>已保护 · 不展示精确结果</span>;
 if(fact.status==='unknown')return <span>未知 · 证据不足</span>;
 if(fact.status==='no_applicable')return <span>无适用样本</span>;
 if(typeof fact.value!=='number'||!Number.isFinite(fact.value))return <span>未知 · 报告值缺失</span>;
 return <span>{fact.numerator!==undefined&&fact.denominator!==undefined?`${fact.numerator} / ${fact.denominator}`:`${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(fact.value)} ${units[fact.unit]}`}{fact.sampleN!==undefined&&<span> · 适用样本 {fact.sampleN}</span>}</span>;
}
export function ReportPreview({content,workflow}:{content:ReportContent;workflow:ReportWorkflowMetadata}){
 return <div className="min-w-0 space-y-4">
  <article data-testid="psp-report-content" className="min-w-0 space-y-6">
   <header className="space-y-2"><h2 className="text-lg font-semibold">{content.title}</h2><p className="text-sm font-medium text-pink-800">{content.notice}</p><p className="text-sm text-gray-700">受保护汇总正文 · 内部审核预览，尚未交付。</p></header>
   {content.chapters.map(chapter=><section key={chapter.id} className="min-w-0 space-y-3 border-t border-gray-200 pt-4"><h3 className="font-semibold">{chapter.title}</h3>{chapter.paragraphs.map((paragraph,index)=><p key={index} className="max-w-prose break-words text-sm leading-6 text-gray-700">{paragraph}</p>)}{chapter.facts.length>0&&<ul className="divide-y divide-gray-200">{chapter.facts.map(fact=><li key={fact.id} data-testid={`psp-report-fact-${fact.metricKey}`} className="space-y-2 py-3 text-sm"><div className="flex min-w-0 flex-wrap justify-between gap-2"><h4 className="font-medium">{fact.label}</h4><FactValue fact={fact}/></div><p className="max-w-prose text-gray-700">{fact.definition}</p></li>)}</ul>}</section>)}
  </article>
  <section data-testid="psp-report-workflow" aria-label="审核与交付工作流" className="space-y-2 bg-gray-50 p-3 text-sm"><p className="font-medium">{workflow.label}</p><p>数据审核：{workflow.dataReview===null?'尚未签署':'已有记录'} · 医学审核：{workflow.medicalReview===null?'尚未签署':'已有记录'}</p><p>交付：{workflow.delivery===null?'尚未交付':'已有记录'} · 客户验收：{workflow.acceptance===null?'尚未验收':'已有记录'}</p><p className="text-gray-700">本阶段只生成固定草稿。审核、交付与验收信息独立于正文，后续流程另行开放。</p></section>
 </div>;
}
