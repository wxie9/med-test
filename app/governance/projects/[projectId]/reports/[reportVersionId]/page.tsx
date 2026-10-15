import {ReportDraftDesk} from '@/components/psp/ReportDraftDesk';
export default async function Page({params}:{params:Promise<{projectId:string;reportVersionId:string}>}){const {projectId,reportVersionId}=await params;return <ReportDraftDesk projectId={projectId} initialReportId={reportVersionId}/>;}
