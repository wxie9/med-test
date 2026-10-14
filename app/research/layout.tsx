import { Watermark } from "@/components/Watermark";
import { ResearchNav } from "@/components/research/ResearchNav";
export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col lg:flex-row">
      <aside className="w-full border-b border-gray-200 bg-gray-50 px-3 py-3 lg:w-44 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-4">
        <p className="mb-3 px-3 text-xs font-semibold text-gray-500">药企研究门户</p>
        <ResearchNav />
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-gray-200 px-4 py-2 sm:px-6"><p className="text-sm text-gray-500">去标识化研究快照 · 合成数据 · 演示用</p></div>
        <main className="min-w-0 px-4 py-4 [overflow-wrap:anywhere] sm:px-6">{children}</main>
      </div>
      <Watermark />
    </div>
  );
}
