import {z} from 'zod';
import {CommandMeta} from '@/lib/psp/types';
import {NextActionSchema} from '@/lib/psp/reportTypes';
import {submitReport,reviewReport,reviseReport} from '@/lib/psp/review';
import {pspResponse} from '@/lib/psp/http';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
const Body=z.discriminatedUnion('action',[
 z.object({action:z.literal('submit'),meta:CommandMeta}).strict(),
 z.object({action:z.literal('review'),kind:z.enum(['data','medical']),decision:z.enum(['approve','return']),reason:z.string().optional(),meta:CommandMeta}).strict(),
 z.object({action:z.literal('revise'),nextActions:z.array(NextActionSchema).max(12),meta:CommandMeta}).strict(),
]);
export async function POST(request:Request,{params}:{params:Promise<{reportVersionId:string}>}){
 const response=await pspResponse(async()=>{
  if(new URL(request.url).search)throw new PspError(400,'invalid_input','查询参数无效');
  const body=Body.parse(await request.json()),id=(await params).reportVersionId;
  if(body.action==='submit')return submitReport(id,body.meta);
  if(body.action==='revise')return reviseReport(id,body.nextActions,body.meta);
  return reviewReport(id,{kind:body.kind,decision:body.decision,...(body.reason===undefined?{}:{reason:body.reason})},body.meta);
 });response.headers.set('Cache-Control','no-store');return response;
}
