import { CommandMeta } from '@/lib/psp/types';
import { EnrollmentAction,recordEnrollmentState } from '@/lib/psp/permissions';
import { pspResponse } from '@/lib/psp/http';
export const dynamic='force-dynamic';
const Body=EnrollmentAction.extend({meta:CommandMeta}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 return pspResponse(async()=>{const {meta,...action}=Body.parse(await request.json());return recordEnrollmentState((await params).id,action,meta);});
}
