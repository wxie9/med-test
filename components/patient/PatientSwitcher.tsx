"use client";
import { usePatientId, useSetPatientId } from "@/lib/client/patientContext";
const OPTIONS = [{ id: "P-A", label: "患者 A（王女士）" }, { id: "P-B", label: "患者 B（李女士）" }];
export function PatientSwitcher() {
  const current = usePatientId(); const setPatientId = useSetPatientId();
  return (
    <div role="group" aria-label="切换演示患者" className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">切换演示患者：</span>
      {OPTIONS.map(o => (
        <button key={o.id} type="button" onClick={() => setPatientId(o.id)} aria-pressed={current === o.id}
          className={`rounded border px-3 py-1 ${current === o.id ? "border-pink-600 bg-pink-600 text-white" : "border-gray-300 hover:bg-gray-100"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
