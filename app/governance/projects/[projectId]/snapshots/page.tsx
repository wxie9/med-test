import {SnapshotDesk,type Staff} from '@/components/psp/SnapshotDesk';
import {notFound} from 'next/navigation';
export default async function Page({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Promise<{snapshotId?:string|string[];role?:string|string[]}>}){
 const {projectId}=await params,query=await searchParams;
 const role:Staff=query.role==='data_reviewer'||query.role==='medical_reviewer'?query.role:'project_manager';
 try{return <SnapshotDesk projectId={decodeURIComponent(projectId)} initialSnapshotId={typeof query.snapshotId==='string'?query.snapshotId:undefined} initialRole={role}/>;}
 catch{notFound();}
}
