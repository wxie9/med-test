"use client";
import Link from 'next/link';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {usePspState} from '@/lib/client/usePspState';
import type {NextAction,PspReportDetail,PspReportList,PspReportVersion} from '@/lib/psp/reportTypes';
import {REPORT_ACTION_CATEGORIES,REPORT_ACTION_STATUSES} from '@/lib/psp/reportTypes';
import {REPORT_ACTION_LABELS,REPORT_ROLE_LABELS,REPORT_STATUS_LABELS} from '@/lib/psp/reportTemplate';
import type {PspSnapshotList} from '@/lib/psp/snapshotTypes';
import {buttonClass,Feedback,formatPspTime,ProjectDetails} from './Common';
import {MetricEvidence} from './MetricEvidence';
import {ReportPreview} from './ReportPreview';
import {ReportReviewPanel,type ReportReviewState} from './ReportReviewPanel';

const controlClass='mt-1 block w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm';
type Staff='project_manager'|'data_reviewer'|'medical_reviewer';
const identities={project_manager:{actorId:'project-manager-psp',label:'项目经理'},data_reviewer:{actorId:'data-reviewer-psp',label:'数据审核者'},medical_reviewer:{actorId:'medical-reviewer-psp',label:'医学审核者'}};
const localTime=(value:string)=>new Date(Date.parse(value)+8*3600000).toISOString().slice(0,-1);
const instant=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(value)?Date.parse(`${value}+08:00`):NaN;
const allowedRoles=(category:NextAction['category']):NextAction['responsibleRole'][]=>category==='medical_review'?['doctor']:category==='data_quality'?['data_reviewer','project_manager']:category==='project_coordination'?['project_manager']:['case_manager'];
type ActionRow=NextAction&{rowId:string};
type Draft={snapshotId:string;parentVersionId:string;actions:ActionRow[]};
type ListState=ReturnType<typeof usePspState<PspReportList>>;

function DraftForm({state,snapshots,role,draft,setDraft,ack,setAck,externalLocked=false}:{state:ListState;snapshots:PspSnapshotList;role:Staff;draft:Draft;setDraft:(draft:Draft)=>void;ack:number|null;setAck:(value:number|null)=>void;externalLocked?:boolean}){
 const data=state.data!;
 const review=!!state.conflict&&ack!==state.conflict.id,locked=state.busy||state.canRetry||review||externalLocked;
 const source=snapshots.summaries.find(item=>item.id===draft.snapshotId);
 const valid=!!source&&draft.actions.every(action=>{const at=instant(action.dueAt);return Number.isFinite(at)&&at>Date.parse(source.window.cutoffAt)&&at<=Date.parse(data.project.endsAt)&&allowedRoles(action.category).includes(action.responsibleRole);});
 const update=(rowId:string,patch:Partial<ActionRow>)=>setDraft({...draft,actions:draft.actions.map(action=>action.rowId===rowId?{...action,...patch}:action)});
 if(role!=='project_manager')return <p className="text-sm text-gray-700">{identities[role].label} · 草稿安排只读</p>;
 return <section className="space-y-3 border-t border-gray-200 pt-4"><h2 className="font-semibold">固定报告草稿与下一期安排</h2><p className="max-w-prose text-sm text-gray-700">先选择冻结快照。已有同期间草稿时，选择最新父版本形成修订；旧正文保留。安排只填写类别、负责角色、上海时间和状态。</p>
  <form className="space-y-4" onSubmit={event=>{event.preventDefault();if(locked||!valid)return;setAck(null);const body={snapshotId:draft.snapshotId,...(draft.parentVersionId?{parentVersionId:draft.parentVersionId}:{}),nextActions:draft.actions.map(({category,responsibleRole,dueAt,status})=>({category,responsibleRole,dueAt:new Date(instant(dueAt)).toISOString(),status}))};state.command(`/api/psp/projects/${encodeURIComponent(data.project.id)}/reports`,body,{role,actorId:identities[role].actorId},data.ledgerRevision);}}>
   <fieldset disabled={locked} className="space-y-4">
    <div className="grid min-w-0 gap-3 md:grid-cols-2"><label className="min-w-0 text-sm">用于报告的冻结快照<select className={controlClass} value={draft.snapshotId} required onChange={event=>setDraft({...draft,snapshotId:event.target.value})}><option value="">请选择快照</option>{snapshots.summaries.map(item=><option key={item.id} value={item.id}>{item.id} · 截至 {formatPspTime(item.window.cutoffAt)}</option>)}</select></label><label className="min-w-0 text-sm">父版本（留空为初稿）<select className={controlClass} value={draft.parentVersionId} onChange={event=>setDraft({...draft,parentVersionId:event.target.value})}><option value="">创建本期间初稿</option>{data.summaries.map(item=><option key={item.id} value={item.id}>修订 {item.revision} · {item.id}</option>)}</select></label></div>
    {!snapshots.summaries.length&&<p className="text-sm text-gray-700">尚无冻结快照，请先在服务快照工作台冻结阶段服务数据。</p>}
    {!draft.actions.length&&<p className="text-sm text-amber-900">下一期服务安排尚未补充，待人工审核。可以先保存草稿，安排不会被自动推断。</p>}
    {draft.actions.map((action,index)=><fieldset key={action.rowId} className="space-y-3 border border-gray-200 p-3"><legend className="px-1 text-sm font-medium">安排 {index+1}</legend><div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="min-w-0 text-sm">安排{index+1}：类别<select className={controlClass} value={action.category} onChange={event=>{const category=event.target.value as NextAction['category'];update(action.rowId,{category,responsibleRole:allowedRoles(category)[0]});}}>{REPORT_ACTION_CATEGORIES.map(category=><option key={category} value={category}>{REPORT_ACTION_LABELS[category]}</option>)}</select></label><label className="min-w-0 text-sm">安排{index+1}：负责角色<select className={controlClass} value={action.responsibleRole} onChange={event=>update(action.rowId,{responsibleRole:event.target.value as NextAction['responsibleRole']})}>{allowedRoles(action.category).map(value=><option key={value} value={value}>{REPORT_ROLE_LABELS[value]}</option>)}</select></label><label className="min-w-0 text-sm">安排{index+1}：上海时间<input className={controlClass} type="datetime-local" step="0.001" required max={localTime(data.project.endsAt)} value={action.dueAt} onChange={event=>update(action.rowId,{dueAt:event.target.value})}/></label><label className="min-w-0 text-sm">安排{index+1}：状态<select className={controlClass} value={action.status} onChange={event=>update(action.rowId,{status:event.target.value as NextAction['status']})}>{REPORT_ACTION_STATUSES.map(value=><option key={value} value={value}>{REPORT_STATUS_LABELS[value]}</option>)}</select></label></div><button className={buttonClass} type="button" onClick={()=>setDraft({...draft,actions:draft.actions.filter(item=>item.rowId!==action.rowId)})}>移除安排{index+1}</button></fieldset>)}
    <div className="flex flex-wrap gap-2"><button className={buttonClass} type="button" disabled={draft.actions.length>=12} onClick={()=>setDraft({...draft,actions:[...draft.actions,{rowId:crypto.randomUUID(),category:'overdue_followup',responsibleRole:'case_manager',dueAt:'',status:'planned'}]})}>添加下一期安排</button><button className={buttonClass} type="submit" disabled={!valid}>生成模板草稿</button></div>
    {!valid&&draft.snapshotId&&<p className="text-sm text-amber-900">请核对安排时间：应在快照截止之后，且位于项目服务期内。</p>}
   </fieldset>
   {state.notice?.includes('403')&&<p className="text-sm text-amber-900">当前身份或该快照的汇总来源不可用于新草稿。请刷新核对授权，选择来源可用的新快照。</p>}
  </form>{review&&<button className={buttonClass} disabled={!state.conflict?.refreshed} onClick={()=>{if(state.conflict?.refreshed)setAck(state.conflict.id);}}>已核对最新报告与项目账，继续</button>}
 </section>;
}

function ReportDetail({projectId,reportId,seedVersion,role,onRevise,writeLocked,review,onRefresh}:{projectId:string;reportId:string;seedVersion:number;role:Staff;onRevise:(report:PspReportVersion)=>void;writeLocked:boolean;review:ReviewScope;onRefresh:()=>void}){
 const [metricKey,setMetric]=useState('');const actorId=identities[role].actorId;
 const state=review.state,data=state.data;
 if(!data)return <section className="space-y-3 border-t border-gray-200 pt-4"><p role={state.notice?'alert':'status'}>{state.notice?'报告暂时无法加载，请核对版本后重试。':'正在读取固定报告…'}</p><button className={buttonClass} onClick={()=>void state.refresh()}>刷新当前报告</button></section>;
 if(data.seedVersion!==seedVersion||data.report.id!==reportId||data.report.projectId!==projectId)return <p role="alert">报告归属已变化，请刷新列表后重新选择。</p>;
 const report=data.report,facts=report.content.chapters.flatMap(chapter=>chapter.facts);
 return <section data-testid="psp-report-detail" className="min-w-0 space-y-4 border-t border-gray-300 pt-5"><div className="space-y-2 text-sm text-gray-700"><h2 className="font-semibold">固定报告版本 · 修订 {report.revision}</h2><p className="break-all">报告：{report.id}</p><p className="break-all">冻结快照：{report.snapshotId}</p><p>数据截至：{formatPspTime(report.window.cutoffAt)} · 阶段数据</p><p className="break-all">正文摘要：{report.contentDigest}</p><p>模板：{report.templateVersion}</p>{report.parentVersionId&&<p className="break-all">父版本：{report.parentVersionId}</p>}</div>
   {data.warnings.map(warning=><p key={warning} className="text-sm text-amber-900">{warning}</p>)}
   {role==='project_manager'&&<button className={buttonClass} disabled={!data.createGate.canCreate||writeLocked||review.locked} onClick={()=>onRevise(report)}>以此版本创建修订</button>}
   {data.createGate.reason&&<p className="text-sm text-amber-900">{data.createGate.reason}</p>}
   <ReportReviewPanel state={state} role={role} actorId={actorId} locked={writeLocked||review.locked} needsAcknowledgement={review.needsAcknowledgement} onAcknowledge={review.acknowledge} onBegin={review.begin} onRefresh={onRefresh}/>
   <ReportPreview content={report.content} workflow={data.workflow}/>
   <section className="space-y-3 border-t border-gray-200 pt-4"><h3 className="font-semibold">内部来源核对</h3><p className="max-w-prose text-sm text-gray-700">以下按固定快照读取审核来源，可能包含精确值；不属于受保护报告正文。</p><label className="block max-w-xl text-sm">选择报告指标的内部来源<select className={controlClass} value={metricKey} onChange={event=>setMetric(event.target.value)}><option value="">请选择指标</option>{facts.map(fact=><option key={fact.id} value={fact.metricKey}>{fact.label}</option>)}</select></label>{metricKey&&<MetricEvidence key={`${report.snapshotId}:${metricKey}:${seedVersion}:${role}`} snapshotId={report.snapshotId} metricKey={metricKey} scope="aggregate" role={role} actorId={actorId} seedVersion={seedVersion}/>}</section>
  </section>;
}
type ReviewScope={state:ReportReviewState;locked:boolean;needsAcknowledgement:boolean;acknowledge:()=>void;begin:()=>void};
function ReportDetailScope({url,onUpdated,children}:{url:string;onUpdated:()=>void;children:(review:ReviewScope)=>ReactNode}){
 const state=usePspState<PspReportDetail>(url,10000),[ack,setAck]=useState<number|null>(null),last=useRef<number|null>(null);
 const version=state.data?.report.version;
 useEffect(()=>{if(version!==undefined){if(last.current!==null&&last.current!==version)onUpdated();last.current=version;}},[version,onUpdated]);
 const needsAcknowledgement=!!state.conflict&&ack!==state.conflict.id;
 return children({state,locked:state.busy||state.canRetry||needsAcknowledgement,needsAcknowledgement,acknowledge:()=>{if(state.conflict?.refreshed)setAck(state.conflict.id);},begin:()=>setAck(null)});
}
function LoadedDesk({state,snapshots,role,initialSnapshotId,initialReportId}:{state:ListState;snapshots:PspSnapshotList;role:Staff;initialSnapshotId?:string;initialReportId?:string}){
 const data=state.data!;const [ack,setAck]=useState<number|null>(null);const [selected,setSelected]=useState(initialReportId&&data.summaries.some(item=>item.id===initialReportId)?initialReportId:'');
 const [draft,setDraft]=useState<Draft>({snapshotId:initialSnapshotId&&snapshots.summaries.some(item=>item.id===initialSnapshotId)?initialSnapshotId:'',parentVersionId:'',actions:[]});
 const onRevise=(report:PspReportVersion)=>setDraft({snapshotId:report.snapshotId,parentVersionId:report.id,actions:report.nextActions.map(action=>({...action,dueAt:localTime(action.dueAt),rowId:crypto.randomUUID()}))});
 const projectLocked=state.busy||state.canRetry||!!state.conflict&&ack!==state.conflict.id;
 const workspace=(review?:ReviewScope)=><div className="min-w-0 space-y-5"><h2 className="font-semibold">{data.project.title}</h2><ProjectDetails project={data.project}/><p className="text-sm text-gray-700">当前项目账版本：{data.ledgerRevision}</p><DraftForm state={state} snapshots={snapshots} role={role} draft={draft} setDraft={setDraft} ack={ack} setAck={setAck} externalLocked={review?.locked}/><section className="space-y-3 border-t border-gray-200 pt-4"><h2 className="font-semibold">已保存报告（{data.summaries.length}）</h2>{!data.summaries.length&&<p className="text-sm text-gray-700">尚无保存的报告。选择冻结快照后可生成第一版。</p>}<label className="block max-w-xl text-sm">选择报告版本<select className={controlClass} disabled={projectLocked||review?.locked} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">请选择版本</option>{data.summaries.map(item=><option key={item.id} value={item.id}>修订 {item.revision} · {item.id}</option>)}</select></label>{initialReportId&&!data.summaries.some(item=>item.id===initialReportId)&&<p className="text-sm text-gray-700">链接中的报告不在当前列表，请重新选择版本。</p>}</section>{review&&<ReportDetail key={`${data.seedVersion}:${selected}:${role}`} projectId={data.project.id} reportId={selected} seedVersion={data.seedVersion} role={role} onRevise={onRevise} writeLocked={projectLocked} review={review} onRefresh={()=>{void review.state.refresh();void state.refresh();}}/>}</div>;
 const query=new URLSearchParams({role,actorId:identities[role].actorId,seedVersion:String(data.seedVersion)});
 return selected&&data.summaries.some(item=>item.id===selected)?<ReportDetailScope key={`${data.seedVersion}:${selected}:${role}`} url={`/api/psp/reports/${encodeURIComponent(selected)}?${query}`} onUpdated={state.refresh}>{workspace}</ReportDetailScope>:workspace();
}
function DeskScope({projectId,role,initialSnapshotId,initialReportId}:{projectId:string;role:Staff;initialSnapshotId?:string;initialReportId?:string}){
 const query=new URLSearchParams({role,actorId:identities[role].actorId}),reports=usePspState<PspReportList>(`/api/psp/projects/${encodeURIComponent(projectId)}/reports?${query}`),snapshots=usePspState<PspSnapshotList>(`/api/psp/projects/${encodeURIComponent(projectId)}/snapshots?${query}`);
 const ready=reports.data&&snapshots.data&&reports.data.seedVersion===snapshots.data.seedVersion;
 return <div className="min-w-0 space-y-4"><button className={buttonClass} onClick={()=>{void reports.refresh();void snapshots.refresh();}}>刷新报告状态</button><Feedback {...reports}/>{ready?<LoadedDesk key={`${reports.data!.seedVersion}`} state={reports} snapshots={snapshots.data!} role={role} initialSnapshotId={initialSnapshotId} initialReportId={initialReportId}/>:<p role={reports.notice||snapshots.notice?'alert':'status'}>{reports.notice||snapshots.notice?'报告或快照列表暂时无法加载，请刷新。':'正在读取同一演示版本的报告与快照…'}</p>}</div>;
}
export function ReportDraftDesk({projectId,initialSnapshotId,initialReportId}:{projectId:string;initialSnapshotId?:string;initialReportId?:string}){
 const [role,setRole]=useState<Staff>('project_manager');
 return <div data-testid="psp-report-draft-desk" className="mx-auto min-w-0 max-w-5xl space-y-5"><h1 className="text-xl font-semibold">PSP 固定报告草稿</h1><p className="max-w-prose text-sm text-gray-700">院内合成数据演示 · 确定性模板，无需在线模型。报告提交、双审核和交付在此核对，药企可查看已交付的受保护汇总。</p><Link className={`${buttonClass} inline-block`} href={`/governance/projects/${encodeURIComponent(projectId)}/snapshots`}>返回服务快照与来源</Link><label className="block max-w-sm text-sm">报告工作身份<select className={controlClass} value={role} onChange={event=>setRole(event.target.value as Staff)}>{Object.entries(identities).map(([value,identity])=><option key={value} value={value}>{identity.label}</option>)}</select></label><DeskScope key={`${projectId}:${role}`} projectId={projectId} role={role} initialSnapshotId={initialSnapshotId} initialReportId={initialReportId}/></div>;
}
