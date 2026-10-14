import { z } from 'zod';
import { CommandMeta } from '@/lib/psp/types';
import { recordPermission } from '@/lib/psp/permissions';
import { pspResponse } from '@/lib/psp/http';
export const dynamic='force-dynamic';
const Body=z.object({scope:z.enum(['service','aggregate']),action:z.enum(['grant','withdraw']),meta:CommandMeta}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 return pspResponse(async()=>{const body=Body.parse(await request.json());return recordPermission((await params).id,body.scope,body.action,body.meta);});
}
