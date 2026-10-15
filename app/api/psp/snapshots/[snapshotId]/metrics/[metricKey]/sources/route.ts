import {getMetricEvidence} from '@/lib/psp/snapshot';
import {pspResponse} from '@/lib/psp/http';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{snapshotId:string;metricKey:string}>}){
 const response=await pspResponse(async()=>{
  const query=new URL(request.url).searchParams;if([...query.keys()].some(key=>!['role','actorId','seedVersion','scope'].includes(key)))throw new PspError(400,'invalid_input','查询参数无效');
  const seed=Number(query.get('seedVersion'));if(!Number.isInteger(seed)||seed<=0||!query.has('seedVersion'))throw new PspError(400,'invalid_input','请指定演示版本');
  const scope=query.get('scope')??'internal';if(scope!=='internal'&&scope!=='aggregate')throw new PspError(400,'invalid_input','来源范围无效');
  const {snapshotId,metricKey}=await params;return getMetricEvidence(snapshotId,metricKey,scope,query.get('role'),query.get('actorId'),seed);
 });response.headers.set('Cache-Control','no-store');return response;
}
