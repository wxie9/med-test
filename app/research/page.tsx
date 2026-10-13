"use client";
import Link from "next/link";
import { useResearchState } from "@/lib/client/useDemoState";
import { fmtDateTime } from "@/lib/clinic/labels";
import type { ResearchState } from "@/lib/state/store";
export default function ResearchSnapshotsPage() {
  const { data, error } = useResearchState<ResearchState>(3000);
  if (!data) return <p className="text-sm text-gray-500">{error ? `加载失败：${error.message}` : "加载中…"}</p>;
  const cohortName = (id: string) => data.cohorts.find(c => c.id === id)?.name ?? "（队列已删除）";
  const snaps = [...data.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">研究快照</h1>
      {snaps.length === 0
        ? <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">请先在数据治理台创建快照</p>
        : <ul className="space-y-2">
            {snaps.map(s => (
              <li key={s.id}>
                <Link href={`/research/${encodeURIComponent(s.id)}/overview`} data-testid="snapshot-item"
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-pink-300 hover:bg-pink-50">
                  <span className="font-mono font-semibold">{s.id}</span>
                  <span className="text-sm text-gray-500">{cohortName(s.cohortId)} · 截止 {s.cutoff} · <span className="tabular-nums">{s.patientCount}</span> 例 · 创建于 {fmtDateTime(s.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>}
    </div>
  );
}
