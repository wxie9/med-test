import { getPharmaProjectsView } from '@/lib/psp/pharmaView';
import { pspResponse,rejectPharmaFilters } from '@/lib/psp/http';
export const dynamic='force-dynamic';
export async function GET(request:Request) {return pspResponse(()=>{rejectPharmaFilters(request);return getPharmaProjectsView();});}
