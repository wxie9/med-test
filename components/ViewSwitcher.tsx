"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const VIEWS = [
  { href: "/patient", label: "患者端", prefix: "/patient", icon: "patient" },
  { href: "/clinic/alerts", label: "医生工作台", prefix: "/clinic", icon: "clinic" },
  { href: "/governance", label: "数据治理", prefix: "/governance", icon: "data" },
  { href: "/pharma/projects", label: "药企项目", prefix: "/pharma", icon: "project" },
] satisfies { href: string; label: string; prefix: string; icon: IconName }[];

export function ViewSwitcher() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="演示视角切换" className="view-switcher">
      {VIEWS.map(v => {
        const active = pathname === v.prefix || pathname.startsWith(`${v.prefix}/`) || (v.prefix === "/pharma" && pathname.startsWith("/research"));
        return (
          <Link
            key={v.href}
            href={v.href}
            aria-current={active ? "page" : undefined}
            className="view-link"
          >
            <Icon name={v.icon} size={16}/>{v.label}
          </Link>
        );
      })}
    </nav>
  );
}
