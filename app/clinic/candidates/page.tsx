"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CandidateRequestCard } from "@/components/clinic/CandidateRequestCard";
import { useClinicIdentity } from "@/lib/client/clinicIdentity";
import type { ClinicCandidateRequest } from "@/lib/research/candidates";
export default function CandidatesPage() {
  const { identity } = useClinicIdentity();
  const [reqs, setReqs] = useState<ClinicCandidateRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null | undefined>(undefined); // undefined = newest request expanded by default
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++seq.current;
    try {
      const r = await fetch("/api/candidates", { cache: "no-store" });
      if (!r.ok) throw new Error(`加载失败（${r.status}）`);
      const j = (await r.json()) as ClinicCandidateRequest[];
      if (id === seq.current) { setReqs(j); setError(null); }
    } catch (e) { if (id === seq.current) setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 3000); return () => clearInterval(t); }, [refresh]);
  const decide = useCallback(async (requestId: string, patientId: string, status: "confirmed" | "rejected") => {
    const r = await fetch(`/api/candidates/${encodeURIComponent(requestId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ patientId, status, by: identity }) });
    if (!r.ok) throw new Error(`操作失败（${r.status}）`);
    await refresh();
  }, [identity, refresh]);
  if (!reqs) return <p className="text-sm text-gray-500">{error ?? "加载中…"}</p>;
  const sorted = [...reqs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const expandedId = open === undefined ? sorted[0]?.id : open;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">候选核查</h1>
      <p className="text-sm text-gray-500">研究方仅收到人数统计；逐例核查后，确认的患者将在患者端收到研究机会提醒。</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {sorted.length === 0 ? <p className="text-sm text-gray-500">暂无候选核查请求</p> : sorted.map(r => (
        <CandidateRequestCard key={r.id} req={r} expanded={expandedId === r.id}
          onToggle={() => setOpen(expandedId === r.id ? null : r.id)} onDecide={(pid, st) => decide(r.id, pid, st)} />
      ))}
    </div>
  );
}
