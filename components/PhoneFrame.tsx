"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
const TABS = [
  { href: "/patient", label: "首页", icon: "home" },
  { href: "/patient/pro", label: "问卷", icon: "form" },
  { href: "/patient/plan", label: "计划", icon: "calendar" },
  { href: "/patient/adherence", label: "打卡", icon: "check" },
  { href: "/patient/messages", label: "消息", icon: "message" },
  { href: "/patient/assistant", label: "管家", icon: "assistant" },
] satisfies { href: string; label: string; icon: IconName }[];
/** 390×844 phone mock: status bar, scrollable content, bottom tab bar. */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/patient";
  return (
    <div className="phone-frame">
      <div className="phone-status" aria-hidden>
        <span>9:41</span>
        <span>5G ▮▮▮ 100%</span>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      <nav aria-label="患者端导航" className="patient-tabs">
        {TABS.map(t => {
          const active = t.href === "/patient" ? pathname === "/patient" : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className="patient-tab">
              <Icon name={t.icon} size={20}/>{t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
