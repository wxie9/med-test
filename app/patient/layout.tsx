import { PatientProvider } from "@/lib/client/patientContext";
import { PhoneFrame } from "@/components/PhoneFrame";
import { PatientSwitcher } from "@/components/patient/PatientSwitcher";
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <PatientProvider>
      <div className="patient-stage">
        <div className="patient-preview-label">
          <p className="text-sm text-gray-500">患者端（手机外框演示，正式版为微信小程序）</p>
          <PatientSwitcher />
        </div>
        <PhoneFrame>{children}</PhoneFrame>
      </div>
    </PatientProvider>
  );
}
