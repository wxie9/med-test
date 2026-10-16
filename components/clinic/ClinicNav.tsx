"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClinicIdentity } from "@/lib/client/clinicIdentity";
import { IDENTITIES, type ClinicIdentity } from "@/lib/clinic/labels";
import { Icon, type IconName } from "@/components/ui/Icon";
const LINKS = [
  { href: "/clinic/projects/PSP-BC-ENDO-001/services", label: "PSP 服务台", icon: "project" },
  { href: "/clinic/alerts", label: "预警队列", icon: "alert" }, { href: "/clinic/patients", label: "患者列表", icon: "people" }, { href: "/clinic/tasks", label: "随访任务", icon: "calendar" },
  { href: "/clinic/cohorts", label: "队列圈选", icon: "filter" }, { href: "/clinic/candidates", label: "候选核查", icon: "search" },
] satisfies { href: string; label: string; icon: IconName }[];
export function ClinicNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="医生工作台导航" className="sidebar-nav">
      {LINKS.map(l => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className="sidebar-link"><Icon name={l.icon} size={18}/>{l.label}</Link>;
      })}
    </nav>
  );
}
export function IdentitySwitch() {
  const { identity, setIdentity } = useClinicIdentity();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">模拟身份</span>
      <select value={identity} onChange={e => setIdentity(e.target.value as ClinicIdentity)} aria-label="切换身份" className="rounded border border-gray-300 px-2 py-1">
        {IDENTITIES.map(i => <option key={i}>{i}</option>)}
      </select>
    </label>
  );
}
