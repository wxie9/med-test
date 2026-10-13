"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const VIEWS = [
  { href: "/patient", label: "患者端", prefix: "/patient" },
  { href: "/clinic/alerts", label: "医生工作台", prefix: "/clinic" },
  { href: "/governance", label: "数据治理", prefix: "/governance" },
  { href: "/research", label: "药企研究", prefix: "/research" },
];

export function ViewSwitcher() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="演示视角切换" className="flex flex-wrap items-center gap-2 text-sm">
      <Link href="/" className="font-semibold mr-2">演示视角切换</Link>
      {VIEWS.map(v => {
        const active = pathname === v.prefix || pathname.startsWith(`${v.prefix}/`);
        return (
          <Link
            key={v.href}
            href={v.href}
            aria-current={active ? "page" : undefined}
            className={`rounded px-3 py-1 border ${active ? "bg-pink-600 text-white border-pink-600" : "border-gray-300 hover:bg-gray-100"}`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
