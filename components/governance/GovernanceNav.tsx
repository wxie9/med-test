"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
const LINKS = [{ href: "/governance", label: "候选队列", icon: "people" }, { href: "/governance/snapshots", label: "研究快照", icon: "data" }, { href: "/governance/his", label: "HIS 接口", icon: "clinic" }, { href: "/governance/projects/PSP-BC-ENDO-001/reports", label: "PSP 月报工作台", icon: "form" }] satisfies { href: string; label: string; icon: IconName }[];
export function GovernanceNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="数据治理导航" className="sidebar-nav">
      {LINKS.map(l => {
        const active = pathname === l.href || (l.href !== "/governance" && pathname.startsWith(`${l.href}/`));
        return <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className="sidebar-link"><Icon name={l.icon} size={18}/>{l.label}</Link>;
      })}
    </nav>
  );
}
