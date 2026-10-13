import type { Metadata } from "next";
import "./globals.css";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { ModeBadge } from "@/components/ModeBadge";

export const metadata: Metadata = {
  title: "乳腺癌全生命周期平台 · 演示版",
  description: "合成数据，仅用于演示",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-3">
          <ViewSwitcher />
          <ModeBadge />
        </header>
        {children}
      </body>
    </html>
  );
}
