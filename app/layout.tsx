import type { Metadata } from "next";
import "./globals.css";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { ModeBadge } from "@/components/ModeBadge";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "乳腺癌全生命周期平台 · 演示版",
  description: "合成数据，仅用于演示",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen">
        <header className="app-header">
          <Link href="/" className="brand-link" aria-label="乳腺癌全生命周期平台首页">
            <span className="brand-mark"><Icon name="care" size={25}/></span>
            <span><span className="brand-name">全程关怀</span><span className="brand-description">乳腺癌全生命周期平台</span></span>
          </Link>
          <ViewSwitcher />
          <ModeBadge />
        </header>
        {children}
      </body>
    </html>
  );
}
