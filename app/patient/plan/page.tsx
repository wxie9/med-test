"use client";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { buildFollowUpPlan } from "@/lib/plan/followup";
import { PatientStatus } from "@/components/patient/PatientStatus";
import { Section } from "@/components/patient/Section";
const KIND: Record<string, string> = { visit: "门诊", lab: "检验", imaging: "影像", pro: "问卷" };
export default function PlanPage() {
  const id = usePatientId();
  const { data, error } = usePatient(id);
  if (!data) return <PatientStatus error={error} />;
  const plan = buildFollowUpPlan(data.patient, data.today, data.tasks);
  return (
    <Section title="我的随访计划">
      {plan.length === 0 ? <p className="text-sm text-gray-500">暂无随访计划</p> : (
        <ul className="divide-y divide-gray-100">
          {plan.map((i, n) => (
            <li key={`${i.title}-${i.due}-${n}`} data-testid="plan-item" className="flex items-start justify-between gap-2 py-2 text-sm">
              <span><span className="mr-2 rounded bg-pink-50 px-1.5 py-0.5 text-xs text-pink-700">{KIND[i.kind]}</span>{i.title}</span>
              <span className="shrink-0 text-gray-500">{i.due}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
