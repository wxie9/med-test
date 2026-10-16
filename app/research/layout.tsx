import { Watermark } from "@/components/Watermark";
import { ResearchNav } from "@/components/research/ResearchNav";
export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <p className="sidebar-title">研究支线 / 药企研究门户</p>
        <ResearchNav />
      </aside>
      <div className="workspace-body">
        <div className="workspace-context"><p>去标识化研究快照 · 合成数据 · 演示用</p></div>
        <main className="workspace-content">{children}</main>
      </div>
      <Watermark />
    </div>
  );
}
