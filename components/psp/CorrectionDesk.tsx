'use client';
import { useState } from 'react';
import { usePspState } from '@/lib/client/usePspState';
import type { CorrectionDeskView } from '@/lib/psp/evidenceView';
import { buttonClass, Feedback, formatPspTime, ProjectDetails } from './Common';
const controlClass='mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm';
const outcomes={reached:'已接通',no_answer:'未接通',refused:'拒绝',channel_unavailable:'渠道不可用'};
const channelLabel=(value:string|null)=>value==='phone'?'电话':value==='message'?'消息':'未记录渠道';
function shanghaiInput(value:string){return new Date(Date.parse(value)+8*3600000).toISOString().slice(0,16);}
type State=ReturnType<typeof usePspState<CorrectionDeskView>>;
function CorrectionForms({state,projectId}:{state:State;projectId:string}) {
 const data=state.data!,[memberId,setMember]=useState(''),[sourceId,setSource]=useState(''),[channel,setChannel]=useState<'phone'|'message'>('phone'),[outcome,setOutcome]=useState<keyof typeof outcomes>('reached'),[occurredAt,setOccurred]=useState(''),[reason,setReason]=useState(''),[ackNotice,setAck]=useState('');
 const source=data.contacts.find(item=>item.sourceRef.id===sourceId),member=data.enrollments.find(item=>item.id===memberId),enrollment=data.enrollments.find(item=>item.id===source?.enrollmentId);
 const reviewRequired=!!state.notice?.startsWith('状态已变化')&&ackNotice!==state.notice;
 const locked=state.busy||state.canRetry||reviewRequired;
 const parsed=occurredAt?Date.parse(`${occurredAt}:00+08:00`):NaN;
 const validTime=Number.isFinite(parsed)&&parsed<=Date.parse(data.serverNow)&&parsed>=Date.parse(data.project.startsAt)&&parsed<=Date.parse(data.project.endsAt);
 return <div className="space-y-6">
  {reviewRequired&&<button className={buttonClass} onClick={()=>setAck(state.notice??'')}>已核对来源和最新状态，继续</button>}
  <section className="space-y-3 border-t border-gray-200 pt-4"><h2 className="font-semibold">历史服药日期副本</h2><p className="text-sm text-gray-700">仅复制完整落在服务与授权窗口内的已结束日期。今天、截止当日及跨时刻边界日期精度不足；导入时间为真实入账时间。</p>
   <fieldset disabled={locked} className="space-y-3"><label className="block text-sm">历史副本成员<select className={controlClass} value={memberId} onChange={e=>setMember(e.target.value)}><option value="">请选择成员</option>{data.enrollments.map(item=><option key={item.id} value={item.id}>{item.displayName}{item.canImport?'':'（当前只读）'}</option>)}</select></label><button type="button" className={buttonClass} disabled={!member?.canImport} onClick={()=>{if(!member?.canImport||locked)return;setAck('');state.command(`/api/psp/enrollments/${encodeURIComponent(member.id)}/adherence`,{action:'import_legacy'},{role:'case_manager',actorId:'case-manager-chen'},member.version);}}>导入历史日期副本</button></fieldset>
   {member&&!member.canImport&&<p className="text-sm text-gray-700">该成员当前服务不可写，请核对授权、状态和项目期间。</p>}
  </section>
  <section className="space-y-3 border-t border-gray-200 pt-4"><h2 className="font-semibold">补录联系来源</h2><p className="text-sm text-gray-700">选择原始联系事件，明确补录值、发生时间和原因。服务器在实际提交时记录真实入账时间，不能倒写。提交后为待核验。</p>
   <form onSubmit={e=>{e.preventDefault();if(locked||!source?.canPropose||!enrollment||!reason.trim()||!validTime)return;setAck('');state.command(`/api/psp/projects/${encodeURIComponent(projectId)}/corrections`,{action:'propose',sourceRef:source.sourceRef,correctedValue:{kind:'contact',channel,outcome},reason:reason.trim(),occurredAt:new Date(parsed).toISOString()},{role:'case_manager',actorId:'case-manager-chen'},enrollment.version);}} className="space-y-3">
    <fieldset disabled={locked} className="space-y-3"><label className="block text-sm">原始联系来源<select className={controlClass} value={sourceId} onChange={e=>{setSource(e.target.value);setOccurred('');}}><option value="">请选择原始联系</option>{data.contacts.map(item=><option key={item.sourceRef.id} value={item.sourceRef.id}>{item.displayName} · {formatPspTime(item.occurredAt)} · {outcomes[item.outcome]}{item.canPropose?'':'（只读）'}</option>)}</select></label>
     {source&&<div className="space-y-1 rounded bg-gray-50 p-3 text-sm break-words"><p>原值：{channelLabel(source.channel)} · {outcomes[source.outcome]}</p><p>原发生时间：{formatPspTime(source.occurredAt)}</p><p>原入账时间：{formatPspTime(source.recordedAt)}</p><p>来源：{source.sourceRef.id} · 联系：{source.interactionId} · {source.background?'合成背景记录':'现场联系记录'}</p></div>}
     <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">补录联系渠道<select className={controlClass} value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}><option value="phone">电话</option><option value="message">消息</option></select></label><label className="block text-sm">补录联系结果<select className={controlClass} value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}>{Object.entries(outcomes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
     <label className="block text-sm">补录发生时间（上海时间）<input className={controlClass} type="datetime-local" required min={shanghaiInput(data.project.startsAt)} max={shanghaiInput(data.serverNow)} value={occurredAt} onChange={e=>setOccurred(e.target.value)}/></label><label className="block text-sm">补录原因<textarea className={controlClass} required maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
     <button type="submit" className={buttonClass} disabled={!source?.canPropose||!enrollment||!reason.trim()||!validTime}>提交补录待核验</button>
    </fieldset>
   </form>{source&&!source.canPropose&&<p className="text-sm text-gray-700">该来源当前不可补录，可能已有补录或成员服务不可写。</p>}
  </section>
 </div>;
}
function CorrectionRow({item,state,reviewer,projectId}:{item:CorrectionDeskView['corrections'][number];state:State;reviewer:boolean;projectId:string}) {
 const [checked,setChecked]=useState(false),[ackNotice,setAck]=useState('');
 const reviewRequired=!!state.notice?.startsWith('状态已变化')&&ackNotice!==state.notice;
 const locked=state.busy||state.canRetry||reviewRequired;
 const original=state.data?.contacts.find(contact=>contact.sourceRef.id===item.sourceRef.id);
 return <li data-testid={`psp-correction-${item.id}`} className="space-y-2 py-4 text-sm break-words"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{item.displayName}</h3><span className={`rounded px-2 py-1 ${item.status==='verified'?'bg-green-50 text-green-800':'bg-amber-50 text-amber-900'}`}>{item.status==='verified'?'已核验 · 供未来新快照':'待核验 · 尚不可用'}</span></div>
  <p>原值：{channelLabel(item.sourceValue.channel)} · {outcomes[item.sourceValue.outcome]}</p><p>原发生时间：{formatPspTime(item.sourceValue.occurredAt)}</p>{original&&<p>原入账时间：{formatPspTime(original.recordedAt)}</p>}<p>新值：{channelLabel(item.correctedValue.channel)} · {outcomes[item.correctedValue.outcome]}</p><p>补录发生时间：{formatPspTime(item.occurredAt)}</p><p>真实入账时间：{formatPspTime(item.recordedAt)}</p><p>原因：{item.reason}</p><p className="text-gray-700">核验来源：{item.sourceRef.id} · 联系：{item.interactionId}{item.assignmentId?` · 计划：${item.assignmentId}`:''}</p>{item.alertIds.length>0&&<p className="text-gray-700">覆盖预警：{item.alertIds.join('、')}</p>}
  {item.verifiedAt&&<p>核验时间：{formatPspTime(item.verifiedAt)}</p>}
  {reviewer&&item.status==='proposed'&&<>{!item.canVerify?<p className="text-gray-700">当前不可核验，请核对成员服务状态和历史发生时间。</p>:<fieldset disabled={locked} className="space-y-2"><label className="flex items-start gap-2"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} className="mt-1 accent-pink-600"/>已逐项核对来源、值、发生时间、入账时间和原因</label><button type="button" className={buttonClass} disabled={!checked} onClick={()=>{if(!checked||locked)return;setAck('');state.command(`/api/psp/projects/${encodeURIComponent(projectId)}/corrections`,{action:'verify',correctionId:item.id},{role:'data_reviewer',actorId:'data-reviewer-psp'},item.version);}}>核验此项补录</button></fieldset>}{reviewRequired&&<button className={buttonClass} onClick={()=>{setChecked(false);setAck(state.notice??'');}}>已核对来源和最新状态，继续</button>}</>}
 </li>;
}
function DeskScope({projectId,role}:{projectId:string;role:'case_manager'|'data_reviewer'}) {
 const reviewer=role==='data_reviewer',actorId=reviewer?'data-reviewer-psp':'case-manager-chen';
 const state=usePspState<CorrectionDeskView>(`/api/psp/projects/${encodeURIComponent(projectId)}/corrections?role=${role}&actorId=${actorId}`);
 return <div className="space-y-4"><h2 className="font-semibold">{reviewer?'数据审核者 · 核验补录':'个案管理师 · 导入与补录'}</h2><button type="button" className={buttonClass} onClick={()=>void state.refresh()}>刷新证据状态</button><Feedback {...state}/>{!state.data?<p role={state.notice?'alert':'status'} className="text-sm text-gray-700">{state.notice?'项目证据暂时无法加载，请刷新重试。':'正在加载项目证据…'}</p>:<><h2 className="font-semibold">{state.data.project.title}</h2><ProjectDetails project={state.data.project}/><p className="rounded bg-gray-50 p-3 text-sm text-gray-800">{state.data.historyNotice} 核验不完成原计划、临床任务或医生记录，也不计算质量指标。已冻结的旧快照保持原值。</p>{!reviewer&&<CorrectionForms key={state.data.seedVersion} state={state} projectId={projectId}/>}<section className="border-t border-gray-200 pt-4"><h2 className="font-semibold">{reviewer?'逐项核验记录':'补录记录'}（{state.data.corrections.length}）</h2>{!state.data.corrections.length?<p className="mt-3 text-sm text-gray-700">尚无补录记录。先由个案管理师选择原始联系提出补录，再由数据审核者逐项核验。</p>:<ul className="divide-y divide-gray-200">{state.data.corrections.map(item=><CorrectionRow key={`${state.data!.seedVersion}:${item.id}:${item.version}`} item={item} state={state} reviewer={reviewer} projectId={projectId}/>)}</ul>}</section></>}</div>;
}
export function CorrectionDesk({projectId}:{projectId:string}) {
 const [role,setRole]=useState<'case_manager'|'data_reviewer'>('case_manager');
 return <div data-testid="psp-correction-desk" className="mx-auto max-w-4xl space-y-5"><h1 className="text-xl font-semibold">PSP 项目证据与补录核验</h1><p className="text-sm text-gray-700">院内合成数据演示 · 此区域使用独立项目工作身份。</p><label className="block max-w-sm text-sm">项目工作身份<select className={controlClass} value={role} onChange={e=>setRole(e.target.value as typeof role)}><option value="case_manager">个案管理师小陈</option><option value="data_reviewer">项目数据审核者</option></select></label><DeskScope key={`${projectId}:${role}`} projectId={projectId} role={role}/></div>;
}
