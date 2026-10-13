"use client";
import { useEffect, useState } from "react";
import { QualityMetricsView, type QualityMetrics } from "@/components/governance/QualityMetricsView";
import { COHORT_STATUS } from "@/lib/governance/labels";
import { fmtDateTime } from "@/lib/clinic/labels";
import type { CohortSummary, SnapshotSummary } from "@/lib/state/store";
/** One submitted cohort: server-computed quality metrics plus snapshot creation. */
export function CohortGovernanceCard({ cohort, snapshots, defaultCutoff, onCreated }: { cohort: CohortSummary; snapshots: SnapshotSummary[]; defaultCutoff: string; onCreated: () => Promise<void> }) {
  const [q, setQ] = useState<QualityMetrics | null>(null);
  const [cutoff, setCutoff] = useState(defaultCutoff);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cohorts/${encodeURIComponent(cohort.id)}/quality`, { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error(`质量指标加载失败（${r.status}）`); return r.json() as Promise<QualityMetrics>; })
      .then(j => { if (!cancelled) setQ(j); })
      .catch(e => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [cohort.id]);
  async function create() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/snapshots", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cohortId: cohort.id, cutoff }) });
      if (!r.ok) throw new Error(`创建快照失败（${r.status}）`);
      await onCreated(); // refreshed state lists the new snapshot id under this cohort
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <section data-testid="cohort-card" className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{cohort.name}</h2>
        <p className="text-sm text-gray-500">创建人 {cohort.createdBy} · <span className="tabular-nums">{cohort.patientCount}</span> 例 · {COHORT_STATUS[cohort.status]} · {fmtDateTime(cohort.createdAt)}</p>
      </div>
      {q ? <QualityMetricsView q={q} /> : <p className="text-sm text-gray-400">质量指标计算中…</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-sm">
        <label className="flex items-center gap-2"><span className="text-gray-500">数据截止日</span>
          <input type="date" value={cutoff} onChange={e => setCutoff(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
        </label>
        <button type="button" data-testid="create-snapshot" disabled={busy || !cutoff} onClick={() => void create()} className="rounded bg-pink-600 px-3 py-1.5 font-semibold text-white hover:bg-pink-700 disabled:opacity-50">创建研究快照</button>
        {err && <p role="alert" className="text-red-600">{err}</p>}
      </div>
      {snapshots.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="本队列研究快照">
          {snapshots.map(s => <li key={s.id} className="text-gray-700">研究快照 <span data-testid="snapshot-id" className="font-mono">{s.id}</span> · 截止 {s.cutoff} · {s.patientCount} 例（已剔除未同意药企去标识化使用者）</li>)}
        </ul>
      )}
    </section>
  );
}
