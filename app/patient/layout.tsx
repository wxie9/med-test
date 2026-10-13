import { PatientProvider } from "@/lib/client/patientContext";
import { PhoneFrame } from "@/components/PhoneFrame";
import { PatientSwitcher } from "@/components/patient/PatientSwitcher";
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <PatientProvider>
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <p className="text-sm text-gray-500">患者端（手机外框演示，正式版为微信小程序）</p>
          <PatientSwitcher />
        </div>
        <PhoneFrame>{children}</PhoneFrame>
      </div>
    </PatientProvider>
  );
}
