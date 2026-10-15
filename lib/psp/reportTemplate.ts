import type {PspServiceSnapshot} from './snapshotTypes';
import {ReportDraftInputSchema,type NextAction,type ReportContent,type ReportFact} from './reportTypes';
import {PspError} from './errors';
const shanghaiTime=(at:string)=>`${new Date(Date.parse(at)+8*3_600_000).toISOString().slice(0,19).replace('T',' ')}（上海时间）`;
export const REPORT_TEMPLATE_VERSION='psp-report-template-v1' as const;
export const REPORT_ACTION_LABELS:Record<NextAction['category'],string>={overdue_followup:'逾期事项跟进',questionnaire_followup:'问卷跟进',contact_followup:'联系跟进',medical_review:'医学复核',education_followup:'教育反馈跟进',data_quality:'数据质量核验',project_coordination:'项目统筹'};
export const REPORT_ROLE_LABELS:Record<NextAction['responsibleRole'],string>={case_manager:'个案管理师',doctor:'医生',data_reviewer:'数据审核员',project_manager:'项目经理'};
export const REPORT_STATUS_LABELS:Record<NextAction['status'],string>={planned:'计划安排',in_progress:'安排进行中'};
const roles:Record<NextAction['category'],readonly NextAction['responsibleRole'][]>={overdue_followup:['case_manager'],questionnaire_followup:['case_manager'],contact_followup:['case_manager'],medical_review:['doctor'],education_followup:['case_manager'],data_quality:['data_reviewer','project_manager'],project_coordination:['project_manager']};
export function normalizeReportActions(snapshot:PspServiceSnapshot,raw:NextAction[]):NextAction[]{
 const {nextActions}=ReportDraftInputSchema.parse({nextActions:raw});
 return nextActions.map(action=>{
  const at=Date.parse(action.dueAt);
  if(!roles[action.category].includes(action.responsibleRole))throw new PspError(400,'invalid_input','行动类别与负责角色不匹配');
  if(at<=Date.parse(snapshot.window.cutoffAt)||at<Date.parse(snapshot.project.startsAt)||at>Date.parse(snapshot.project.endsAt))throw new PspError(400,'invalid_time','安排时间须在快照截止之后且位于项目服务期内');
  return {...action,dueAt:new Date(at).toISOString()};
 });
}
// Fixed labels, units and definitions: no producer applicability or source text is a display input.
type CatalogEntry={key:string;label:string;unit:ReportFact['unit'];chapter:number;definition:string};
const definitions={count:'按固定窗口及历史汇总资格统计；仅展示保护策略允许的汇总值。',ratio:'分子与分母同属固定口径；非零小格及互补结果依保护策略隐藏。',alert:'本期触发预警的责任观察截至阶段截止；接单不等于成功联系，复核独立统计。',quality:'按已有结构化证据识别缺失，不推定未知旧答卷数量。'};
const rows:readonly (readonly [string,string,ReportFact['unit'],number,string])[]=[
 ['period_members','期内服务成员','people',2,definitions.count],['active_members','截至日活跃服务成员','people',2,definitions.count],
 ['questionnaire_completion','到期问卷完成率','forms',3,definitions.ratio],['questionnaire_on_time','按时问卷完成率','forms',3,definitions.ratio],
 ['contact_completion','到期计划联系成功率','assignments',3,definitions.ratio],['education_completion','到期教育反馈完成率','assignments',3,definitions.ratio],['service_completion','到期服务任务完成率（联系+教育）','assignments',3,'仅含联系与教育到期计划；问卷独立统计。'],
 ['questionnaire_early_completed','未到期问卷提前完成','forms',3,definitions.count],['contact_early_completed','未到期联系提前完成','assignments',3,definitions.count],['education_early_completed','未到期教育提前完成','assignments',3,definitions.count],
 ['alert_contact_coverage','本期预警成功联系覆盖率','alerts',3,definitions.alert],['alert_contact_on_time','到期预警按时成功联系率','alerts',3,definitions.alert],['alert_pending','尚未成熟联系期限预警','alerts',3,definitions.alert],['alert_due_uncontacted','到期未成功联系预警','alerts',3,definitions.alert],
 ['alert_accept_p50','接单耗时P50','hours',3,definitions.alert],['alert_accept_p90','接单耗时P90','hours',3,definitions.alert],['alert_contact_p50','首次成功联系耗时P50','hours',3,definitions.alert],['alert_contact_p90','首次成功联系耗时P90','hours',3,definitions.alert],['alert_review_completion','本期预警医生复核完成率','alerts',3,definitions.alert],['alert_review_pending','本期预警待复核','alerts',3,definitions.alert],
 ['alert_carry_over','上期项目预警积压','alerts',3,definitions.alert],['alert_carry_over_contacted','上期预警本期成功联系','alerts',3,definitions.alert],['alert_carry_over_reviewed','上期预警本期医生复核','alerts',3,definitions.alert],
 ['interaction_attempts','联系尝试次数','interactions',3,definitions.count],['interaction_successes','成功联系次数','interactions',3,definitions.count],['interaction_no_answer','未接通次数','interactions',3,definitions.count],['interaction_refused','拒绝联系次数','interactions',3,definitions.count],['interaction_channel_unavailable','渠道不可用次数','interactions',3,definitions.count],
 ['self_report_ratio','自报服药记录剂次比例','doses',4,'仅表示自报记录剂次比例；覆盖人数、自然日及缺失应同时阅读，不能视为客观服药率。'],['self_report_people','自报日志覆盖成员','people',4,definitions.count],['self_report_days','自报日志覆盖自然日','days',4,'日期级记录仅在完整自然日资格成立时纳入。'],['stop_intent_ratio','问卷停药念头比例','forms',4,'仅描述有有效答案的项目问卷；未知旧答卷不推断。'],
 ['quality_contact_channel','联系渠道缺失率','records',5,definitions.quality],['quality_contact_outcome','联系结果缺失率','records',5,definitions.quality],['quality_contact_occurred_at','联系发生时间缺失率','records',5,definitions.quality],['quality_contact_recorded_at','联系入账时间缺失率','records',5,definitions.quality],['quality_contact_actor','联系记录人缺失率','records',5,definitions.quality],['quality_contact_source_link','联系来源关联缺失率','records',5,definitions.quality],['quality_questionnaire_stop_intent','问卷停药念头字段缺失率','records',5,definitions.quality],['quality_questionnaire_evidence','旧问卷结构化证据缺失率','records',5,definitions.quality],
];
export const REPORT_FACT_CATALOG:readonly CatalogEntry[]=rows.map(([key,label,unit,chapter,definition])=>({key,label,unit,chapter,definition}));
export function renderReportContent(snapshot:PspServiceSnapshot,rawActions:NextAction[]):ReportContent {
 if(snapshot.projectId!=='PSP-BC-ENDO-001'||snapshot.algorithmVersion!=='psp-metrics-v1'||snapshot.protectionVersion!=='psp-k5-v1')throw new Error('Unsupported report project or metric versions');
 const nextActions=normalizeReportActions(snapshot,rawActions),metrics=new Map(snapshot.protectedMetrics.map(metric=>[metric.key,metric]));
 if(metrics.size!==snapshot.protectedMetrics.length||metrics.size!==rows.length||rows.some(([key])=>!metrics.has(key)))throw new Error('Report protected fact catalog mismatch');
 const chapters:ReportContent['chapters']=['项目范围','数据说明','服务执行','患者反馈','质量与限制','下一期服务安排','审核与交付'].map((title,index)=>({id:`chapter-${index+1}`,title,paragraphs:[],facts:[]}));
 chapters[0].paragraphs=['资助方：虚构药企A；治疗类别支持，服务人群为乳腺癌内分泌治疗支持项目的合成演示成员。',`项目服务周期：${shanghaiTime(snapshot.project.startsAt)} 至 ${shanghaiTime(snapshot.project.endsAt)}。`,`阶段报告：${shanghaiTime(snapshot.window.periodStart)} 至 ${shanghaiTime(snapshot.window.cutoffAt)}，仅描述截至该时点的服务记录。`];
 chapters[1].paragraphs=[`统计期间：${shanghaiTime(snapshot.window.periodStart)} 至 ${shanghaiTime(snapshot.window.periodEnd)}（结束边界不含）；阶段截止：${shanghaiTime(snapshot.window.cutoffAt)}。`,'仅采用具有历史项目汇总授权的受保护指标；内部服务人群不直接作为报告分母。',`指标版本：${snapshot.algorithmVersion}；保护版本：${snapshot.protectionVersion}；模板版本：${REPORT_TEMPLATE_VERSION}。`];
 chapters[2].paragraphs=['到期计划、提前完成和事件次数分别统计。服务任务完成仅含联系与教育；打开教育材料不等于反馈完成。','联系目标为虚构项目配置；临床紧急提示不等待运营时限。固定演示时钟下的耗时不代表真实服务效率。'];
 chapters[3].paragraphs=['患者反馈仅为自报与项目问卷描述，不能证明临床改善。未提供的困扰描述与未知答卷不推断。'];
 chapters[4].paragraphs=['全部数据为合成演示数据；项目问卷为自拟量表。仅纳入截止时点及冻结账版本已知的记录，之后补录须生成新快照。','小样本及非零互补小格按演示保护策略处理；“已保护”表示保护隐藏，“未知”表示证据不足，“无适用样本”表示无适用项，均不等于零。','报告仅用于服务运营记录核对，不作治疗效果或因果结论。'];
 chapters[5].paragraphs=nextActions.length?nextActions.map(a=>`${REPORT_ACTION_LABELS[a.category]}；负责角色：${REPORT_ROLE_LABELS[a.responsibleRole]}；安排时间：${shanghaiTime(a.dueAt)}；状态：${REPORT_STATUS_LABELS[a.status]}。`):['下一期服务安排尚未补充，待人工审核'];
 chapters[5].paragraphs.push('安排状态仅表示计划推进，不证明临床或服务事项已完成。');
 chapters[6].paragraphs=['数据与医学签署、交付和客户验收由独立工作流元数据展示；正文与事实绑定保留于本报告版本。'];
 for(const entry of REPORT_FACT_CATALOG){const m=metrics.get(entry.key)!;if(m.unit!==entry.unit)throw new Error('Report protected fact unit mismatch');const fact:ReportFact={id:`${snapshot.id}:aggregate:${entry.key}`,metricKey:entry.key,label:entry.label,definition:entry.definition,unit:entry.unit,status:m.status};if(m.status==='available'){fact.value=m.value;fact.sampleN=m.sampleN;if(m.numerator!==undefined)fact.numerator=m.numerator;if(m.denominator!==undefined)fact.denominator=m.denominator;}chapters[entry.chapter-1].facts.push(fact);}
 return {title:'项目服务阶段报告',notice:'模板草稿，待人工审核',chapters};
}
