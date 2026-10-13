"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import type { Alert, FollowUpTask, Patient, PatientMessage } from "@/lib/domain/types";
export type PatientView = { patient: Patient; alerts: Alert[]; tasks: FollowUpTask[]; messages: PatientMessage[]; today: string };
/** Polls GET /api/patients/:id (one patient only, never the full store). Same race-safe pattern as useDemoState. */
export function usePatient(id: string, pollMs = 3000) {
  const [data, setData] = useState<PatientView | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const seq = useRef(0); // id of the most recently issued request; only its response is applied
  const inFlight = useRef(false);
  const url = `/api/patients/${encodeURIComponent(id)}`;
  const refresh = useCallback(async () => {
    const reqId = ++seq.current;
    inFlight.current = true;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`GET ${url} failed: ${r.status}`);
      const json = (await r.json()) as PatientView;
      if (reqId === seq.current) { setData(json); setError(null); }
    } catch (e) {
      if (reqId === seq.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (reqId === seq.current) inFlight.current = false;
    }
  }, [url]);
  useEffect(() => {
    setData(null);
    void refresh();
    const t = setInterval(() => { if (!inFlight.current) void refresh(); }, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);
  return { data, error, refresh };
}
