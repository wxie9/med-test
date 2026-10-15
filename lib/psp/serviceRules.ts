import { z } from 'zod';
import type { DemoStore } from '@/lib/state/store';
import { membershipAt, permissionAt } from './permissions';
import { PspError } from './errors';
/** Offset timestamps are normalized before receipt hashing. Invalid instants never reach toISOString. */
export const serviceTime=z.string().datetime({offset:true}).transform((value,ctx)=>{const time=Date.parse(value);if(!Number.isFinite(time)){ctx.addIssue({code:z.ZodIssueCode.custom,message:'时间格式无效'});return z.NEVER;}return new Date(time).toISOString();});
export function serviceAllowed(s:DemoStore,enrollmentId:string,at:string):boolean {
 return membershipAt(s.psp,enrollmentId,at)==='active'&&permissionAt(s.psp,enrollmentId,'service',at)&&Date.parse(at)>=Date.parse(s.psp.project.startsAt)&&Date.parse(at)<=Date.parse(s.psp.project.endsAt);
}
export function requireService(s:DemoStore,enrollmentId:string,at:string):void {
 if(membershipAt(s.psp,enrollmentId,at)!=='active'||!permissionAt(s.psp,enrollmentId,'service',at))throw new PspError(403,'consent_required','当前须有有效项目成员状态和服务授权');
 if(Date.parse(at)<Date.parse(s.psp.project.startsAt)||Date.parse(at)>Date.parse(s.psp.project.endsAt))throw new PspError(409,'outside_project','当前不在项目服务期内');
}
export function addContactPlan(s:DemoStore,enrollmentId:string,id:string,title:string,at:string,dueAt:string) {
 if(Date.parse(dueAt)<=Date.parse(at)||Date.parse(dueAt)>Date.parse(s.psp.project.endsAt))throw new PspError(409,'invalid_followup','跟进时间须为项目期内未来时间');
 if(s.psp.assignments.some(a=>a.id===id))throw new PspError(409,'invalid_followup','跟进计划已存在');
 s.psp.assignments.push({id,projectId:s.psp.project.id,enrollmentId,kind:'contact',title,assignedAt:at,assignedRecordedAt:at,assignedSequence:++s.psp.ledgerRevision,dueAt,ownerRole:'case_manager',status:'open',version:1,firstValidSubmittedAt:null,latestValidResponseId:null,source:'psp-v1'});
 return id;
}
