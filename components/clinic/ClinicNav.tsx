"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClinicIdentity } from "@/lib/client/clinicIdentity";
import { IDENTITIES, type ClinicIdentity } from "@/lib/clinic/labels";
const LINKS = [
  { href: "/clinic/projects/PSP-BC-ENDO-001/services", label: "PSP 服务台" },
  { href: "/clinic/alerts", label: "预警队列" }, { href: "/clinic/patients", label: "患者列表" }, { href: "/clinic/tasks", label: "随访任务" },
  { href: "/clinic/cohorts", label: "队列圈选" }, { href: "/clinic/candidates", label: "候选核查" },
];
export function ClinicNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="医生工作台导航" className="flex flex-wrap gap-1 text-sm lg:flex-col">
      {LINKS.map(l => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={`rounded px-3 py-2 ${active ? "bg-pink-50 font-semibold text-pink-700" : "text-gray-700 hover:bg-gray-100"}`}>{l.label}</Link>;
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
