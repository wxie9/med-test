import {createHash} from 'node:crypto';
import type {PspReportVersion} from './reportTypes';
import type {ReportReviewEvent} from './reviewTypes';
import {DeliveryArtifactSchema,type DeliveryArtifact} from './deliveryTypes';

export const artifactTextDigest=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
export function buildDeliveryArtifact(report:PspReportVersion,event:{id:string;occurredAt:string},signatures:ReportReviewEvent[]):DeliveryArtifact{
 const {id,projectId,revision,window,templateVersion,algorithmVersion,protectionVersion,contentDigest,nextActions}=report;
 // The strict fact schema is preserved, with only its internal identifier discarded.
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const content={title:report.content.title,notice:report.content.notice,chapters:report.content.chapters.map(c=>({title:c.title,paragraphs:c.paragraphs,facts:c.facts.map(({id:_,...fact})=>fact)}))};
 const body={id,projectId,revision,window,templateVersion,algorithmVersion,protectionVersion,contentDigest,content,nextActions,signatures:signatures.map(s=>({role:s.role,occurredAt:s.occurredAt})),delivery:{deliveredAt:event.occurredAt}};
 const text=renderDeliveryText(body);return DeliveryArtifactSchema.parse({reportVersionId:id,deliveryEventId:event.id,body,text,digest:artifactTextDigest(text)});
}

/** Render only the frozen white body; feedback and current gate never enter these bytes. */
export function renderDeliveryText(body:DeliveryArtifact['body']):string{
 const at=(value:string)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value))+'（上海时间）';
 const units={people:'人',forms:'份问卷',assignments:'项任务',alerts:'项预警',interactions:'次联系',doses:'剂次',hours:'小时',days:'天',records:'条记录'};
 const statuses={suppressed:'已保护',unknown:'未知',no_applicable:'无适用样本'};
 const lines=[body.content.title,`项目：${body.projectId}；报告修订：${body.revision}`,`统计期间：${at(body.window.periodStart)} 至 ${at(body.window.periodEnd)}（结束边界不含）`,`阶段截止：${at(body.window.cutoffAt)}`,'合成数据演示；已完成数据与医学双签，正文模板标记保留。',''];
 for(const chapter of body.content.chapters){lines.push(chapter.title,...chapter.paragraphs);for(const fact of chapter.facts){let value:string;if(fact.status!=='available')value=statuses[fact.status];else if(fact.numerator!==undefined&&fact.denominator!==undefined)value=`${fact.numerator}/${fact.denominator} ${units[fact.unit]}（${((fact.value??0)*100).toFixed(1)}%）`;else value=fact.value===undefined?'未知':`${Number(fact.value.toFixed(2))} ${units[fact.unit]}`;lines.push(`${fact.label}：${value}${fact.sampleN===undefined?'':`；适用样本 n=${fact.sampleN}`}`,`口径：${fact.definition}`);}lines.push('');}
 const roles={case_manager:'个案管理师',doctor:'医生',data_reviewer:'数据审核者',project_manager:'项目经理'},categories={overdue_followup:'逾期随访',questionnaire_followup:'问卷跟进',contact_followup:'联系跟进',medical_review:'医学复核',education_followup:'教育跟进',data_quality:'数据质量',project_coordination:'项目协调'};
 if(body.nextActions.length){lines.push('下一期服务安排明细');for(const action of body.nextActions)lines.push(`${categories[action.category]}；负责角色：${roles[action.responsibleRole]}；期限：${at(action.dueAt)}；${action.status==='planned'?'计划中':'进行中'}`);lines.push('');}
 for(const signature of body.signatures)lines.push(`${signature.role==='data_reviewer'?'数据审核':'医学审核'}：通过；${at(signature.occurredAt)}`);
 lines.push(`交付时间：${at(body.delivery.deliveredAt)}`,`正文摘要：${body.contentDigest}`,`模板：${body.templateVersion}；指标算法：${body.algorithmVersion}；保护策略：${body.protectionVersion}`,'客户验收与意见单独记录，不改变本交付文件。');return lines.join('\n')+'\n';
}
