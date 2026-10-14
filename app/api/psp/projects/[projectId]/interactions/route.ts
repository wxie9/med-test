import {CommandMeta} from '@/lib/psp/types';
import {InteractionInput,recordInteraction} from '@/lib/psp/contact';
import {pspResponse} from '@/lib/psp/http';
import {getStore} from '@/lib/state/store';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
const Body=InteractionInput.extend({meta:CommandMeta}).strict();
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}) {
 return pspResponse(async()=>{const {meta,...input}=Body.parse(await request.json());if((await params).projectId!==getStore().psp.project.id)throw new PspError(404,'not_found','项目不存在');return recordInteraction(input,meta);});
}
