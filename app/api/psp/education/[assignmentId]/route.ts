import {z} from 'zod';
import {CommandMeta} from '@/lib/psp/types';
import {sendEducation,recordEducationOpened,recordEducationFeedback,getPatientEducationView} from '@/lib/psp/education';
import {pspResponse,identity} from '@/lib/psp/http';
export const dynamic='force-dynamic';
const Body=z.discriminatedUnion('action',[
 z.object({action:z.literal('send'),contentVersionId:z.string().trim().min(1),meta:CommandMeta}).strict(),
 z.object({action:z.literal('open'),meta:CommandMeta}).strict(),
 z.object({action:z.literal('feedback'),understood:z.boolean(),needsHelp:z.boolean(),meta:CommandMeta}).strict(),
]);
export async function GET(request:Request,{params}:{params:Promise<{assignmentId:string}>}) {
 return pspResponse(async()=>{const {role,actorId}=identity(request);return getPatientEducationView((await params).assignmentId,role,actorId);});
}
export async function POST(request:Request,{params}:{params:Promise<{assignmentId:string}>}) {
 return pspResponse(async()=>{const input=Body.parse(await request.json()),{assignmentId}=await params;return input.action==='send'?sendEducation(assignmentId,input.contentVersionId,input.meta):input.action==='open'?recordEducationOpened(assignmentId,input.meta):recordEducationFeedback(assignmentId,{understood:input.understood,needsHelp:input.needsHelp},input.meta);});
}
