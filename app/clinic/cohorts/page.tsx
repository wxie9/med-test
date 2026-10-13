"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/clinic/Card";
import { CohortFilterForm } from "@/components/clinic/CohortFilterForm";
import { EMPTY_FORM, toCohortFilter, type CohortFormState } from "@/lib/clinic/cohortFilter";
import { useClinicIdentity } from "@/lib/client/clinicIdentity";
import type { Cohort } from "@/lib/domain/types";
const defaultName = () => `候选队列 ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
async function json<T>(r: Promise<Response>): Promise<T> { const res = await r; if (!res.ok) throw new Error(`请求失败（${res.status}）`); return res.json() as Promise<T>; }
const post = (url: string, body: unknown, method = "POST") => fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export default function CohortsPage() {
  const { identity } = useClinicIdentity();
  const [form, setForm] = useState<CohortFormState>(EMPTY_FORM);
  const [count, setCount] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const filter = useMemo(() => toCohortFilter(form), [form]);
  useEffect(() => { setName(defaultName()); }, []);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      json<{ count: number }>(post("/api/cohorts/preview", { filter }))
        .then(j => { if (!cancelled) { setCount(j.count); setErr(null); } })
        .catch(e => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [filter]);
  async function submit() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const c = await json<Cohort>(post("/api/cohorts", { name: name.trim() || defaultName(), filter, by: identity }));
      await json<Cohort>(post(`/api/cohorts/${encodeURIComponent(c.id)}`, { action: "submit" }, "PATCH"));
      setMsg(`已提交数据治理（${c.patientIds.length} 例）`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">队列圈选</h1>
      <div className="grid grid-cols-[1fr_18rem] gap-4">
        <Card title="筛选条件"><CohortFilterForm value={form} onChange={f => { setForm(f); setMsg(null); }} /></Card>
        <Card title="命中人数" className="h-fit space-y-3">
          <p className="text-4xl font-semibold tabular-nums text-pink-700"><span data-testid="cohort-count">{count ?? "…"}</span><span className="ml-1 text-base font-normal text-gray-500">例</span></p>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-500">队列名称</span>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <p className="text-xs text-gray-400">创建人：{identity}</p>
          <button type="button" data-testid="cohort-submit" disabled={busy} onClick={() => void submit()} className="w-full rounded bg-pink-600 px-3 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50">保存并提交数据治理</button>
          {msg && <p role="status" className="text-sm text-green-700">{msg}</p>}
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        </Card>
      </div>
    </div>
  );
}
