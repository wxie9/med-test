import { GovernanceNav } from "@/components/governance/GovernanceNav";
export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <p className="sidebar-title">质量管理 / 数据治理台</p>
        <GovernanceNav />
      </aside>
      <div className="workspace-body">
        <div className="workspace-context"><p>合成数据 · 演示用</p></div>
        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
