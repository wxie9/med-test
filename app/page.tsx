"use client";
import Link from "next/link";
import { useState } from "react";
import { useDemoState } from "@/lib/client/useDemoState";
import type { Manifest } from "@/lib/seed/load";
import { clearDemoStorage } from "@/lib/client/messageSeen";
import { Icon, type IconName } from "@/components/ui/Icon";

type StateSummary = { manifest: Manifest; seedVersion: number; patientCount: number };

const CARDS = [
  { href: "/patient", title: "患者端", desc: "随访提醒、PRO 填报与消息", icon: "patient" },
  { href: "/clinic/alerts", title: "医生工作台", desc: "预警处理、患者服务与随访任务", icon: "clinic" },
  { href: "/governance", title: "数据治理", desc: "数据缺口、质控任务与报告审核", icon: "data" },
  { href: "/pharma/projects", title: "药企项目", desc: "支持服务项目、授权汇总与阶段交付", icon: "project" },
] satisfies { href: string; title: string; desc: string; icon: IconName }[];

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
    <main className="home-workspace">
      <div className="home-intro">
        <div>
          <h1>乳腺癌全生命周期平台</h1>
          <p>连接患者支持、院内服务与项目交付。选择一个视角开始。</p>
        </div>
        <span className="demo-label"><Icon name="shield" size={14}/>合成数据 · 演示版</span>
      </div>

      <div className="home-columns">
        <section className="ui-panel entry-panel" aria-labelledby="entry-heading">
          <div className="entry-panel-heading"><h2 id="entry-heading" className="panel-heading">进入工作空间</h2><span className="text-xs text-gray-500">四个演示视角</span></div>
          {CARDS.map(c => (
            <Link key={c.href} href={c.href} className="entry-row">
              <span className="entry-icon"><Icon name={c.icon} size={23}/></span>
              <div><h3>{c.title}</h3><p>{c.desc}</p></div>
              <Icon name="arrow" size={18} className="entry-arrow"/>
            </Link>
          ))}
        </section>
        <aside className="ui-panel demo-guide" aria-labelledby="guide-heading">
          <div><h2 id="guide-heading" className="panel-heading">从服务到交付</h2><p>沿患者支持项目主线，体验多角色协作与阶段报告的完整流程。</p></div>
          <div className="demo-flow" aria-label="演示流程"><span>患者反馈</span><Icon name="arrow" size={14}/><span>医护服务</span><Icon name="arrow" size={14}/><span>审核交付</span></div>
          <Link href="/demo-script" className="ui-button ui-button-primary"><Icon name="book" size={16}/>演示脚本<Icon name="arrow" size={15}/></Link>
          <div className="demo-tools">
            <h2 className="panel-heading">演示管理</h2>
            <p>重新演示前，可恢复种子数据并清除本机记住的演示身份与已读消息。</p>
            <button type="button" data-testid="reset-button" onClick={onReset} disabled={resetting} className="ui-button mt-4"><Icon name="reset" size={15}/>{resetting ? "重置中…" : "一键重置"}</button>
          </div>
        </aside>
      </div>

      <section className="ui-panel manifest-panel">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="panel-heading">数据清单（manifest）</h2><span className="text-xs text-gray-500">可核对的演示数据基线</span></div>
        {m ? (
          <dl className="manifest-grid">
            <div><dt>数据截止日</dt><dd>{m.cutoff}</dd></div>
            <div><dt>版本</dt><dd>{m.version}</dd></div>
            <div><dt>状态版本</dt><dd data-testid="seed-version">{data.seedVersion}</dd></div>
            <div><dt>种子</dt><dd>{m.seed}</dd></div>
            <div><dt>checksum</dt><dd className="font-mono">{m.checksum}</dd></div>
            <div className="manifest-counts"><dt>数量</dt><dd>{Object.entries(m.counts).map(([k, v]) => `${k}: ${v}`).join("，")}（已加载患者 {data.patientCount}）</dd></div>
          </dl>
        ) : (
          <p role="status" className="mt-5 text-gray-500">加载中…</p>
        )}
      </section>
      <p className="home-footer"><Icon name="shield" size={14}/>全部为合成数据，仅用于演示。身份与服务渠道均为模拟。</p>
    </main>
  );
}
