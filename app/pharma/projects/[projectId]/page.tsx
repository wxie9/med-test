import { PharmaProjects } from "@/components/psp/PharmaProjects";
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return <PharmaProjects projectId={projectId} />; }
