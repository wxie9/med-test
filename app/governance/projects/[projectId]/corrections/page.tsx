import { CorrectionDesk } from '@/components/psp/CorrectionDesk';
export default async function CorrectionPage({ params }: { params: Promise<{ projectId: string }> }) {
 const { projectId } = await params;
 return <CorrectionDesk projectId={projectId}/>;
}
