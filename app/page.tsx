"use client";
import Link from "next/link";
import { useState } from "react";
import { useDemoState } from "@/lib/client/useDemoState";
import type { Manifest } from "@/lib/seed/load";
import { clearDemoStorage } from "@/lib/client/messageSeen";

type StateSummary = { manifest: Manifest; seedVersion: number; patientCount: number };

const CARDS = [
  { href: "/patient", title: "患者端", desc: "随访提醒、PRO 填报与消息" },
  { href: "/clinic/alerts", title: "医生工作台", desc: "预警处理与随访任务" },
  { href: "/governance", title: "数据治理", desc: "数据缺口与质控任务" },
  { href: "/pharma/projects", title: "药企项目", desc: "支持服务项目与授权汇总" },
];

export default function Home() {
  const { data, refresh } = useDemoState<StateSummary>();
  const [resetting, setResetting] = useState(false);

  async function onReset() {
    setResetting(true);
    try {
      await fetch("/api/reset", { method: "POST" });
      try { clearDemoStorage(localStorage); } catch { /* storage unavailable */ } // patient choice, clinic identity and seen messages
      await refresh();
    } finally {
      setResetting(false);
    }
  }

  const m = data?.manifest;
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">乳腺癌全生命周期平台 · 演示版</h1>
        <p className="text-sm text-gray-600">全部为合成数据，仅用于演示。选择一个视角开始。</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(c => (
          <Link key={c.href} href={c.href} className="rounded-lg border border-gray-200 p-4 hover:border-pink-500 hover:shadow-sm">
            <h2 className="font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm text-gray-600">{c.desc}</p>
          </Link>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          data-testid="reset-button"
          onClick={onReset}
          disabled={resetting}
          className="rounded bg-pink-600 px-4 py-2 text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {resetting ? "重置中…" : "一键重置"}
        </button>
        <Link href="/demo-script" className="text-sm text-pink-700 underline">演示脚本</Link>
      </section>

      <section className="rounded-lg border border-gray-200 p-4 text-sm">
        <h2 className="mb-2 font-semibold">数据清单（manifest）</h2>
        {m ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-gray-500">状态版本</dt><dd data-testid="seed-version">{data.seedVersion}</dd>
            <dt className="text-gray-500">种子</dt><dd>{m.seed}</dd>
            <dt className="text-gray-500">版本</dt><dd>{m.version}</dd>
            <dt className="text-gray-500">checksum</dt><dd className="font-mono break-all">{m.checksum}</dd>
            <dt className="text-gray-500">数据截止日</dt><dd>{m.cutoff}</dd>
            <dt className="text-gray-500">数量</dt>
            <dd>{Object.entries(m.counts).map(([k, v]) => `${k}: ${v}`).join("，")}（已加载患者 {data.patientCount}）</dd>
          </dl>
        ) : (
          <p className="text-gray-500">加载中…</p>
        )}
      </section>
    </main>
  );
}
