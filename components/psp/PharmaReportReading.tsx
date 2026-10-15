"use client";
import {useEffect,useId,useState} from 'react';
import {REPORT_ACTION_LABELS,REPORT_ROLE_LABELS,REPORT_STATUS_LABELS} from '@/lib/psp/reportTemplate';
import {buildReadingSummary,presentPublicFact,type ReadingFact,type ReadablePharmaReport} from './pharmaReadingModel';
import {buttonClass,formatPspTime} from './Common';
import {PublicReportTimeline} from './ReportTimeline';

type ReadingHeaderProps={report:ReadablePharmaReport;onRefresh:()=>void};
type ReadingEvidenceProps=ReadingHeaderProps&{downloadLinks:{text:string;html:string}};
const labels={delivered:'已交付，待客户反馈',accepted:'客户已验收',client_changes_requested:'客户已请求修改'};
const fallbackLabels:Record<string,string>={questionnaire_completion:'到期问卷完成',contact_completion:'到期计划联系成功',education_completion:'到期教育反馈',service_completion:'到期服务任务（联系+教育）'};

function FactDefinition({fact}:{fact:ReadingFact}){
 const [open,setOpen]=useState(false),id=useId();
 if(!fact.definition)return null;
 return <div><button type="button" aria-label={`查看口径：${fact.label}`} aria-expanded={open} aria-controls={id} className="text-sm text-gray-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-pink-700" onClick={()=>setOpen(!open)}>查看口径</button>
 <div id={id} hidden={!open} className="mt-2 max-w-prose space-y-1 text-sm leading-6 text-gray-700"><p>{fact.definition}</p>{fact.unitLabel&&<p>单位：{fact.unitLabel}</p>}</div></div>;
}
export function PharmaReportReadingHeader({report,onRefresh}:ReadingHeaderProps){
 const summary=buildReadingSummary(report.content);
 const label=report.status==='accepted'?labels.accepted:report.status==='client_changes_requested'?labels.client_changes_requested:labels.delivered;
 return <div className="min-w-0 space-y-5">
  <section aria-label="交付与客户反馈" className="min-w-0 space-y-2 text-sm">
   <h2 className="text-lg font-semibold">{label} · 修订 {report.revision}</h2>
   <p className="font-medium">{report.content.title}</p>
   <p>阶段数据：{formatPspTime(report.window.periodStart)} 至 {formatPspTime(report.window.cutoffAt)}（上海时间）</p>
   <p className="text-gray-700">交付：{formatPspTime(report.delivery.deliveredAt)}（上海时间）</p>
   <p className="text-gray-700">数据审核：{report.signatures.some(s=>s.role==='data_reviewer')?'已签署':'待签署'} · 医学审核：{report.signatures.some(s=>s.role==='medical_reviewer')?'已签署':'待签署'}</p>
  </section>
  <section data-testid="psp-pharma-reading-summary" aria-labelledby="public-reading-heading" className="min-w-0 space-y-3">
   <h2 id="public-reading-heading" className="font-semibold">本版阅读提要</h2>
   <p className="max-w-prose text-sm text-gray-700">以下结果来自本版固定报告。已保护、证据不足和无适用样本均不等于零，不据此判断目标达标。</p>
   <ul className="grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2">{summary.map(fact=><li key={fact.metricKey} className="min-w-0 space-y-1 border-t border-gray-200 pt-2 text-sm">
    <h3 className="font-medium">{fact.status==='unreadable'?fallbackLabels[fact.metricKey]:fact.label}</h3><p>{fact.result}</p><FactDefinition fact={fact}/>
   </li>)}</ul>
   {summary.some(fact=>fact.status==='unreadable')&&<button className={buttonClass} type="button" onClick={onRefresh}>重新核对报告数据</button>}
  </section>
  <section id="public-report-next-actions" data-testid="psp-pharma-next-actions" aria-labelledby="public-report-next-actions-heading" className="min-w-0 space-y-3 border-t border-gray-200 pt-4">
   <h2 id="public-report-next-actions-heading" tabIndex={-1} className="font-semibold">下一期服务安排</h2>
   <p className="max-w-prose text-sm text-gray-700">安排仅表示计划推进，不代表服务或临床事项已经完成。</p>
   {report.nextActions.length===0?<p className="text-sm">本版未列下一期服务安排</p>:<ul className="space-y-2 text-sm">{report.nextActions.map((action,index)=><li key={index} className="min-w-0 space-y-1">
    <p className="font-medium">{REPORT_ACTION_LABELS[action.category]} · {REPORT_ROLE_LABELS[action.responsibleRole]}</p>
    <p>{formatPspTime(action.dueAt)}（上海时间） · {REPORT_STATUS_LABELS[action.status]}</p>
   </li>)}</ul>}
  </section>
 </div>;
}

export function PharmaReportEvidence({report,downloadLinks,onRefresh}:ReadingEvidenceProps){
 const [bodyOpen,setBodyOpen]=useState(false),[closedChapters,setClosedChapters]=useState<Set<number>>(()=>new Set());
 const [generationOpen,setGenerationOpen]=useState(false),[auditOpen,setAuditOpen]=useState(false);
 const [anchor,setAnchor]=useState<{id:string}|null>(null);
 const scope=JSON.stringify([report.projectId,report.id,report.seedVersion,report.authorizationVersion,report.window.periodStart,report.window.periodEnd]);
 useEffect(()=>{
  const reveal=()=>{
   const id=window.location.hash.slice(1);
   if(!['public-report-body','public-report-timeline','public-report-feedback','public-report-next-actions'].includes(id)){setAnchor(null);return;}
   if(id==='public-report-body'){setBodyOpen(true);setClosedChapters(new Set());}
   setAnchor({id});
  };
  const click=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const link=event.target instanceof Element?event.target.closest('a'):null;
   const href=link?.getAttribute('href');
   if(href?.startsWith('#public-report-')&&href===window.location.hash)reveal();
  };
  reveal();window.addEventListener('hashchange',reveal);window.addEventListener('popstate',reveal);document.addEventListener('click',click);
  return ()=>{window.removeEventListener('hashchange',reveal);window.removeEventListener('popstate',reveal);document.removeEventListener('click',click);};
 },[scope]);
 useEffect(()=>{
  if(!anchor)return;
  const frame=requestAnimationFrame(()=>{
   const node=document.getElementById(`${anchor.id}-heading`)??document.getElementById(anchor.id);
   node?.scrollIntoView?.({block:'start'});node?.focus({preventScroll:true});
  });
  return ()=>cancelAnimationFrame(frame);
 },[anchor]);
 return <div data-testid="psp-pharma-reading-evidence" className="min-w-0 space-y-5">
  <section id="public-report-body" className="min-w-0 space-y-3 border-t border-gray-200 pt-4">
   <h2 id="public-report-body-heading" tabIndex={-1} className="font-semibold">完整固定正文</h2>
   <p className="max-w-prose text-sm text-gray-700">原文保留生成时的段落和口径；当前交付状态见本页上方。</p>
   <button type="button" className={buttonClass} aria-expanded={bodyOpen} aria-controls="public-report-body-content" onClick={()=>setBodyOpen(!bodyOpen)}>{bodyOpen?'收起完整报告':'展开完整报告'}</button>
   <div id="public-report-body-content">{bodyOpen&&<article data-testid="psp-pharma-report-content" className="min-w-0 space-y-5">
    {report.content.chapters.map((chapter,index)=>{
     const open=!closedChapters.has(index),chapterId=`public-report-chapter-${index}`;
     return <section key={index} className="min-w-0 space-y-2">
      <h3 className="font-medium">{chapter.title}</h3>
      <button type="button" className="text-sm text-gray-700 underline focus-visible:outline-2 focus-visible:outline-pink-700" aria-label={`${open?'收起':'展开'}章节：${chapter.title}`} aria-expanded={open} aria-controls={chapterId} onClick={()=>setClosedChapters(current=>{const next=new Set(current);if(next.has(index))next.delete(index);else next.add(index);return next;})}>{open?'收起本章':'展开本章'}</button>
      <div id={chapterId}>{open&&<div className="min-w-0 space-y-3">
       {chapter.title==='下一期服务安排'&&<p className="text-sm text-gray-600">以下为固定正文中的生成时说明，当前安排见上方“下一期服务安排”。</p>}
       {chapter.paragraphs.map((paragraph,i)=><p key={i} className="max-w-prose break-words text-sm leading-6 text-gray-700">{paragraph}</p>)}
       {chapter.facts.length>0&&<ul className="divide-y divide-gray-200">{chapter.facts.map(raw=>{const fact=presentPublicFact(raw,raw.metricKey);return <li key={raw.metricKey} data-testid={`psp-report-fact-${raw.metricKey}`} className="min-w-0 space-y-2 py-3 text-sm"><h4 className="font-medium">{fact.label}</h4><p>{fact.result}</p><FactDefinition fact={fact}/>{fact.status==='unreadable'&&<button className={buttonClass} type="button" onClick={onRefresh}>重新核对报告数据</button>}</li>;})}</ul>}
      </div>}</div>
     </section>;
    })}
   </article>}</div>
  </section>
  <section id="public-report-timeline" tabIndex={-1} className="min-w-0 space-y-3">
   <PublicReportTimeline report={report}/>
   <div className="flex min-w-0 flex-wrap gap-3"><a className={buttonClass} href={downloadLinks.text} download>下载固定文本</a><a className={buttonClass} href={downloadLinks.html} download>下载固定HTML</a></div>
  </section>
  <section className="min-w-0 space-y-3 border-t border-gray-200 pt-4">
   <button type="button" className={buttonClass} aria-expanded={generationOpen} aria-controls="public-generation-record" onClick={()=>setGenerationOpen(!generationOpen)}>原文生成记录</button>
   <div id="public-generation-record">{generationOpen&&<div className="space-y-2 text-sm"><p className="max-w-prose text-gray-700">以下是生成时原始文字，当前状态以本页交付记录为准。</p><p>{report.content.notice}</p></div>}</div>
  </section>
  <section className="min-w-0 space-y-3">
   <button type="button" className={buttonClass} aria-expanded={auditOpen} aria-controls="public-audit-details" onClick={()=>setAuditOpen(!auditOpen)}>核对资料</button>
   <div id="public-audit-details">{auditOpen&&<div className="min-w-0 space-y-2 text-sm">
    <p className="break-all">内容校验码：{report.contentDigest}</p><p className="break-all">文件校验码：{report.artifact.digest}</p>
    <p className="break-words">模板：{report.templateVersion} · 指标：{report.algorithmVersion} · 保护：{report.protectionVersion}</p>
    <p>完整统计窗口：{formatPspTime(report.window.periodStart)} 至 {formatPspTime(report.window.periodEnd)}（上海时间，结束边界不含）；阶段截止：{formatPspTime(report.window.cutoffAt)}。</p>
   </div>}</div>
  </section>
 </div>;
}
