"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const TABS = [
  { href: "/patient", label: "首页", icon: "⌂" },
  { href: "/patient/pro", label: "问卷", icon: "✎" },
  { href: "/patient/plan", label: "计划", icon: "▦" },
  { href: "/patient/adherence", label: "打卡", icon: "✓" },
  { href: "/patient/messages", label: "消息", icon: "✉" },
  { href: "/patient/assistant", label: "管家", icon: "☺" },
];
/** 390×844 phone mock: status bar, scrollable content, bottom tab bar. */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/patient";
  return (
    <div className="flex h-[844px] w-[390px] shrink-0 flex-col overflow-hidden rounded-[44px] border-[10px] border-gray-900 bg-gray-50 shadow-xl">
      <div className="flex items-center justify-between bg-white px-6 pt-2 pb-1 text-xs font-semibold text-gray-800" aria-hidden>
        <span>9:41</span>
        <span>5G ▮▮▮ 100%</span>
      </div>
      <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      <nav aria-label="患者端导航" className="grid grid-cols-6 border-t border-gray-200 bg-white pb-3 pt-1">
        {TABS.map(t => {
          const active = t.href === "/patient" ? pathname === "/patient" : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${active ? "text-pink-600 font-semibold" : "text-gray-500"}`}>
              <span className="text-base leading-none" aria-hidden>{t.icon}</span>{t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
