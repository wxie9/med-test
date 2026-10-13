"use client";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { SCALE_TITLES, scaleFor } from "@/lib/pro/scales";
import { PatientStatus } from "@/components/patient/PatientStatus";
import { Section } from "@/components/patient/Section";
import { ProForm } from "@/components/patient/ProForm";
export default function ProPage() {
  const id = usePatientId();
  const { data, error, refresh } = usePatient(id);
  if (!data) return <PatientStatus error={error} />;
  const scaleId = scaleFor(data.patient);
  return (
    <Section title={SCALE_TITLES[scaleId]}>
      <p className="mb-3 text-xs text-amber-700">演示用自拟问卷，非标准量表。0 = 无，3 = 重度。</p>
      <ProForm key={id} patientId={id} scaleId={scaleId} onSubmitted={() => void refresh()} />
    </Section>
  );
}
