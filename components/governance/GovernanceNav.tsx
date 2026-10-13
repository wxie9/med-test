"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const LINKS = [{ href: "/governance", label: "候选队列" }, { href: "/governance/snapshots", label: "研究快照" }, { href: "/governance/his", label: "HIS 接口" }];
export function GovernanceNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="数据治理导航" className="flex flex-col gap-1 text-sm">
      {LINKS.map(l => {
        const active = pathname === l.href;
        return <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={`rounded px-3 py-2 ${active ? "bg-pink-50 font-semibold text-pink-700" : "text-gray-700 hover:bg-gray-100"}`}>{l.label}</Link>;
      })}
    </nav>
  );
}
