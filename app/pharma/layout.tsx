import Link from "next/link";
export default function PharmaLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6"><nav aria-label="药企项目导航" className="flex flex-wrap gap-5 text-sm"><Link className="text-pink-700 underline" href="/pharma/projects">支持服务项目</Link><Link className="text-gray-700 underline" href="/research">研究演示</Link></nav>{children}</main>;
}
