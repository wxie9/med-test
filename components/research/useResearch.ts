"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useResearchState } from "@/lib/client/useDemoState";
import type { ResearchState } from "@/lib/state/store";
import type { ResearchResult, UseCase } from "@/lib/research/usecases";
/** Fetch once per snapshot and seed generation; poll only the small research state for reset detection. */
export function useResearch<U extends UseCase>(useCase: U, snapshotId: string) {
  const { data: researchState, error: stateError } = useResearchState<ResearchState>(3000);
  const [state, setState] = useState<{ key: string; data: ResearchResult[U] | null; error: string | null }>({ key: "", data: null, error: null });
  const key = `${researchState?.seedVersion ?? "pending"}:${useCase}:${snapshotId}`;
  const available = !!researchState?.snapshots.some(snapshot => snapshot.id === snapshotId);
  const current = useRef({ key, available });
  useLayoutEffect(() => { current.current = { key, available }; }, [key, available]);
  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && current.current.key === key && current.current.available;
    fetch(`/api/research/${useCase}?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" })
      .then(async r => {
        if (r.status === 404) throw new Error(`快照 ${snapshotId} 不存在（可能已重置演示数据）`);
        if (!r.ok) throw new Error(`加载失败（${r.status}）`);
        return (await r.json()) as ResearchResult[U];
      })
      .then(data => { if (isCurrent()) setState({ key, data, error: null }); })
      .catch(e => { if (isCurrent()) setState({ key, data: null, error: e instanceof Error ? e.message : String(e) }); });
    return () => { cancelled = true; };
  }, [useCase, snapshotId, key, available]);
  if (!available) return { key, data: null, error: researchState ? `快照 ${snapshotId} 不存在（可能已重置演示数据）` : stateError?.message ?? null, researchState };
  return { ...(state.key === key ? state : { key, data: null, error: null }), researchState };
}
