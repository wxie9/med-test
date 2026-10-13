"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { markSeen } from "@/lib/client/messageSeen";
import { PatientStatus } from "@/components/patient/PatientStatus";
import { Section } from "@/components/patient/Section";
import type { PatientMessage } from "@/lib/domain/types";
const KIND: Record<PatientMessage["kind"], { label: string; cls: string }> = {
  alert_feedback: { label: "随访反馈", cls: "bg-blue-50 text-blue-700" },
  emergency: { label: "紧急提示", cls: "bg-red-50 text-red-700" },
  plan_update: { label: "计划更新", cls: "bg-green-50 text-green-700" },
  research_opportunity: { label: "研究机会", cls: "bg-purple-50 text-purple-700" },
};
export default function MessagesPage() {
  const id = usePatientId();
  const { data, error } = usePatient(id);
  const sorted = data ? [...data.messages].sort((a, b) => b.at.localeCompare(a.at)) : [];
  const idsKey = sorted.map(m => m.id).join(",");
  useEffect(() => { if (idsKey) markSeen(id, idsKey.split(",")); }, [id, idsKey]);
  if (!data) return <PatientStatus error={error} />;
  return (
    <Section title="消息">
      {sorted.length === 0 ? <p className="text-sm text-gray-500">暂无消息</p> : (
        <ul className="space-y-3">
          {sorted.map(m => (
            <li key={m.id} className="rounded-lg border border-gray-100 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className={`rounded px-1.5 py-0.5 ${KIND[m.kind].cls}`}>{KIND[m.kind].label}</span>
                <span className="text-gray-400">{new Date(m.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</span>
              </div>
              <p className="text-gray-800">{m.text}</p>
              {m.kind === "research_opportunity" && <Link href="/patient/research" className="mt-1 inline-block text-xs text-purple-700 hover:underline">查看</Link>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
