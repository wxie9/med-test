import { ClinicIdentityProvider } from "@/lib/client/clinicIdentity";
import { ClinicNav, IdentitySwitch } from "@/components/clinic/ClinicNav";
export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicIdentityProvider>
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-57px)]">
        <aside className="w-full lg:w-44 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-50 px-3 py-4">
          <p className="mb-3 px-3 text-xs font-semibold text-gray-500">医生工作台</p>
          <ClinicNav />
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2 items-center justify-between border-b border-gray-200 px-4 sm:px-6 py-2">
            <p className="text-sm text-gray-500">合成数据 · 演示用</p>
            <IdentitySwitch />
          </div>
          <main className="px-4 sm:px-6 py-4">{children}</main>
        </div>
      </div>
    </ClinicIdentityProvider>
  );
}
