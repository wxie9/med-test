"use client";
import { createContext, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
const STORAGE_KEY = "demo.patientId";
const DEFAULT_ID = "P-A";
type Ctx = { patientId: string; setPatientId: (id: string) => void };
const PatientContext = createContext<Ctx>({ patientId: DEFAULT_ID, setPatientId: () => {} });
function persist(id: string) { try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ } }
/** URL patient selection follows route changes and takes precedence over saved demo selection. */
function SearchParamSync({ onPatient }: { onPatient: (id: string) => void }) {
  const params = useSearchParams();
  const fromUrl = params.get("patient");
  useEffect(() => { if (fromUrl) onPatient(fromUrl); }, [fromUrl, onPatient]);
  return null;
}
export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [patientId, setId] = useState(DEFAULT_ID);
  useEffect(() => {
    try { const fromUrl = new URLSearchParams(window.location.search).get("patient");
      if (fromUrl) { setId(fromUrl); persist(fromUrl); return; }
      const saved = localStorage.getItem(STORAGE_KEY); if (saved) setId(saved); } catch { /* storage unavailable */ }
  }, []);
  const setPatientId = useCallback((id: string) => { setId(id); persist(id); }, []);
  return (
    <PatientContext.Provider value={{ patientId, setPatientId }}>
      <Suspense fallback={null}><SearchParamSync onPatient={setPatientId} /></Suspense>
      {children}
    </PatientContext.Provider>
  );
}
export const usePatientId = () => useContext(PatientContext).patientId;
export const useSetPatientId = () => useContext(PatientContext).setPatientId;
