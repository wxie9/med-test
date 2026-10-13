"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { IDENTITIES, type ClinicIdentity } from "@/lib/clinic/labels";
const STORAGE_KEY = "demo.clinicIdentity";
type Ctx = { identity: ClinicIdentity; setIdentity: (v: ClinicIdentity) => void };
const IdentityContext = createContext<Ctx>({ identity: IDENTITIES[0], setIdentity: () => {} });
/** Demo-only identity switch; it only changes the `by` field sent with alert actions. */
export function ClinicIdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setId] = useState<ClinicIdentity>(IDENTITIES[0]);
  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved && (IDENTITIES as readonly string[]).includes(saved)) setId(saved as ClinicIdentity); } catch { /* storage unavailable */ }
  }, []);
  const setIdentity = useCallback((v: ClinicIdentity) => { setId(v); try { localStorage.setItem(STORAGE_KEY, v); } catch { /* storage unavailable */ } }, []);
  return <IdentityContext.Provider value={{ identity, setIdentity }}>{children}</IdentityContext.Provider>;
}
export const useClinicIdentity = () => useContext(IdentityContext);
