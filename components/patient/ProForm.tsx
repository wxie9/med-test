"use client";
import { useState } from "react";
import Link from "next/link";
import { SCALE_SYMPTOMS, hasAdherenceFlags, type ScaleId } from "@/lib/pro/scales";
const LEVELS = ["无", "轻度", "中度", "重度"];
type Result = { feedback: string; alerts: unknown[]; offHours: boolean };
/** Symptom questionnaire (0–3 sliders) plus adherence flags for the monthly endocrine scale. */
export function ProForm({ patientId, scaleId, onSubmitted }: { patientId: string; scaleId: ScaleId; onSubmitted: () => void }) {
  const symptoms = SCALE_SYMPTOMS[scaleId];
  const [items, setItems] = useState<Record<string, number>>(() => Object.fromEntries(symptoms.map(s => [s, 0])));
  const [missed, setMissed] = useState(0);
  const [stopIntent, setStopIntent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const withFlags = hasAdherenceFlags(scaleId);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/pro", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ patientId, scaleId, items, flags: withFlags ? { missedDoses14d: missed, stopIntent } : {} }) });
      if (!r.ok) throw new Error(`提交失败（${r.status}）`);
      setResult((await r.json()) as Result); onSubmitted();
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {symptoms.map(s => (
        <label key={s} className="block">
          <span className="flex justify-between text-sm text-gray-800"><span>{s}</span><span className="text-gray-500">{items[s]} · {LEVELS[items[s]]}</span></span>
          <input type="range" min={0} max={3} step={1} value={items[s]} data-testid={`slider-${s}`} aria-label={s}
            onChange={e => setItems(v => ({ ...v, [s]: Number(e.target.value) }))} className="w-full accent-pink-600" />
        </label>
      ))}
      {withFlags && (
        <>
          <label className="flex items-center justify-between text-sm text-gray-800">
            过去两周漏服次数
            <input type="number" min={0} max={14} value={missed} data-testid="missed-doses"
              onChange={e => setMissed(Math.max(0, Math.min(14, Math.trunc(Number(e.target.value) || 0))))}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-right" />
          </label>
          <label className="flex items-center justify-between text-sm text-gray-800">
            是否有停药念头
            <input type="checkbox" checked={stopIntent} data-testid="stop-intent" onChange={e => setStopIntent(e.target.checked)} className="h-5 w-5 accent-pink-600" />
          </label>
        </>
      )}
      <button type="submit" disabled={busy} data-testid="submit-pro" className="w-full rounded-lg bg-pink-600 py-2 text-white disabled:opacity-50">
        {busy ? "提交中…" : "提交问卷"}
      </button>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {result && (
        <div role="status" className={`rounded-lg p-3 text-sm ${result.offHours && result.alerts.length ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
          <p data-testid="pro-feedback">{result.feedback}</p>
          <Link href="/patient/messages" className="mt-1 inline-block underline">查看消息</Link>
        </div>
      )}
    </form>
  );
}
