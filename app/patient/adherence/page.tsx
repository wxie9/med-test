"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProjectAdherence } from "@/components/psp/ProjectAdherence";
import { usePatientId } from "@/lib/client/patientContext";
import { usePatient } from "@/lib/client/usePatient";
import { PatientStatus } from "@/components/patient/PatientStatus";
import { Section } from "@/components/patient/Section";
import { AdherenceCalendar } from "@/components/patient/AdherenceCalendar";
const REASONS = ["忘记", "副作用", "药物用完", "其他"];
function GenericAdherence() {
  const id = usePatientId();
  const { data, error, refresh } = usePatient(id);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <PatientStatus error={error} />;
  const todayRow = data.patient.adherence.find(r => r.date === data.today);
  async function checkIn(taken: 0 | 1) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/adherence", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ patientId: id, taken, ...(taken === 0 ? { missedReason: reason } : {}) }) });
      if (!r.ok) throw new Error(`打卡失败（${r.status}）`);
      await refresh();
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
  }
  return (
    <>
      <Section title="今日服药打卡">
        <p className="mb-3 text-sm text-gray-600">
          {data.today} · {todayRow ? (todayRow.taken >= todayRow.due ? "今日已打卡：已服" : `今日已打卡：未服（${todayRow.missedReason ?? "未填原因"}）`) : "今日尚未打卡"}
        </p>
        <button type="button" disabled={busy} onClick={() => void checkIn(1)} className="w-full rounded-lg bg-pink-600 py-2 text-white disabled:opacity-50">今日已服</button>
        <div className="mt-2 flex gap-2">
          <select value={reason} onChange={e => setReason(e.target.value)} aria-label="漏服原因" className="flex-1 rounded border border-gray-300 px-2 text-sm">
            {REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => void checkIn(0)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">今日未服</button>
        </div>
        {err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}
      </Section>
      <Section title="近 60 天服药记录">
        <AdherenceCalendar logs={data.patient.adherence} today={data.today} />
      </Section>
    </>
  );
}

function AdherencePageContent() {
  const id = usePatientId();
  const params = useSearchParams();
  return params.has("enrollment") ? <ProjectAdherence patientId={id} enrollmentId={params.get("enrollment") ?? ""} /> : <GenericAdherence />;
}

export default function AdherencePage() { return <Suspense fallback={<p className="p-4 text-sm">正在加载服药记录…</p>}><AdherencePageContent /></Suspense>; }
