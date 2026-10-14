import {z} from 'zod';
import {CommandMeta} from '@/lib/psp/types';
import {AdherenceInput,submitProjectAdherence,importLegacySelfReports} from '@/lib/psp/selfReport';
import {pspResponse,identity} from '@/lib/psp/http';
export const dynamic='force-dynamic';
const Submit=AdherenceInput.omit({enrollmentId:true}).extend({action:z.literal('submit').optional(),meta:CommandMeta}).strict();
const Import=z.object({action:z.literal('import_legacy'),meta:CommandMeta}).strict();
const Body=z.union([Submit,Import]);
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 return pspResponse(async()=>{const {role,actorId}=identity(request),{getProjectAdherenceView}=await import('@/lib/psp/evidenceView');return getProjectAdherenceView((await params).id,role,actorId);});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 return pspResponse(async()=>{const {id:enrollmentId}=await params,input=Body.parse(await request.json());if(input.action==='import_legacy')return importLegacySelfReports(enrollmentId,input.meta);const {meta,action:_,...body}=input;void _;return submitProjectAdherence({...body,enrollmentId},meta);});
}
