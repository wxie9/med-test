import Link from 'next/link';
import type {PspReportSummary} from '@/lib/psp/reportTypes';
import {buttonClass,formatPspTime} from './Common';

function nextStep(item:PspReportSummary,role:string){
 if(item.actionGates?.canSubmit)return '提交审核';
 if(item.actionGates?.canApprove)return '核对后签署或退回';
 if(item.actionGates?.canDeliver)return '交付双签版本';
 if(item.createGate?.canCreate)return '可创建修订';
 if(item.status==='delivered')return '等待客户验收，可查看固定交付';
 if(item.status==='accepted')return '查看固定交付与客户验收记录';
 if(role==='project_manager')return (item.status==='draft'?item.actionGates?.submitReason:item.actionGates?.deliverReason)??item.actionGates?.reviseReason??item.createGate?.reason??item.workflow?.label??'选择版本核对服务端操作条件';
 return item.actionGates?.reviewReason??item.createGate?.reason??'选择版本核对服务端操作条件';
}
export function ReportWorkbenchCards({summaries,role,locked=false}:{summaries:PspReportSummary[];role:string;locked?:boolean}){
 return <div className="grid min-w-0 gap-3 md:grid-cols-2">{summaries.map(item=>
  <article key={item.id} className="min-w-0 space-y-2 rounded border border-gray-200 p-3 text-sm">
   <h3 className="font-semibold">修订 {item.revision} · {item.workflow?.label??'模板草稿，待人工审核'}</h3>
   <p>阶段窗口：{formatPspTime(item.window.periodStart)} 至 {formatPspTime(item.window.periodEnd)}</p>
   <p>数据截至：{formatPspTime(item.window.cutoffAt)} · 阶段数据</p>
   <p className="break-all">冻结快照：{item.snapshotId}</p>
   <p>数据审核：{item.workflow?.dataReview?`已签署 · ${formatPspTime(item.workflow.dataReview.occurredAt)}`:'尚未签署'} · 医学审核：{item.workflow?.medicalReview?`已签署 · ${formatPspTime(item.workflow.medicalReview.occurredAt)}`:'尚未签署'}</p>
   <p>当前授权：{item.authorizationGate?.status==='eligible'?'可用':item.authorizationGate?.reason??'等待服务端核对'}</p>
   <p>下一步：{nextStep(item,role)}</p>
   {locked?<><button className={buttonClass} type="button" disabled>打开修订 {item.revision}</button><p className="text-amber-900">当前操作待完成或核对，暂不能切换报告修订。</p></>:<Link className={`${buttonClass} inline-block`} href={`/governance/projects/${encodeURIComponent(item.projectId)}/reports/${encodeURIComponent(item.id)}?role=${role}`}>打开修订 {item.revision}</Link>}
  </article>)}</div>;
}
