"use client";
import { useEffect, useState, useCallback, useRef } from "react";
export function useDemoState<T = unknown>(pollMs = 3000, include?: "patients") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const seq = useRef(0); // id of the most recently issued request; only its response is applied
  const inFlight = useRef(false);
  const url = include ? `/api/state?include=${include}` : "/api/state";
  const refresh = useCallback(async () => {
    const id = ++seq.current;
    inFlight.current = true;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`GET ${url} failed: ${r.status}`);
      const json = (await r.json()) as T;
      if (id === seq.current) { setData(json); setError(null); }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (id === seq.current) inFlight.current = false;
    }
  }, [url]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (!inFlight.current) void refresh(); }, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);
  return { data, error, refresh };
}
