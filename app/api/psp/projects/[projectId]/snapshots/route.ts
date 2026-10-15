import {z} from 'zod';
import {CommandMeta} from '@/lib/psp/types';
import {SnapshotWindowSchema} from '@/lib/psp/snapshotTypes';
import {freezePspSnapshot,listPspSnapshots} from '@/lib/psp/snapshot';
import {pspResponse} from '@/lib/psp/http';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
const Body=z.object({window:SnapshotWindowSchema,meta:CommandMeta}).strict();
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){
 const response=await pspResponse(async()=>{const query=new URL(request.url).searchParams;if([...query.keys()].some(key=>!['role','actorId'].includes(key)))throw new PspError(400,'invalid_input','查询参数无效');return listPspSnapshots((await params).projectId,query.get('role'),query.get('actorId'));});response.headers.set('Cache-Control','no-store');return response;
}
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
 const response=await pspResponse(async()=>{if(new URL(request.url).search)throw new PspError(400,'invalid_input','查询参数无效');const {window,meta}=Body.parse(await request.json());return freezePspSnapshot((await params).projectId,window,meta);});response.headers.set('Cache-Control','no-store');return response;
}
