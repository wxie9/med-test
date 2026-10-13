"use client";
import { useEffect, useState, useCallback } from "react";
export function useDemoState<T = unknown>(pollMs = 3000) {
  const [data, setData] = useState<T | null>(null);
  const refresh = useCallback(async () => { const r = await fetch("/api/state", { cache: "no-store" }); setData(await r.json()); }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, pollMs); return () => clearInterval(t); }, [refresh, pollMs]);
  return { data, refresh };
}
