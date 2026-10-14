import { getPatientProjectsView } from '@/lib/psp/views';
import { pspResponse,identity } from '@/lib/psp/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{patientId:string}>}) {
 return pspResponse(async()=>{const who=identity(request);return getPatientProjectsView((await params).patientId,who.role,who.actorId);});
}
