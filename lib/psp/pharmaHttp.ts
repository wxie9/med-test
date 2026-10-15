import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getStore} from '@/lib/state/store';
import {PspError} from './errors';
import {requireIdentity} from './transaction';
import {readPharmaReport,type PharmaReportQuery} from './pharmaView';
const time=z.string().datetime({offset:true});
const Query=z.object({seedVersion:z.coerce.number().int().positive(),authorizationVersion:z.coerce.number().int().positive(),periodStart:time,periodEnd:time,role:z.literal('pharma_owner'),actorId:z.literal('pharma-owner-a')}).strict();
export type PharmaReportParams={params:Promise<{projectId:string;reportVersionId:string}>};
export async function pharmaResponse(run:()=>unknown|Promise<unknown>):Promise<Response>{
 try{const value=await run();return value instanceof Response?value:NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});}
 catch(error){const s=getStore(),base={seedVersion:s.seedVersion,authorizationVersion:s.psp.authorizationVersion};
  if(error instanceof PspError)return NextResponse.json({...base,error:error.message,code:error.code},{status:error.status,headers:{'Cache-Control':'no-store'}});
  if(error instanceof z.ZodError||error instanceof SyntaxError)return NextResponse.json({...base,error:'请求格式无效',code:'invalid_input'},{status:400,headers:{'Cache-Control':'no-store'}});
  console.error('PSP pharma request failed',error);return NextResponse.json({...base,error:'操作失败，请刷新后重试',code:'internal_error'},{status:500,headers:{'Cache-Control':'no-store'}});
 }
}
export function parsePharmaReportQuery(request:Request,download=false):{query:PharmaReportQuery;format?:'text'|'html'}{
 const params=new URL(request.url).searchParams,keys=[...params.keys()];if(new Set(keys).size!==keys.length)throw new PspError(400,'invalid_input','查询参数重复');
 let format:'text'|'html'|undefined;if(download){format=z.enum(['text','html']).parse(params.get('format'));params.delete('format');}
 const query=Query.parse(Object.fromEntries(params.entries()));requireIdentity(query.role,query.actorId,['pharma_owner']);const s=getStore();
 if(query.seedVersion!==s.seedVersion)throw new PspError(409,'stale_seed','演示已重置，请刷新');
 if(query.authorizationVersion!==s.psp.authorizationVersion)throw new PspError(409,'stale_authorization','授权范围已变化，请刷新');return {query,format};
}
export async function gatedPharmaRead(request:Request,context:PharmaReportParams,download=false){
 const {query,format}=parsePharmaReportQuery(request,download),{projectId,reportVersionId}=await context.params;
 const report=getStore().psp.reportVersions?.find(r=>r.id===reportVersionId&&r.projectId===projectId);
 if(!report)throw new PspError(404,'not_found','报告版本不存在');
 if(Date.parse(query.periodStart)!==Date.parse(report.window.periodStart)||Date.parse(query.periodEnd)!==Date.parse(report.window.periodEnd))throw new PspError(400,'invalid_window','报告期间不匹配');
 return {view:readPharmaReport(projectId,reportVersionId),format};
}
