import { getPharmaProjectView } from '@/lib/psp/pharmaView';
import { pspResponse,rejectPharmaFilters } from '@/lib/psp/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}) {
 return pspResponse(async()=>{rejectPharmaFilters(request);return getPharmaProjectView((await params).projectId);});
}
