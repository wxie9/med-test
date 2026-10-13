"use client";
import { useParams } from "next/navigation";
import { usePatient } from "@/lib/client/usePatient";
import { Card } from "@/components/clinic/Card";
import { PatientSummary } from "@/components/clinic/PatientSummary";
import { Timeline } from "@/components/Timeline";
import { ProTrend } from "@/components/ProTrend";
import { AlertQueue } from "@/components/AlertQueue";
import { AdherenceCalendar } from "@/components/patient/AdherenceCalendar";
import { TASK_STATUS } from "@/lib/clinic/labels";
import { AgentPanel } from "@/components/AgentPanel";
import { quickQuestions } from "@/lib/agents/quickQuestions";
export default function ClinicPatientPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, refresh } = usePatient(id);
  if (!data) return <p className="text-sm text-gray-500">{error ? `加载失败：${error.message}` : "加载中…"}</p>;
  const { patient: p, today } = data;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-4">
      <div className="min-w-0 space-y-4">
        <Card title="基本信息与同意状态"><PatientSummary p={p} /></Card>
        <Card title="病程时间轴"><Timeline patient={p} today={today} /></Card>
        <div className="grid grid-cols-2 gap-4">
          <Card title="PRO 症状趋势"><ProTrend pro={p.pro} /></Card>
          <Card title="依从日历（近 60 天）">
            {p.adherence.length ? <div className="max-w-sm"><AdherenceCalendar logs={p.adherence} today={today} /></div> : <p className="text-sm text-gray-400">无口服药服药记录</p>}
          </Card>
        </div>
        <Card title="该患者的预警与任务">
          <AlertQueue alerts={data.alerts} today={today} onChanged={refresh} />
          <h3 className="mt-4 mb-2 text-xs font-semibold text-gray-500">随访任务</h3>
          {data.tasks.length === 0 ? <p className="text-sm text-gray-400">暂无随访任务</p> : (
            <ul className="space-y-1 text-sm">
              {[...data.tasks].sort((a, b) => a.due.localeCompare(b.due)).map(t => (
                <li key={t.id} className="flex gap-3"><span className="tabular-nums">{t.due}</span><span>{t.type}</span><span className="text-gray-500">{t.owner}</span><span className={t.status === "done" ? "text-gray-400" : "text-pink-700"}>{TASK_STATUS[t.status]}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <aside>
        <div className="sticky top-4">
          <AgentPanel key={id} agent="doctor" context={{ patientId: id, page: "patient" }} quickQuestions={quickQuestions("doctor", p.stage)} />
        </div>
      </aside>
    </div>
  );
}
