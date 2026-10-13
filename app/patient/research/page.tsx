"use client";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { PatientStatus } from "@/components/patient/PatientStatus";
import { Section } from "@/components/patient/Section";
import { ResearchOpportunity } from "@/components/patient/ResearchOpportunity";
export default function ResearchPage() {
  const id = usePatientId();
  const { data, error } = usePatient(id);
  if (!data) return <PatientStatus error={error} />;
  const items = data.messages.filter(m => m.kind === "research_opportunity").sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Section title="研究机会">
      {items.length === 0 ? <p className="text-sm text-gray-500">暂无研究机会</p> : (
        <ul className="space-y-3">{items.map(m => <ResearchOpportunity key={m.id} m={m} />)}</ul>
      )}
      <p className="mt-3 text-[11px] text-gray-400">是否参加由您与医生共同决定；参加前会有完整的知情同意。</p>
    </Section>
  );
}
