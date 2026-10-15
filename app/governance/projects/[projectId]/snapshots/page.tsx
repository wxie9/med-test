import {SnapshotDesk} from '@/components/psp/SnapshotDesk';
export default async function Page({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;return <SnapshotDesk projectId={projectId}/>;}
