"use client";
import { AgentPanel } from "@/components/AgentPanel";
import { usePatientId } from "@/lib/client/patientContext";
import { QUICK_QUESTIONS } from "@/lib/agents/quickQuestions";
export default function PatientAssistantPage() {
  const patientId = usePatientId();
  return (
    <div className="p-3">
      <AgentPanel key={patientId} agent="patient" context={{ patientId, page: "assistant" }} quickQuestions={QUICK_QUESTIONS.patient} />
    </div>
  );
}
