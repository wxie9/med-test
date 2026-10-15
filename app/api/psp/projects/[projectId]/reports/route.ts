import {z} from 'zod';
import {CommandMeta} from '@/lib/psp/types';
import {ReportDraftInputSchema} from '@/lib/psp/reportTypes';
import {createReportDraft,listInternalReports} from '@/lib/psp/reports';
import {getStore} from '@/lib/state/store';
import {pspResponse} from '@/lib/psp/http';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
const Body=ReportDraftInputSchema.extend({snapshotId:z.string().min(1),meta:CommandMeta}).strict();
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){
 const response=await pspResponse(async()=>{const query=new URL(request.url).searchParams;if([...query.keys()].some(key=>!['role','actorId'].includes(key)||query.getAll(key).length!==1))throw new PspError(400,'invalid_input','查询参数无效');return listInternalReports((await params).projectId,query.get('role'),query.get('actorId'));});response.headers.set('Cache-Control','no-store');return response;
}
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
 const response=await pspResponse(async()=>{if(new URL(request.url).search)throw new PspError(400,'invalid_input','查询参数无效');const {snapshotId,meta,...input}=Body.parse(await request.json());const current=getStore();if(meta.seedVersion!==current.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新后重新操作');if((await params).projectId!==current.psp.project.id)throw new PspError(404,'not_found','项目不存在');return createReportDraft(snapshotId,input,meta);});response.headers.set('Cache-Control','no-store');return response;
}
