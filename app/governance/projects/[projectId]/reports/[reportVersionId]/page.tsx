import {ReportDraftDesk,type ReportStaff} from '@/components/psp/ReportDraftDesk';
import {notFound} from 'next/navigation';
export default async function Page({params,searchParams}:{params:Promise<{projectId:string;reportVersionId:string}>;searchParams:Promise<{role?:string|string[]}>}){
 const {projectId,reportVersionId}=await params,query=await searchParams;
 const role:ReportStaff=query.role==='data_reviewer'||query.role==='medical_reviewer'?query.role:'project_manager';
 try{return <ReportDraftDesk projectId={decodeURIComponent(projectId)} initialReportId={decodeURIComponent(reportVersionId)} initialRole={role}/>;}
 catch{notFound();}
}
