import { GovernanceNav } from "@/components/governance/GovernanceNav";
export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      <aside className="w-44 shrink-0 border-r border-gray-200 bg-gray-50 px-3 py-4">
        <p className="mb-3 px-3 text-xs font-semibold text-gray-500">数据治理台</p>
        <GovernanceNav />
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-gray-200 px-6 py-2"><p className="text-sm text-gray-500">合成数据 · 演示用</p></div>
        <main className="px-6 py-4">{children}</main>
      </div>
    </div>
  );
}
