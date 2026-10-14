import { ServiceDesk } from "@/components/psp/ServiceDesk";
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return <ServiceDesk projectId={projectId} />; }
