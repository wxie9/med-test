import {PharmaReport} from '@/components/psp/PharmaReport';
import {notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{projectId:string;reportVersionId:string}>}){
 const {projectId,reportVersionId}=await params;
 try{return <PharmaReport projectId={decodeURIComponent(projectId)} reportId={decodeURIComponent(reportVersionId)}/>;}
 catch{notFound();}
}
