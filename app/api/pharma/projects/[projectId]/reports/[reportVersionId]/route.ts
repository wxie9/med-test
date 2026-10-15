import {pharmaResponse,gatedPharmaRead,type PharmaReportParams} from '@/lib/psp/pharmaHttp';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:PharmaReportParams){return pharmaResponse(async()=> (await gatedPharmaRead(request,context)).view);}
