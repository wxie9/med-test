import { getStore, type AgentMode } from '@/lib/state/store';
import { now } from '@/lib/state/clock';
import { permissionAt, membershipAt } from './permissions';
import { projectSummary, type ProjectSummary } from './views';
import { PspError } from './errors';
export type AllowedMembers={status:'available';value:number}|{status:'suppressed'|'no_applicable';reason:string};
export type PharmaProjectsView={projects:{project:ProjectSummary;allowedMembers:AllowedMembers}[];seedVersion:number;agentMode:AgentMode;serverNow:string;authorizationVersion:number};
export type PharmaProjectView={project:ProjectSummary;allowedMembers:AllowedMembers;metrics:[];reports:[];seedVersion:number;agentMode:AgentMode;serverNow:string;authorizationVersion:number};
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
  return {project:projectSummary(s.psp.project),allowedMembers:allowedMembers(serverNow),metrics:[],reports:[],seedVersion:s.seedVersion,agentMode:s.agentMode,serverNow,authorizationVersion:s.psp.authorizationVersion};
}
