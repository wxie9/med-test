import {z} from 'zod';
import {CommandMeta} from '@/lib/psp/types';
import {ProjectAlertAction,actOnProjectAlert} from '@/lib/psp/contact';
import {pspResponse} from '@/lib/psp/http';
export const dynamic='force-dynamic';
const Body=z.discriminatedUnion('action',ProjectAlertAction.options.map(schema=>schema.extend({meta:CommandMeta}).strict()) as unknown as [z.ZodDiscriminatedUnionOption<'action'>,...z.ZodDiscriminatedUnionOption<'action'>[]]);
export async function POST(request:Request,{params}:{params:Promise<{alertId:string}>}) {
 return pspResponse(async()=>{const {meta,...input}=Body.parse(await request.json());return actOnProjectAlert((await params).alertId,input as ProjectAlertAction,meta);});
}
