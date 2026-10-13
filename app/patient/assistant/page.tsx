"use client";
import { AgentPanel } from "@/components/AgentPanel";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { quickQuestions } from "@/lib/agents/quickQuestions";
import { PatientStatus } from "@/components/patient/PatientStatus";
export default function PatientAssistantPage() {
  const patientId = usePatientId();
  const { data, error } = usePatient(patientId);
  if (!data) return <PatientStatus error={error} />;
  return (
    <div className="p-3">
      <AgentPanel key={patientId} agent="patient" context={{ patientId, page: "assistant" }} quickQuestions={quickQuestions("patient", data.patient.stage)} />
    </div>
  );
}
