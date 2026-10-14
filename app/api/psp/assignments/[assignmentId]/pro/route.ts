import { z } from 'zod';
import { CommandMeta } from '@/lib/psp/types';
import { ProInputFields,validateProItems } from '@/lib/pro/validation';
import { submitProjectPro } from '@/lib/psp/commands';
import { pspResponse } from '@/lib/psp/http';
export const dynamic='force-dynamic';
const Body=z.object({...ProInputFields,revisionOf:z.string().min(1).optional(),meta:CommandMeta}).strict().superRefine(validateProItems);
export async function POST(request:Request,{params}:{params:Promise<{assignmentId:string}>}) {
 return pspResponse(async()=>{const {meta,...input}=Body.parse(await request.json());return submitProjectPro({...input,assignmentId:(await params).assignmentId},meta);});
}
