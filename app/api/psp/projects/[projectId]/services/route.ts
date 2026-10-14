import {getPatientServiceView} from '@/lib/psp/serviceView';
import {pspResponse,identity} from '@/lib/psp/http';
import {PspError} from '@/lib/psp/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}) {
 return pspResponse(async()=>{const patientId=new URL(request.url).searchParams.get('patientId'),who=identity(request);if(!patientId)throw new PspError(400,'invalid_input','请指定项目患者');return getPatientServiceView((await params).projectId,patientId,who.role,who.actorId);});
}
