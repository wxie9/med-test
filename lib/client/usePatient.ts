"use client";
import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from "react";
import type { Alert, FollowUpTask, Patient, PatientMessage } from "@/lib/domain/types";
export type PatientView = { patient: Patient; alerts: Alert[]; tasks: FollowUpTask[]; messages: PatientMessage[]; today: string };
/** Polls one patient; retained mutation callbacks belong only to the visit that created them. */
export function usePatient(id: string, pollMs = 3000) {
  const url = `/api/patients/${encodeURIComponent(id)}`;
  const context = useMemo(() => ({ url, generation: 0, request: 0, active: false, inFlight: false }), [url]);
  const current = useRef(context);
  const [state, setState] = useState<{ context: typeof context; data: PatientView | null; error: Error | null }>({ context, data: null, error: null });
  const refresh = useCallback(async () => {
    if (current.current !== context || !context.active) return;
    const generation = context.generation;
    const request = ++context.request;
    const isCurrent = () => current.current === context && context.active && context.generation === generation && context.request === request;
    context.inFlight = true;
    try {
      const r = await fetch(context.url, { cache: "no-store" });
      if (!r.ok) throw new Error(`GET ${context.url} failed: ${r.status}`);
      const data = (await r.json()) as PatientView;
      if (isCurrent()) setState({ context, data, error: null });
    } catch (e) {
      if (isCurrent()) setState(previous => ({ context, data: previous.context === context ? previous.data : null, error: e instanceof Error ? e : new Error(String(e)) }));
    } finally {
      if (isCurrent()) context.inFlight = false;
    }
  }, [context]);
  // A suspended render must not revoke requests for the still-visible patient.
  useLayoutEffect(() => { current.current = context; }, [context]);
  // Suspense hiding replays layout effects but preserves this request lifecycle.
  useEffect(() => {
    context.active = true;
    void refresh();
    const timer = setInterval(() => { if (!context.inFlight) void refresh(); }, pollMs);
    return () => {
      clearInterval(timer);
      context.active = false;
      context.generation++;
      context.inFlight = false;
    };
  }, [context, refresh, pollMs]);
  return { data: state.context === context ? state.data : null, error: state.context === context ? state.error : null, refresh };
}
