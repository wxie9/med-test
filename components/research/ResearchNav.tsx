"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
const SECTIONS = [{ seg: "overview", label: "概览" }, { seg: "patterns", label: "治疗模式" }, { seg: "feasibility", label: "入组可行性" }, { seg: "adherence", label: "依从性" }];
/** Snapshot id from /research/<id>/<section>; "sandbox" is a static sibling route, not a snapshot. */
function snapshotFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/research\/([^/]+)\/[^/]+/);
  return m && m[1] !== "sandbox" ? decodeURIComponent(m[1]) : null;
}
const linkCls = (active: boolean) => `rounded px-3 py-2 ${active ? "bg-pink-50 font-semibold text-pink-700" : "text-gray-700 hover:bg-gray-100"}`;
export function ResearchNav() {
  const pathname = usePathname() ?? "";
  const current = snapshotFromPath(pathname);
  // The layout persists across child navigations, so the last opened snapshot stays selected (e.g. while on the sandbox page).
  const [last, setLast] = useState<string | null>(current);
  if (current && current !== last) setLast(current);
  const selected = current ?? last;
  return (
    <nav aria-label="药企研究导航" className="flex flex-col gap-1 text-sm">
      <Link href="/research" aria-current={pathname === "/research" ? "page" : undefined} className={linkCls(pathname === "/research")}>快照列表</Link>
      <p className="mt-2 px-3 text-xs text-gray-400">{selected ? "当前快照" : "请先选择快照"}</p>
      {SECTIONS.map(s => {
        if (!selected) return <span key={s.seg} className="px-3 py-2 text-gray-300">{s.label}</span>;
        const href = `/research/${encodeURIComponent(selected)}/${s.seg}`;
        const active = pathname === href;
        return <Link key={s.seg} href={href} aria-current={active ? "page" : undefined} className={linkCls(active)}>{s.label}</Link>;
      })}
      <Link href="/research/sandbox" aria-current={pathname === "/research/sandbox" ? "page" : undefined} className={`mt-2 ${linkCls(pathname === "/research/sandbox")}`}>分析沙箱 <span className="text-xs text-gray-400">[后续]</span></Link>
    </nav>
  );
}
