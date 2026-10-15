import { z } from 'zod';
import { now,newId } from '@/lib/state/clock';
import type { CommandMeta } from './types';
import { ProInputFields,validateProItems } from '@/lib/pro/validation';
import { submitProToStore } from '@/lib/pro/submit';
import { membershipAt,permissionAt } from './permissions';
import { transactAssignment } from './transaction';
import { PspError } from './errors';
export type ProjectProResult = {data:{proId:string;alertIds:string[];feedback:string;offHours:boolean;emergency:boolean;assignmentId:string;firstValidSubmittedAt:string;latestValidResponseId:string;dueAt:string;onTime:boolean};objectVersion:number;ledgerRevision:number;seedVersion:number};
export const ProjectProInput=z.object({...ProInputFields,assignmentId:z.string().min(1),revisionOf:z.string().min(1).optional()}).strict().superRefine(validateProItems);
export type ProjectProInput=z.infer<typeof ProjectProInput>;
export function submitProjectPro(rawInput:ProjectProInput,meta:CommandMeta):ProjectProResult {
  const input=ProjectProInput.parse(rawInput);
  if(input.scaleId!=='endocrine_monthly_v1')throw new PspError(400,'invalid_scale','项目计划须使用月度问卷');
  return transactAssignment(input.assignmentId,input.patientId,{command:'project_pro',...input},meta,(s,a)=>{
    const at=now(),project=s.psp.project;
    if(membershipAt(s.psp,a.enrollmentId,at)!=='active'||!permissionAt(s.psp,a.enrollmentId,'service',at))throw new PspError(403,'consent_required','提交前须有有效项目成员状态和服务授权');
    if(a.status!=='open'&&a.status!=='completed')throw new PspError(409,'invalid_assignment','计划当前不可填写');
    if(Date.parse(at)<Date.parse(project.startsAt)||Date.parse(at)>Date.parse(project.endsAt)||Date.parse(at)<Date.parse(a.assignedAt))throw new PspError(409,'outside_project','当前不在计划和项目服务期内');
    if(a.status==='completed'&&!input.revisionOf){
      // Receipt stores feedback at submission time so future clock changes cannot alter it.
      const receipt=s.psp.commandReceipts.find(r=>{
        const result=r.result as ProjectProResult|undefined;
        return result?.data?.assignmentId===a.id && result.data.proId===a.latestValidResponseId;
      });
      if(!receipt)throw new PspError(409,'invalid_response','已完成计划的问卷回执不存在');
      return {data:structuredClone((receipt.result as ProjectProResult).data),changed:false};
    }
    if(input.revisionOf && (a.status!=='completed'||input.revisionOf!==a.latestValidResponseId))throw new PspError(409,'invalid_revision','修订须引用本计划最新有效问卷');
    const clinical=submitProToStore(input,{store:s,at,idFactory:newId,contactTargets:project.contactTargets});
    const sequence=++s.psp.ledgerRevision;
    (s.psp.questionnaireEvidence??=[]).push({id:newId('psp-questionnaire-evidence'),projectId:project.id,enrollmentId:a.enrollmentId,assignmentId:a.id,responseId:clinical.proId,scaleId:'endocrine_monthly_v1',occurredAt:at,recordedAt:at,actorId:meta.actorId,sequence,...(input.revisionOf?{revisionOf:input.revisionOf}:{}),stopIntent:input.flags.stopIntent??null,alerts:clinical.alerts.map(alert=>({id:alert.id,kind:alert.kind,level:alert.level,triggeredAt:alert.timestamps.triggered}))});
    a.status='completed';a.firstValidSubmittedAt??=at;a.latestValidResponseId=clinical.proId;
    return {data:{proId:clinical.proId,alertIds:clinical.alerts.map(alert=>alert.id),feedback:clinical.feedback,offHours:clinical.offHours,emergency:clinical.emergency,assignmentId:a.id,firstValidSubmittedAt:a.firstValidSubmittedAt,latestValidResponseId:a.latestValidResponseId,dueAt:a.dueAt,onTime:Date.parse(a.firstValidSubmittedAt)<=Date.parse(a.dueAt)},changed:true};
  });
}
