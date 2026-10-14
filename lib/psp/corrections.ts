import {z} from 'zod';
import {getStore} from '@/lib/state/store';
import {now,newId} from '@/lib/state/clock';
import {ContactSourceRef,ContactCorrectedValue} from './evidenceTypes';
import type {CommandMeta,PspCorrection,PspState} from './types';
import {runServiceCommand} from './transaction';
import {requireService,serviceTime} from './serviceRules';
import {correctionOrigin} from './evidenceValidation';
import {PspError} from './errors';
export const CorrectionInput=z.object({sourceRef:ContactSourceRef,correctedValue:ContactCorrectedValue,reason:z.string().trim().min(1).max(1000),occurredAt:serviceTime}).strict();
export type CorrectionInput=z.input<typeof CorrectionInput>;
export function proposeCorrection(raw:CorrectionInput,meta:CommandMeta){
 const input=CorrectionInput.parse(raw),source=getStore().psp.serviceEvents.find(e=>e.id===input.sourceRef.id);
 if(!source)throw new PspError(404,'not_found','原始联系来源不存在');
 return runServiceCommand({kind:'enrollment',id:source.enrollmentId},meta,{command:'propose_correction',...input},['case_manager'],s=>{
  const at=now();requireService(s,source.enrollmentId,at);requireService(s,source.enrollmentId,input.occurredAt);
  if(Date.parse(input.occurredAt)>Date.parse(at))throw new PspError(400,'invalid_time','发生时间不能晚于真实入账时间');
  if(s.psp.corrections?.some(c=>c.sourceRef.id===source.id))throw new PspError(409,'correction_exists','本来源已有补录请求');
  const original=s.psp.serviceEvents.find(e=>e.id===source.id)!;
  const correction:PspCorrection={id:newId('psp-correction'),projectId:original.projectId,enrollmentId:original.enrollmentId,sourceRef:input.sourceRef,interactionId:original.interactionId,...(original.assignmentId?{assignmentId:original.assignmentId}:{}),alertIds:[...original.alertIds],sourceValue:{channel:original.channel??null,outcome:original.outcome,occurredAt:original.occurredAt},correctedValue:input.correctedValue,reason:input.reason,occurredAt:input.occurredAt,recordedAt:at,proposedBy:meta.actorId,sequence:++s.psp.ledgerRevision,version:1,status:'proposed',verifiedAt:null,verifiedBy:null,verificationSequence:null};
  try{correctionOrigin(s,correction);}catch{throw new PspError(400,'invalid_source','原来源、服务计划或预警时间不适用于本补录');}
  (s.psp.corrections??=[]).push(correction);return {data:correction,changed:true};
 });
}
export function verifyCorrection(correctionId:string,meta:CommandMeta){
 z.string().min(1).parse(correctionId);
 return runServiceCommand({kind:'correction',id:correctionId},meta,{command:'verify_correction',correctionId},['data_reviewer'],s=>{
  const c=s.psp.corrections!.find(c=>c.id===correctionId)!;
  const at=now();if(Date.parse(at)<Date.parse(c.recordedAt))throw new PspError(400,'invalid_time','核验时间不能早于真实补录入账时间');requireService(s,c.enrollmentId,at);requireService(s,c.enrollmentId,c.occurredAt);correctionOrigin(s,c);
  if(c.status==='verified')return {data:c,changed:false};
  c.status='verified';c.version++;c.verifiedAt=at;c.verifiedBy=meta.actorId;c.verificationSequence=++s.psp.ledgerRevision;return {data:c,changed:true};
 });
}
export function selectVerifiedContactCorrectionsAsOf(state:PspState,{cutoffAt,ledgerRevision}:{cutoffAt:string;ledgerRevision:number}):PspCorrection[]{
 return structuredClone((state.corrections??[]).filter(c=>c.status==='verified'&&c.verifiedAt!==null&&c.verificationSequence!==null&&Date.parse(c.recordedAt)<=Date.parse(cutoffAt)&&Date.parse(c.verifiedAt)<=Date.parse(cutoffAt)&&c.sequence<=ledgerRevision&&c.verificationSequence<=ledgerRevision));
}
