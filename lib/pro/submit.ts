import { getStore, type DemoStore } from '@/lib/state/store';
import { now, newId, isOffHours } from '@/lib/state/clock';
import { evaluatePro } from '@/lib/alerts/rules';
import { transition } from '@/lib/alerts/machine';
import type { Alert, ProResponse } from '@/lib/domain/types';
export type ClinicalProInput={patientId:string;scaleId:ProResponse['scaleId'];items:Record<string,number>;flags:ProResponse['flags'];revisionOf?:string};
export type ClinicalProContext={store:DemoStore;at:string;idFactory:(prefix:string)=>string;contactTargets?:{high:number;medium:number}};
/** The caller owns commit: all clinical writes stay inside the supplied draft. */
export function submitProToStore(input:ClinicalProInput, context:ClinicalProContext) {
  const {store:s,at,idFactory}=context,p=s.patients.get(input.patientId);if(!p)throw new Error('patient not found');
  const pro:ProResponse={id:idFactory('pro'),scaleId:input.scaleId,submittedAt:at,items:input.items,flags:input.flags,...(input.revisionOf?{revisionOf:input.revisionOf}:{})};
  p.pro.push(pro);
  const alerts:Alert[]=evaluatePro(p,pro).map(a=>transition({...a,id:idFactory('alert'),status:'triggered',assignee:null,timestamps:{triggered:at},notes:[]},'assign','system',at));
  s.alerts.push(...alerts);
  const offHours=isOffHours(at),emergency=offHours&&alerts.some(a=>a.level==='high');
  let feedback='已收到您的问卷，本次未发现需要处理的情况，请按计划继续随访。';
  if(alerts.length) {
    if(context.contactTargets){
      const hours=alerts.some(a=>a.level==='high')?context.contactTargets.high:context.contactTargets.medium;
      feedback=`已收到您的报告，项目模拟联系目标为 ${hours} 小时内（自然小时）。`;
      if(offHours)feedback=emergency?`当前为非服务时段。若症状加重请前往急诊，值班电话 021-0000-0000（演示）。${feedback}`:`当前为非服务时段。${feedback}`;
    } else feedback=emergency?'当前为非服务时段。若症状加重请前往急诊，值班电话 021-0000-0000（演示）。个案管理师将在下一个工作日联系您。':'已收到您的报告，个案管理师将在 1 个工作日内联系您。';
    s.messages.push({id:idFactory('msg'),patientId:p.id,kind:emergency?'emergency':'alert_feedback',at,text:feedback});
  }
  return {proId:pro.id,alerts,offHours,emergency,feedback};
}
export function submitPro(input:Omit<ClinicalProInput,'revisionOf'>){return submitProToStore(input,{store:getStore(),at:now(),idFactory:newId});}
