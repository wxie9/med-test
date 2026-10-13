"use client";
import { createContext, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
const STORAGE_KEY = "demo.patientId";
const DEFAULT_ID = "P-A";
type Ctx = { patientId: string; setPatientId: (id: string) => void };
const PatientContext = createContext<Ctx>({ patientId: DEFAULT_ID, setPatientId: () => {} });
function persist(id: string) { try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ } }
/** Reads ?patient=<id> once on mount; isolated so useSearchParams sits under its own Suspense boundary. */
function SearchParamSync({ onPatient }: { onPatient: (id: string) => void }) {
  const params = useSearchParams();
  const fromUrl = params.get("patient");
  useEffect(() => { if (fromUrl) onPatient(fromUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount only
  return null;
}
export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [patientId, setId] = useState(DEFAULT_ID);
  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setId(saved); } catch { /* storage unavailable */ }
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
