"use client";
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import {usePspState,type PspVersion} from '@/lib/client/usePspState';
import type {PharmaProjectView,PharmaReportView} from '@/lib/psp/pharmaView';
import {buttonClass,Feedback,formatPspTime} from './Common';
import {PharmaReportReadingHeader,PharmaReportEvidence} from './PharmaReportReading';
import {isReadablePharmaReport as available,type ReadablePharmaReport as AvailableReport} from './pharmaReadingModel';
function DeliveredContent({summary,onInvalidation}:{summary:AvailableReport;onInvalidation:(version:PspVersion)=>void}){
 const query=new URLSearchParams({role:'pharma_owner',actorId:'pharma-owner-a',seedVersion:String(summary.seedVersion),authorizationVersion:String(summary.authorizationVersion),periodStart:summary.window.periodStart,periodEnd:summary.window.periodEnd});
 const endpoint=`/api/pharma/projects/${encodeURIComponent(summary.projectId)}/reports/${encodeURIComponent(summary.id)}`;
 const state=usePspState<PharmaReportView>(`${endpoint}?${query}`,10000,true),[comment,setComment]=useState(''),[ack,setAck]=useState<number|null>(null);
 const data=state.data;
 useEffect(()=>{if(state.invalidation)onInvalidation(state.invalidation);else if(data&&(data.seedVersion!==summary.seedVersion||data.authorizationVersion>summary.authorizationVersion))onInvalidation(data);},[state.invalidation,data,summary.seedVersion,summary.authorizationVersion,onInvalidation]);
 if(!data)return <div className="space-y-3"><p role="status">{state.notice||'正在核对当前授权并读取交付报告…'}</p><button type="button" className={buttonClass} onClick={()=>void state.refresh()}>刷新当前报告内容</button></div>;
 if(data.id!==summary.id||data.projectId!==summary.projectId||data.seedVersion!==summary.seedVersion||data.authorizationVersion!==summary.authorizationVersion)return <p role="status">授权或报告版本已变化，正在核对项目状态。</p>;
 if(!available(data))return <p role="status">{data.gate.reason}</p>;
 const needsAck=!!state.conflict&&ack!==state.conflict.id,locked=state.busy||state.canRetry||needsAck;
 const canFeedback=data.status==='delivered';
 const command=(body:Record<string,unknown>)=>{if(locked||!canFeedback)return;setAck(null);state.command(`${endpoint}/actions`,body,{role:'pharma_owner',actorId:'pharma-owner-a'},data.version);};
 return <div className="min-w-0 space-y-5">
  <PharmaReportReadingHeader report={data} onRefresh={()=>void state.refresh()}/>
  <nav aria-label="交付报告章节导航" className="flex flex-wrap gap-3 text-sm text-pink-700 underline"><a href="#public-report-body">固定正文</a><a href="#public-report-timeline">签署时间线</a><a href="#public-report-feedback">客户反馈</a></nav>
  <button type="button" className={buttonClass} onClick={()=>void state.refresh()}>刷新当前报告内容</button>
  <section id="public-report-feedback" tabIndex={-1} className="min-w-0 space-y-3 border-t border-gray-200 pt-4"><h2 className="font-semibold">客户反馈与验收</h2><p className="max-w-prose text-sm text-gray-700">验收确认本次交付范围，不代表所有服务指标达标。意见单独记录，固定下载内容保持交付时的版本。</p>{data.feedback&&<div className="space-y-1 text-sm"><p>{data.feedback.action==='accept'?'验收意见':'修改请求'} · {formatPspTime(data.feedback.occurredAt)}</p><p className="break-words">{data.feedback.comment||'未填写意见'}</p></div>}<Feedback {...state}/><fieldset disabled={locked||!canFeedback} className="min-w-0 space-y-3"><label className="block max-w-xl text-sm">客户意见<textarea className="mt-1 block w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2" rows={3} maxLength={1000} value={comment} onChange={event=>setComment(event.target.value)}/></label><div className="flex flex-wrap gap-3"><button className={buttonClass} type="button" onClick={()=>command({action:'accept',comment:comment.trim()})}>验收此版本</button><button className={buttonClass} type="button" disabled={!comment.trim()} onClick={()=>command({action:'request_changes',reason:comment.trim()})}>请求修改</button></div></fieldset>{needsAck&&<button className={buttonClass} type="button" disabled={!state.conflict?.refreshed} onClick={()=>{if(state.conflict?.refreshed)setAck(state.conflict.id);}}>已核对最新交付状态，继续</button>}{data.status==='client_changes_requested'&&<p className="text-sm text-gray-700">修改请求已记录，等待服务方生成新修订并重新审核。</p>}{data.status==='accepted'&&<p className="text-sm text-gray-700">此版本已验收，验收记录与固定交付版本保留。</p>}</section>
  <PharmaReportEvidence report={data} onRefresh={()=>void state.refresh()} downloadLinks={{text:`${endpoint}/download?${query}&format=text`,html:`${endpoint}/download?${query}&format=html`}}/>
  {locked?<><button className={buttonClass} type="button" disabled>切换到此版本院内演示</button><p className="text-sm text-amber-900">当前操作待完成或核对，暂不能切换报告页面。</p></>:<Link className={`${buttonClass} inline-block`} href={`/governance/projects/${encodeURIComponent(data.projectId)}/reports/${encodeURIComponent(data.id)}`}>切换到此版本院内演示</Link>}
 </div>;
}

export function PharmaReport({projectId,reportId}:{projectId:string;reportId:string}){
 return <PharmaReportVisit key={JSON.stringify([projectId,reportId])} projectId={projectId} reportId={reportId}/>;
}
function PharmaReportVisit({projectId,reportId}:{projectId:string;reportId:string}){
 const state=usePspState<PharmaProjectView>(`/api/pharma/projects/${encodeURIComponent(projectId)}`,10000,true),data=state.data;
 const {installVersionBarrier,refresh}=state;
 const onInvalidation=useCallback((version:PspVersion)=>{installVersionBarrier(version);void refresh();},[installVersionBarrier,refresh]);
 const report=data?.reports.find(item=>item.id===reportId);
 return <div className="min-w-0 space-y-5"><h1 className="text-xl font-semibold">项目交付报告</h1><p className="max-w-prose text-sm text-gray-700">合成数据 · 模拟药企A身份 · 当前授权每次读取和下载均重新核对。</p><div className="flex flex-wrap gap-3"><Link className={buttonClass} href={`/pharma/projects/${encodeURIComponent(projectId)}`}>返回项目概览</Link><button type="button" className={buttonClass} onClick={()=>void state.refresh()}>刷新交付报告</button></div>{!data?<p role="status">{state.notice||'正在核对项目与授权…'}</p>:!report?<p role="status">当前没有可访问的此报告，请返回项目概览选择已交付版本。</p>:report.seedVersion!==data.seedVersion||report.authorizationVersion!==data.authorizationVersion?<p role="status">报告授权版本与项目不一致，请刷新后重试。</p>:!available(report)?<p role="status">{report.gate.reason}</p>:<DeliveredContent key={`${projectId}:${reportId}:${data.seedVersion}:${data.authorizationVersion}:${report.window.periodStart}:${report.window.periodEnd}`} summary={report} onInvalidation={onInvalidation}/>}</div>;
}
