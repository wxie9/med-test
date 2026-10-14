'use client';
import { useState } from 'react';
import { usePspState } from '@/lib/client/usePspState';
import type { ProjectAdherenceView } from '@/lib/psp/evidenceView';
import { buttonClass, Feedback, formatPspTime } from './Common';
const controlClass = 'mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm';
type State = ReturnType<typeof usePspState<ProjectAdherenceView>>;
function TodayForm({ state, patientId, enrollmentId }: {state:State;patientId:string;enrollmentId:string}) {
 const data=state.data!;
 const [editing,setEditing]=useState(!data.latestToday),[revisionOf,setRevision]=useState<string|undefined>();
 const [taken,setTaken]=useState<0|1>(1),[reason,setReason]=useState('忘记'),[ackNotice,setAck]=useState(''),[savedReopened,setSavedReopened]=useState(false);
 const reviewRequired=!!state.notice?.startsWith('状态已变化')&&ackNotice!==state.notice;
 const locked=state.busy||state.canRetry||reviewRequired;
 const success=state.notice==='操作已保存。'&&!savedReopened;
 const openRevision=()=>{if(locked||!data.latestToday)return;setRevision(data.latestToday.sourceId);setTaken(data.latestToday.taken as 0|1);setReason(data.latestToday.reason??'忘记');setEditing(true);setSavedReopened(true);};
 const stale=revisionOf&&revisionOf!==data.latestToday?.sourceId&&!state.busy&&!state.canRetry&&!success;
 const showForm=(editing&&!success)||state.busy||state.canRetry;
 return <section className="space-y-3 border-t border-gray-200 pt-4" aria-label="今日项目服药自报">
  <h2 className="font-semibold">今日项目服药自报</h2><p className="text-sm text-gray-700">{data.serverToday} · 上海今天 · 现场自报为精确时刻，发生时间与入账时间由服务器生成。</p>
  {data.latestToday&&<p className="text-sm text-gray-800">最新自报：{data.latestToday.taken===1?'已服':'未服'}{data.latestToday.reason?`（${data.latestToday.reason}）`:''} · {formatPspTime(data.latestToday.recordedAt)}</p>}
  {!data.canSubmit&&!state.busy&&!state.canRetry?<p className="text-sm text-gray-700">当前项目服务不可写，请核对服务授权、成员状态和项目期间。历史记录保留。</p>:<>
   {data.latestToday&&!showForm&&<button type="button" className={buttonClass} onClick={openRevision}>修订最新自报</button>}
   {showForm&&<form onSubmit={event=>{event.preventDefault();if(locked||stale||!data.canSubmit)return;setAck('');setSavedReopened(false);state.command(`/api/psp/enrollments/${encodeURIComponent(enrollmentId)}/adherence`,{action:'submit',logDate:data.serverToday,due:1,taken,...(taken===0?{reason:reason.trim()}:{}),...(revisionOf?{revisionOf}:{})},{role:'patient',actorId:patientId},data.enrollment.version);}} className="space-y-3">
    {revisionOf&&<p className="text-sm text-gray-700">正在修订明确选定的最新自报，旧值保留为独立证据副本。</p>}
    {stale&&<p role="alert" className="text-sm text-red-700">最新自报已变化，请核对后重新选择修订目标。</p>}
    <fieldset disabled={locked||!!stale||!data.canSubmit} className="space-y-3">
     <label className="block text-sm">今日服药情况<select className={controlClass} value={taken} onChange={e=>setTaken(Number(e.target.value) as 0|1)}><option value="1">已服（1 / 1）</option><option value="0">未服（0 / 1）</option></select></label>
     {taken===0&&<label className="block text-sm">未服原因<select className={controlClass} value={reason} onChange={e=>setReason(e.target.value)}>{['忘记','副作用','药物用完','其他'].map(value=><option key={value}>{value}</option>)}</select></label>}
     <button type="submit" className="w-full rounded-lg bg-pink-600 px-3 py-2 text-sm text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50">{revisionOf?'提交自报修订':'提交今日自报'}</button>
    </fieldset>
   </form>}
   {(reviewRequired||stale)&&!state.busy&&!state.canRetry&&<button type="button" className={buttonClass} onClick={()=>{setAck(state.notice??'');setRevision(data.latestToday?.sourceId);setTaken((data.latestToday?.taken??1) as 0|1);setReason(data.latestToday?.reason??'忘记');setEditing(true);}}>已核对最新记录，继续</button>}
  </>}
  <Feedback {...state} notice={savedReopened&&state.notice==='操作已保存。'?null:state.notice}/>
 </section>;
}
export function ProjectAdherence({patientId,enrollmentId}:{patientId:string;enrollmentId:string}) {
 const state=usePspState<ProjectAdherenceView>(`/api/psp/enrollments/${encodeURIComponent(enrollmentId)}/adherence?role=patient&actorId=${encodeURIComponent(patientId)}`);
 if(!enrollmentId)return <p role="alert" className="m-3 text-sm text-red-700">项目成员参数无效，请从患者服务项目重新进入。</p>;
 if(!state.data)return <section className="m-3 space-y-3 rounded-xl border border-gray-200 bg-white p-4"><h1 className="font-semibold">项目服药证据</h1><p role={state.notice?'alert':'status'} className="text-sm text-gray-700">{state.notice?`项目服药记录无法加载：${state.notice}`:'正在加载项目服药记录…'}</p>{state.notice&&<button className={buttonClass} onClick={()=>void state.refresh()}>重新加载项目记录</button>}</section>;
 if(state.data.patientId!==patientId||state.data.enrollment.id!==enrollmentId)return <p role="alert" className="m-3 text-sm text-red-700">项目服药记录患者归属不匹配，请核对当前患者。</p>;
 const data=state.data;
 return <section data-testid="psp-project-adherence" className="m-3 space-y-4 rounded-xl border border-gray-200 bg-white p-4">
  <h1 className="font-semibold">项目服药证据</h1><p className="text-sm text-gray-800">当前患者：{data.displayName} · {patientId}</p><h2 className="text-sm font-semibold">{data.project.title}</h2><p className="text-xs text-gray-700">合成数据 · 模拟患者身份 · 自报值不代表临床疗效。</p>
  <button type="button" className={buttonClass} onClick={()=>void state.refresh()}>刷新项目记录</button>
  <TodayForm key={`${patientId}:${enrollmentId}:${data.seedVersion}`} state={state} patientId={patientId} enrollmentId={enrollmentId}/>
  <section className="space-y-2 border-t border-gray-200 pt-4"><h2 className="font-semibold">独立证据副本（{data.records.length}）</h2><p className="text-sm text-gray-700">{data.history.notice}</p><p className="text-xs text-gray-700">已导入 {data.history.importedCount} · 截止可纳入 {data.history.includedCount} · 截止未纳入 {data.history.excludedCount}。这是证据状态，非依从率。</p>
   {data.records.length?<ul className="divide-y divide-gray-200 text-sm">{data.records.map(record=><li key={record.sourceId} className="space-y-1 py-3"><p className="font-medium">{record.logDate} · {record.taken}/{record.due} · {record.precision==='date_only'?'历史日期副本（仅日期）':'精确时刻自报'}{record.revisionOf?' · 修订版':''}</p>{record.reason&&<p>原因：{record.reason}</p>}<p className="text-gray-700">发生时间：{record.occurredAt?formatPspTime(record.occurredAt):'仅日期，无法确认日内时刻'}</p><p className="text-gray-700">真实入账时间：{formatPspTime(record.recordedAt)}</p></li>)}</ul>:<p className="text-sm text-gray-700">尚无项目证据副本。历史日期需由服务团队显式导入。</p>}
  </section>
 </section>;
}
