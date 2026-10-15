"use client";
import {usePspState} from '@/lib/client/usePspState';
import type {Metric} from '@/lib/psp/metricTypes';
import type {PspMetricEvidence,SnapshotSource} from '@/lib/psp/snapshotTypes';
import {buttonClass,formatPspTime} from './Common';

const units:Record<Metric['unit'],string>={people:'人',forms:'份',assignments:'项',alerts:'件',interactions:'次',doses:'剂',hours:'小时',days:'天',records:'条'};
export const metricUnit=(unit:Metric['unit'])=>units[unit];
export function MetricValue({metric}:{metric:Pick<Metric,'status'|'value'|'numerator'|'denominator'|'unit'>}){
 if(metric.status==='unknown')return <span>未知 · 证据不足</span>;
 if(metric.status==='no_applicable')return <span>无适用样本</span>;
 if(metric.numerator!==undefined&&metric.denominator!==undefined)return <span>{metric.numerator} / {metric.denominator}</span>;
 return <span>{metric.value===null?'未知':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(metric.value)} {units[metric.unit]}</span>;
}
const sourceKinds:Record<SnapshotSource['kind'],string>={enrollment:'项目成员',membership:'成员状态记录',permission:'独立授权记录',assignment:'固定服务计划',assignmentCancellation:'计划取消证据',contact:'原始联系记录',correction:'已核验联系补录',questionnaireEvidence:'项目问卷证据',alertBirth:'问卷实际触发预警',alertAction:'预警处理与复核',educationContent:'批准教育内容版本',educationEvent:'教育发送与反馈',educationResult:'背景教育反馈证据',selfReport:'固定服药自报副本'};
const fieldLabels:Record<string,string>={actorId:'记录执行者',approvedBy:'批准者',verifiedBy:'核验者',proposedBy:'提议者',ownerRole:'责任角色',enrollmentId:'项目成员',kind:'计划或预警类型',status:'状态',scope:'授权范围',action:'动作',dueAt:'固定截止',assignedAt:'安排时间',occurredAt:'发生时间',recordedAt:'实际入账时间',triggeredAt:'触发时间',sentAt:'发送时间',openedAt:'打开时间',feedbackAt:'反馈时间',approvedAt:'批准时间',verifiedAt:'核验时间',logDate:'记录日期',precision:'时间精度',channel:'联系渠道',outcome:'联系结果',stopIntent:'停药念头',understood:'反馈已理解',needsHelp:'仍需帮助',due:'应服剂次',taken:'自报已服剂次',reason:'记录理由',category:'处置类别',summary:'处置摘要',note:'复核意见',title:'内容标题',version:'内容版本',level:'预警级别'};
const words:Record<string,string>={'project-manager-psp':'项目经理','case-manager-chen':'个案管理师小陈','doctor-zhang':'张医生','data-reviewer-psp':'数据审核者','medical-reviewer-psp':'医学审核者',project_manager:'项目经理',data_reviewer:'数据审核者',medical_reviewer:'医学审核者',case_manager:'个案管理师',doctor:'医生',patient:'患者',active:'服务中',paused:'暂停',exited:'退出',invited:'待加入',service:'患者服务',aggregate:'项目汇总',grant:'授权',withdraw:'撤回',phone:'电话',message:'消息',reached:'已接通',no_answer:'未接通',refused:'拒绝联系',channel_unavailable:'渠道不可用',questionnaire:'问卷',contact:'联系',education:'教育',symptom:'症状',adherence:'自报依从性',high:'高',medium:'中',instant:'精确时刻',date_only:'日期级',approved:'已批准',send:'发送',open:'打开',feedback:'反馈',close:'医生复核关闭',accept:'接单',start:'开始处置',submit_review:'提交复核',contacted:'已联系',support:'服务支持'};
function fieldValue(key:string,value:unknown):string{
 if(value===null)return '未提供';if(typeof value==='boolean')return value?'是':'否';
 if(typeof value==='string'){if(key.endsWith('At')&&Number.isFinite(Date.parse(value)))return formatPspTime(value);return words[value]??value;}
 return String(value);
}
function SourceFields({value}:{value:Record<string,unknown>}){
 const entries=Object.entries(value).filter(([key,item])=>key in fieldLabels&&(item===null||['string','number','boolean'].includes(typeof item)));
 return <dl className="grid gap-x-5 gap-y-1 sm:grid-cols-2">{entries.map(([key,item])=><div key={key}><dt className="inline text-gray-700">{fieldLabels[key]}：</dt><dd className="inline">{fieldValue(key,item)}</dd></div>)}</dl>;
}
function FrozenDisposition({value}:{value:unknown}){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const disposition=value as Record<string,unknown>;const ids=Array.isArray(disposition.interactionIds)?disposition.interactionIds.filter((id):id is string=>typeof id==='string'):[];
 return <div className="space-y-1 bg-gray-50 p-2"><p className="font-medium">提交时的处置记录</p><SourceFields value={disposition}/>{ids.length>0&&<div><p>引用联系：</p><ul>{ids.map(id=><li key={id} className="break-all">{id}</li>)}</ul></div>}</div>;
}
function SourceRow({source}:{source:SnapshotSource}){
 return <li className="space-y-2 border-b border-gray-200 py-3 text-sm break-words"><h4 className="font-medium">{sourceKinds[source.kind]}</h4><SourceFields value={source.value}/>{source.kind==='alertAction'&&<FrozenDisposition value={source.value.disposition}/>}{source.kind==='correction'&&(['sourceValue','correctedValue'] as const).map(key=>{const value=source.value[key];return value&&typeof value==='object'&&!Array.isArray(value)?<div key={key} className="space-y-1 bg-gray-50 p-2"><p className="font-medium">{key==='sourceValue'?'原始联系值':'核验采用值'}</p><SourceFields value={value as Record<string,unknown>}/></div>:null;})}<details><summary className="cursor-pointer text-pink-700">核对来源标识</summary><p className="mt-2 break-all text-gray-700">{source.locator}</p><p className="break-all text-gray-700">引用：{source.ref}</p></details></li>;
}
export function MetricEvidence({snapshotId,metricKey,scope,role,actorId,seedVersion}:{snapshotId:string;metricKey:string;scope:'internal'|'aggregate';role:string;actorId:string;seedVersion:number}){
 const query=new URLSearchParams({role,actorId,seedVersion:String(seedVersion),scope});
 const state=usePspState<PspMetricEvidence>(`/api/psp/snapshots/${encodeURIComponent(snapshotId)}/metrics/${encodeURIComponent(metricKey)}/sources?${query}`,60000);
 const data=state.data;
 if(!data)return <section aria-label="冻结指标来源" className="space-y-3 border-t border-gray-200 pt-4"><p role={state.notice?'alert':'status'}>{state.notice?'冻结来源暂时无法加载，请重试。':'正在读取冻结来源…'}</p><button className={buttonClass} onClick={()=>void state.refresh()}>刷新冻结来源</button></section>;
 if(data.seedVersion!==seedVersion||data.snapshotId!==snapshotId||data.scope!==scope||data.metric.key!==metricKey)return <p role="alert">来源范围不匹配，请重新选择冻结版本。</p>;
 const direct=new Set(data.sourceRefs),supporting=new Set(data.supportingRefs);
 const sourceList=data.sources.filter(source=>direct.has(source.ref)),supportList=data.sources.filter(source=>supporting.has(source.ref)&&!direct.has(source.ref));
 return <section aria-label="冻结指标来源" data-testid="psp-metric-evidence" className="space-y-4 border-t border-gray-300 pt-5"><h3 className="font-semibold">{data.metric.label} · 口径与冻结来源</h3><p className="text-sm">冻结结果：<MetricValue metric={data.metric}/></p><p className="text-sm text-gray-700">{data.metric.applicability}</p><p className="text-sm text-gray-700">以下为该版本保存的来源值；后续现场修改不会替换这些值。</p><div><h4 className="font-medium">指标直接来源</h4>{sourceList.length?<ul>{sourceList.map(source=><SourceRow key={source.ref} source={source}/>)}</ul>:<p className="mt-2 text-sm text-gray-700">该指标没有可列示的直接事实；请结合适用说明和资格证据核对，缺证不等于未完成。</p>}</div>{supportList.length>0&&<details><summary className="cursor-pointer font-medium">资格与内容支持来源</summary><ul>{supportList.map(source=><SourceRow key={source.ref} source={source}/>)}</ul></details>}</section>;
}
