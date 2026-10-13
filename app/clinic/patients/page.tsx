"use client";
import { useEffect, useState } from "react";
import { PatientName } from "@/components/clinic/PatientName";
import type { PatientListRow } from "@/lib/clinic/patientList";
import type { Patient } from "@/lib/domain/types";
import { stageLabel } from "@/lib/patient/display";
import { HER2_LABEL } from "@/lib/clinic/labels";
const PAGE = 50;
const STAGES: Patient["stage"][] = ["early_adjuvant", "metastatic", "survivorship", "lost", "deceased"];
export default function PatientsPage() {
  const [rows, setRows] = useState<PatientListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"" | Patient["stage"]>("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/patients", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error(`GET /api/patients failed: ${r.status}`); return r.json() as Promise<{ patients: PatientListRow[] }>; })
      .then(j => { if (!cancelled) { setRows(j.patients); setError(null); } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    void load(); const t = setInterval(() => void load(), 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  if (!rows) return <p className="text-sm text-gray-500">{error ? `加载失败：${error}` : "加载中…"}</p>;
  const filtered = stage ? rows.filter(r => r.stage === stage) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">患者列表</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">阶段</span>
          <select value={stage} onChange={e => { setStage(e.target.value as "" | Patient["stage"]); setPage(0); }} className="rounded border border-gray-300 px-2 py-1">
            <option value="">全部</option>
            {STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
          </select>
        </label>
      </div>
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>{["患者", "年龄", "阶段", "HR", "HER2", "当前治疗", "最近联系", "未关闭预警"].map(h => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.slice(cur * PAGE, cur * PAGE + PAGE).map(r => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-2 py-2">
                  <PatientName id={r.id} />
                  {r.anchorKey !== null && <span className="ml-2 rounded bg-pink-100 px-1.5 py-0.5 text-xs text-pink-700">锚点</span>}
                </td>
                <td className="px-2 py-2 tabular-nums">{r.age}</td>
                <td className="px-2 py-2">{stageLabel(r.stage)}</td>
                <td className="px-2 py-2">{r.hrPositive ? "HR+" : "HR−"}</td>
                <td className="px-2 py-2">{HER2_LABEL[r.her2]}</td>
                <td className="px-2 py-2">{r.currentTreatment ?? "—"}</td>
                <td className="px-2 py-2 tabular-nums">{r.lastContact}</td>
                <td className={`px-2 py-2 tabular-nums ${r.openAlerts ? "font-semibold text-red-600" : "text-gray-400"}`}>{r.openAlerts}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <span>共 {filtered.length} 名患者</span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-40">上一页</button>
            {cur + 1} / {pages}
            <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-40">下一页</button>
          </span>
        </div>
      </section>
    </div>
  );
}
