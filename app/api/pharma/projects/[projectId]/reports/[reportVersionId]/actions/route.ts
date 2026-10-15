import {z} from 'zod';
import {CommandMeta} from '@/lib/psp/types';
import {acceptReport,requestClientChanges} from '@/lib/psp/delivery';
import {getStore} from '@/lib/state/store';
import {pharmaResponse,type PharmaReportParams} from '@/lib/psp/pharmaHttp';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
const Body=z.discriminatedUnion('action',[z.object({action:z.literal('accept'),comment:z.string().optional(),meta:CommandMeta}).strict(),z.object({action:z.literal('request_changes'),reason:z.string(),meta:CommandMeta}).strict()]);
export async function POST(request:Request,context:PharmaReportParams){return pharmaResponse(async()=>{
 if(new URL(request.url).search)throw new PspError(400,'invalid_input','查询参数无效');const body=Body.parse(await request.json()),{projectId,reportVersionId}=await context.params;
 if(projectId!==getStore().psp.project.id)throw new PspError(404,'not_found','项目不存在');
 return body.action==='accept'?acceptReport(reportVersionId,body.comment,body.meta):requestClientChanges(reportVersionId,body.reason,body.meta);
 });}
