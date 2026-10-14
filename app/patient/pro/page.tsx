"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProjectPro } from "@/components/psp/ProjectPro";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { SCALE_TITLES, scaleFor } from "@/lib/pro/scales";
import { PatientStatus } from "@/components/patient/PatientStatus";
import { Section } from "@/components/patient/Section";
import { ProForm } from "@/components/patient/ProForm";
function ProPageContent() {
  const params = useSearchParams();
  const id = usePatientId();
  const { data, error, refresh } = usePatient(id);
  if (params.has("assignment")) return <ProjectPro key={`${id}:${params.get("assignment")}`} patientId={id} assignmentId={params.get("assignment") ?? ""} revisionOf={params.has("revisionOf") ? params.get("revisionOf") ?? "" : undefined} onSubmitted={() => void refresh()} clinicalError={error} retryClinical={() => void refresh()} clinicalReady={!!data} revisionResponse={data?.patient.pro?.find(response => response.id === params.get("revisionOf") && response.scaleId === "endocrine_monthly_v1")} />;
  if (!data) return <PatientStatus error={error} />;
  const scaleId = scaleFor(data.patient);
  return (
    <Section title={SCALE_TITLES[scaleId]}>
      <p className="mb-3 text-xs text-amber-700">演示用自拟问卷，非标准量表。0 = 无，3 = 重度。</p>
      <ProForm key={id} patientId={id} scaleId={scaleId} onSubmitted={() => void refresh()} />
    </Section>
  );
}

export default function ProPage() { return <Suspense fallback={<p className="p-4 text-sm">正在加载问卷…</p>}><ProPageContent /></Suspense>; }
