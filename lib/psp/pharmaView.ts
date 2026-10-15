import {reportAuthorizationGate} from './reportGates';
import { getStore, type AgentMode } from '@/lib/state/store';
import { now } from '@/lib/state/clock';
import { permissionAt, membershipAt } from './permissions';
import { projectSummary, type ProjectSummary } from './views';
import { PspError } from './errors';
export type AllowedMembers={status:'available';value:number}|{status:'suppressed'|'no_applicable';reason:string};
export type PharmaProjectsView={projects:{project:ProjectSummary;allowedMembers:AllowedMembers}[];seedVersion:number;agentMode:AgentMode;serverNow:string;authorizationVersion:number};
export type PharmaProjectView={project:ProjectSummary;allowedMembers:AllowedMembers;metrics:[];reports:PharmaReportView[];seedVersion:number;agentMode:AgentMode;serverNow:string;authorizationVersion:number};
function allowedMembers(at:string):AllowedMembers {
  const s=getStore().psp;
  const value=s.enrollments.filter(e=>membershipAt(s,e.id,at)==='active'&&permissionAt(s,e.id,'service',at)&&permissionAt(s,e.id,'aggregate',at)).length;
  if(value===0) return {status:'no_applicable',reason:'当前暂无可汇总成员'};
  if(value<5) return {status:'suppressed',reason:'样本量未达到最低展示门槛（k=5）'};
  return {status:'available',value};
}
export function getPharmaProjectsView():PharmaProjectsView {
  const s=getStore(),serverNow=now();
  return {projects:[{project:projectSummary(s.psp.project),allowedMembers:allowedMembers(serverNow)}],seedVersion:s.seedVersion,agentMode:s.agentMode,serverNow,authorizationVersion:s.psp.authorizationVersion};
}
export function getPharmaProjectView(projectId:string):PharmaProjectView {
  const s=getStore(),serverNow=now();
  if(projectId!==s.psp.project.id) throw new PspError(404,'not_found','项目不存在');
  return {project:projectSummary(s.psp.project),allowedMembers:allowedMembers(serverNow),metrics:[],reports:(s.psp.deliveryArtifacts??[]).map(a=>readPharmaReport(projectId,a.reportVersionId)),seedVersion:s.seedVersion,agentMode:s.agentMode,serverNow,authorizationVersion:s.psp.authorizationVersion};
}

/** External report projection: lifecycle metadata never bypasses the current source gate. */
export type PharmaReportQuery={seedVersion:number;authorizationVersion:number;periodStart:string;periodEnd:string;role:'pharma_owner';actorId:'pharma-owner-a'};
export type PharmaReportBase={id:string;projectId:string;status:import('./reportTypes').PspReportVersion['status'];version:number;seedVersion:number;authorizationVersion:number;authorizationGate:import('./reportGates').ReportAuthorizationGate};
export type PharmaReportView=(PharmaReportBase&{gate:{status:'blocked'|'revoked';reason:string}})|(PharmaReportBase&{gate:{status:'available';reason:null};revision:number;window:import('./snapshotTypes').PspServiceSnapshot['window'];templateVersion:string;algorithmVersion:string;protectionVersion:string;contentDigest:string;content:import('./deliveryTypes').DeliveryArtifact['body']['content'];nextActions:import('./reportTypes').NextAction[];signatures:import('./deliveryTypes').DeliveryArtifact['body']['signatures'];delivery:{deliveredAt:string;artifactDigest:string};artifact:{text:string;digest:string};feedback?:{action:'accept'|'request_changes';occurredAt:string;comment:string}});
export type {PharmaActionReceipt} from './deliveryTypes';
export function readPharmaReport(projectId:string,versionId:string):PharmaReportView{
 const current=getStore(),report=current.psp.reportVersions?.find(r=>r.id===versionId&&r.projectId===projectId&&r.seedVersion===current.seedVersion);
 if(projectId!==current.psp.project.id||!report)throw new PspError(404,'not_found','报告版本不存在');
 const authorizationGate=reportAuthorizationGate(report,current.psp,now()),base:PharmaReportBase={id:report.id,projectId:report.projectId,status:report.status,version:report.version,seedVersion:current.seedVersion,authorizationVersion:current.psp.authorizationVersion,authorizationGate};
 if(authorizationGate.status!=='eligible')return {...base,gate:{status:authorizationGate.status,reason:'当前授权已停止此报告访问'}};
 const artifact=current.psp.deliveryArtifacts?.find(a=>a.reportVersionId===report.id);if(!artifact)return {...base,gate:{status:'blocked',reason:'报告尚未交付'}};
 const {body}=artifact,feedback=current.psp.reportActions?.find(e=>e.reportVersionId===report.id&&(e.action==='accept'||e.action==='request_changes'));
 return structuredClone({...base,gate:{status:'available',reason:null},revision:body.revision,window:body.window,templateVersion:body.templateVersion,algorithmVersion:body.algorithmVersion,protectionVersion:body.protectionVersion,contentDigest:body.contentDigest,content:body.content,nextActions:body.nextActions,signatures:body.signatures,delivery:{...body.delivery,artifactDigest:artifact.digest},artifact:{text:artifact.text,digest:artifact.digest},...(feedback&&(feedback.action==='accept'||feedback.action==='request_changes')?{feedback:{action:feedback.action,occurredAt:feedback.occurredAt,comment:feedback.comment}}:{})});
}
/** Same whitelist and gate, with no online provider or internal fact identifiers. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Discard customer free text from the future model input.
export function readPharmaFactPack(projectId:string,versionId:string){const view=readPharmaReport(projectId,versionId);if(!('feedback' in view))return view;const {feedback:_,...pack}=view;return pack;}
