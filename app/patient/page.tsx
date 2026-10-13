"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { getLastSeen } from "@/lib/client/messageSeen";
import { buildFollowUpPlan } from "@/lib/plan/followup";
import { displayName, stageLabel, currentTreatments } from "@/lib/patient/display";
import { PatientStatus } from "@/components/patient/PatientStatus";
import { Section } from "@/components/patient/Section";
export default function PatientHome() {
  const id = usePatientId();
  const { data, error } = usePatient(id);
  const [lastSeen, setLastSeen] = useState("");
  useEffect(() => setLastSeen(getLastSeen(id)), [id]);
  if (!data) return <PatientStatus error={error} />;
  const { patient, messages, today } = data;
  const next = buildFollowUpPlan(patient, today, data.tasks)[0];
  const unread = messages.filter(m => m.at > lastSeen).length;
  const research = messages.filter(m => m.kind === "research_opportunity").length;
  const drugs = currentTreatments(patient);
  return (
    <div>
      <div className="bg-pink-600 px-4 pb-5 pt-4 text-white">
        <p className="text-xs opacity-80">您好</p>
        <h1 className="text-xl font-semibold">{displayName(id)}</h1>
        <p className="mt-1 text-sm opacity-90">{stageLabel(patient.stage)}</p>
      </div>
      <Section title="当前治疗">
        <p className="text-sm text-gray-700">{drugs.length ? drugs.join("、") : "暂无进行中的药物治疗"}</p>
      </Section>
      <Section title="下一个随访项">
        {next ? (
          <Link href="/patient/plan" className="block text-sm text-gray-700">
            {next.title}<span className="ml-2 text-gray-500">{next.due}</span>
          </Link>
        ) : <p className="text-sm text-gray-500">暂无</p>}
      </Section>
      <Section title="消息">
        <Link href="/patient/messages" className="text-sm text-gray-700">
          未读消息 <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${unread ? "bg-red-500 text-white" : "bg-gray-200"}`}>{unread}</span>
        </Link>
        {research > 0 && (
          <Link href="/patient/research" className="mt-2 block rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-700">
            您有 {research} 条研究机会，点击查看
          </Link>
        )}
      </Section>
      <div className="mx-3 grid grid-cols-2 gap-3">
        <Link href="/patient/pro" className="rounded-xl bg-white p-4 text-center text-sm shadow-sm">填写症状问卷</Link>
        <Link href="/patient/adherence" className="rounded-xl bg-white p-4 text-center text-sm shadow-sm">今日服药打卡</Link>
      </div>
    </div>
  );
}
