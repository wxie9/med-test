"use client";
import { useEffect, useState } from "react";
import type { ResearchResult, UseCase } from "@/lib/research/usecases";
import type { SnapshotSummary } from "@/lib/state/store";
/** Fetches one research use case plus the snapshot's summary once per snapshotId (snapshots are immutable, no polling). */
export function useResearch<U extends UseCase>(useCase: U, snapshotId: string) {
  const [state, setState] = useState<{ key: string; data: ResearchResult[U] | null; snapshot: SnapshotSummary | null; error: string | null }>({ key: "", data: null, snapshot: null, error: null });
  const key = `${useCase}:${snapshotId}`;
  useEffect(() => {
    let cancelled = false;
    const id = encodeURIComponent(snapshotId);
    Promise.all([
      fetch(`/api/research/${useCase}?snapshotId=${id}`, { cache: "no-store" }).then(async r => {
        if (r.status === 404) throw new Error(`快照 ${snapshotId} 不存在（可能已重置演示数据）`);
        if (!r.ok) throw new Error(`加载失败（${r.status}）`);
        return (await r.json()) as ResearchResult[U];
      }),
      fetch("/api/state", { cache: "no-store" }).then(async r => r.ok ? ((await r.json()) as { snapshots: SnapshotSummary[] }).snapshots.find(s => s.id === snapshotId) ?? null : null),
    ])
      .then(([data, snapshot]) => { if (!cancelled) setState({ key, data, snapshot, error: null }); })
      .catch(e => { if (!cancelled) setState({ key, data: null, snapshot: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [useCase, snapshotId, key]);
  return state.key === key ? state : { key, data: null, snapshot: null, error: null };
}
