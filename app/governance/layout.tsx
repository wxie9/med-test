import { GovernanceNav } from "@/components/governance/GovernanceNav";
export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-4 md:w-44 md:border-r md:border-b-0">
        <p className="mb-3 px-3 text-xs font-semibold text-gray-500">数据治理台</p>
        <GovernanceNav />
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-gray-200 px-3 py-2 sm:px-6"><p className="text-sm text-gray-500">合成数据 · 演示用</p></div>
        <main className="px-3 py-4 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
