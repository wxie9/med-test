import { ClinicIdentityProvider } from "@/lib/client/clinicIdentity";
import { ClinicNav, IdentitySwitch } from "@/components/clinic/ClinicNav";
export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicIdentityProvider>
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <p className="sidebar-title">院内服务 / 医生工作台</p>
          <ClinicNav />
        </aside>
        <div className="workspace-body">
          <div className="workspace-context">
            <p className="text-sm text-gray-500">合成数据 · 演示用</p>
            <IdentitySwitch />
          </div>
          <main className="workspace-content">{children}</main>
        </div>
      </div>
    </ClinicIdentityProvider>
  );
}
