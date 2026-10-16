"use client";
import { PatientService } from "@/components/psp/PatientService";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { getSeen, unreadCount } from "@/lib/client/messageSeen";
import { buildFollowUpPlan } from "@/lib/plan/followup";
import { displayName, stageLabel, currentTreatments } from "@/lib/patient/display";
import { PatientStatus } from "@/components/patient/PatientStatus";
import { Section } from "@/components/patient/Section";
import { Icon } from "@/components/ui/Icon";
export default function PatientHome() {
  const id = usePatientId();
  const { data, error } = usePatient(id);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => setSeen(getSeen(id)), [id]);
  if (!data) return <PatientStatus error={error} />;
  const { patient, messages, today } = data;
  const next = buildFollowUpPlan(patient, today, data.tasks)[0];
  const unread = unreadCount(messages, seen);
  const research = messages.filter(m => m.kind === "research_opportunity").length;
  const drugs = currentTreatments(patient);
  return (
    <div>
      <div className="patient-greeting">
        <p>您好，欢迎回来</p>
        <h1>{displayName(id)}</h1>
        <p className="mt-2">{stageLabel(patient.stage)}</p>
      </div>
      <PatientService patientId={id} />
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
        <Link href="/patient/pro" className="patient-shortcut"><Icon name="form" size={23}/>填写症状问卷</Link>
        <Link href="/patient/adherence" className="patient-shortcut"><Icon name="check" size={23}/>今日服药打卡</Link>
      </div>
      <div data-testid="aid-program-later" className="mx-3 mt-3 rounded-xl border border-dashed border-gray-300 bg-white/60 p-3 text-sm text-gray-500">
        援助项目 <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">[后续]</span>
        <p className="mt-1 text-xs text-gray-400">慈善赠药与患者援助项目的申请入口，本版不实现。</p>
      </div>
    </div>
  );
}
