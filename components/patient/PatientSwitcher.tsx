"use client";
import { usePatientId, useSetPatientId } from "@/lib/client/patientContext";
const OPTIONS = [{ id: "P-A", label: "患者 A（王女士）" }, { id: "P-B", label: "患者 B（李女士）" }];
export function PatientSwitcher() {
  const current = usePatientId(); const setPatientId = useSetPatientId();
  return (
    <div role="group" aria-label="切换演示患者" className="patient-switcher">
      <span className="text-gray-600">切换演示患者：</span>
      {OPTIONS.map(o => (
        <button key={o.id} type="button" onClick={() => setPatientId(o.id)} aria-pressed={current === o.id}
          className={`ui-button ${current === o.id ? "ui-button-primary" : ""}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
