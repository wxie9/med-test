"use client";
import {useState} from 'react';
import {usePspState} from '@/lib/client/usePspState';
import type {PspReportDetail} from '@/lib/psp/reportTypes';
import type {PspRole} from '@/lib/psp/types';
import {buttonClass,Feedback} from './Common';
export type ReportReviewState=ReturnType<typeof usePspState<PspReportDetail>>;
export function ReportReviewPanel({state,role,actorId,locked,needsAcknowledgement,onAcknowledge,onBegin,onRefresh}:{state:ReportReviewState;role:PspRole;actorId:string;locked:boolean;needsAcknowledgement:boolean;onAcknowledge:()=>void;onBegin:()=>void;onRefresh:()=>void}){
 const [reason,setReason]=useState('');const data=state.data;
 if(!data)return null;const gate=data.actionGates;if(!gate)return null;
 const identity={role,actorId},target=`/api/psp/reports/${encodeURIComponent(data.report.id)}/actions`;
 const command=(body:Record<string,unknown>)=>{if(!locked){onBegin();state.command(target,body,identity,data.report.version);}};
 return <section data-testid="psp-report-review-panel" className="min-w-0 space-y-3 border-t border-gray-200 pt-4"><h3 className="font-semibold">报告审核操作</h3><p className="text-sm text-gray-700">当前报告操作版本：{data.report.version}。提交及审核核对这个版本；创建修订继续使用项目账版本。</p><Feedback {...state}/><button className={buttonClass} type="button" onClick={onRefresh}>刷新审核状态</button>
  <fieldset disabled={locked} className="min-w-0 space-y-3">
   {role==='project_manager'&&<><button type="button" className={buttonClass} disabled={!gate.canSubmit} onClick={()=>command({action:'submit'})}>提交报告审核</button>{gate.submitReason&&<p className="text-sm text-gray-700">{gate.submitReason}</p>}<button type="button" className={buttonClass} disabled={!gate.canDeliver} onClick={()=>command({action:'deliver'})}>交付此报告版本</button>{gate.deliverReason&&<p className="text-sm text-gray-700">{gate.deliverReason}</p>}</>}
   {gate.reviewKind&&<><button type="button" className={buttonClass} disabled={!gate.canApprove} onClick={()=>command({action:'review',kind:gate.reviewKind,decision:'approve'})}>通过{gate.reviewKind==='data'?'数据':'医学'}审核</button><label className="block max-w-xl text-sm">退回理由<textarea className="mt-1 block w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2" maxLength={1000} rows={3} value={reason} onChange={event=>setReason(event.target.value)}/></label><button type="button" className={buttonClass} disabled={!gate.canReturn||!reason.trim()} onClick={()=>command({action:'review',kind:gate.reviewKind,decision:'return',reason:reason.trim()})}>退回补充</button>{gate.reviewReason&&<p className="text-sm text-gray-700">{gate.reviewReason}</p>}</>}
  </fieldset>{needsAcknowledgement&&<button type="button" className={buttonClass} disabled={!state.conflict?.refreshed} onClick={onAcknowledge}>已核对最新审核状态，继续</button>}
 </section>;
}
