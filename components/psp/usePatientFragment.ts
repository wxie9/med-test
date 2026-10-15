"use client";
import { useEffect, useRef } from "react";

/** Consume a navigation's fragment only after its current patient DTO has rendered. */
export function usePatientFragment(patientId: string, seedVersion: number | undefined, targetIds: string[]) {
  const navigation = useRef<{ patientId: string; hash: string; consumed: boolean } | null>(null);
  useEffect(() => {
    const reachTarget = () => {
      const hash = window.location.hash;
      if (navigation.current?.patientId !== patientId || navigation.current.hash !== hash) {
        navigation.current = { patientId, hash, consumed: false };
      }
      if (seedVersion === undefined || navigation.current.consumed) return;
      // An absent/unauthorized target is also final for this navigation: polling
      // must not later revive an arbitrary hash or steal the user's focus.
      navigation.current.consumed = true;
      let id: string;
      try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
      if (!targetIds.includes(id)) return;
      const target = document.getElementById(id);
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    };
    reachTarget();
    window.addEventListener("hashchange", reachTarget);
    return () => window.removeEventListener("hashchange", reachTarget);
  }, [patientId, seedVersion, targetIds]);
}
