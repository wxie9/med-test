import {z} from 'zod';
import {CommandMeta} from '@/lib/psp/types';
import {CorrectionInput,proposeCorrection,verifyCorrection} from '@/lib/psp/corrections';
import {pspResponse,identity} from '@/lib/psp/http';
import {getStore} from '@/lib/state/store';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
const Body=z.discriminatedUnion('action',[CorrectionInput.extend({action:z.literal('propose'),meta:CommandMeta}).strict(),z.object({action:z.literal('verify'),correctionId:z.string().min(1),meta:CommandMeta}).strict()]);
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}) {
 return pspResponse(async()=>{const {role,actorId}=identity(request),{getCorrectionDeskView}=await import('@/lib/psp/evidenceView');return getCorrectionDeskView((await params).projectId,role,actorId);});
}
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}) {
 return pspResponse(async()=>{const input=Body.parse(await request.json());if((await params).projectId!==getStore().psp.project.id)throw new PspError(404,'not_found','项目不存在');if(input.action==='verify')return verifyCorrection(input.correctionId,input.meta);const {meta,action:_,...body}=input;void _;return proposeCorrection(body,meta);});
}
