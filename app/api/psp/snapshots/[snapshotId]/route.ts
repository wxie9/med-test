import {getPspSnapshot} from '@/lib/psp/snapshot';
import {pspResponse} from '@/lib/psp/http';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{snapshotId:string}>}){
 const response=await pspResponse(async()=>{
  const query=new URL(request.url).searchParams;if([...query.keys()].some(key=>!['role','actorId','seedVersion'].includes(key)))throw new PspError(400,'invalid_input','查询参数无效');
  const seed=Number(query.get('seedVersion'));if(!Number.isInteger(seed)||seed<=0||!query.has('seedVersion'))throw new PspError(400,'invalid_input','请指定演示版本');
  return getPspSnapshot((await params).snapshotId,query.get('role'),query.get('actorId'),seed);
 });response.headers.set('Cache-Control','no-store');return response;
}
