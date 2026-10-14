import { getInternalProjectView } from '@/lib/psp/views';
import { pspResponse,identity } from '@/lib/psp/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}) {
 return pspResponse(async()=>{const who=identity(request);return getInternalProjectView((await params).projectId,who.role,who.actorId);});
}
