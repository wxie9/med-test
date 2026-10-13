"use client";
import { useEffect, useRef, useState } from "react";
import { MODE_LABELS } from "@/components/ModeBadge";
import type { AgentKind, ChatContext, ChatMessage, ChatResponse, ToolCallRecord } from "@/lib/agents/types";
type Entry = { role: "user"; content: string } | { role: "assistant"; content: string; reply: ChatResponse } | { role: "error"; content: string };
const TITLES: Record<AgentKind, string> = { patient: "患者管家", doctor: "医生助手", research: "研究助手" };
const MAX_SENT = 20;
/** At most the last MAX_SENT messages, starting with a user turn. */
const recent = (ms: ChatMessage[]) => { const r = ms.slice(-MAX_SENT); return r[0]?.role === "assistant" ? r.slice(1) : r; };
const fmtArgs = (args: unknown) => args && typeof args === "object" ? Object.entries(args).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ") : "";
function Reply({ reply }: { reply: ChatResponse }) {
  return (
    <div data-testid="agent-reply" className="max-w-[95%] rounded-lg bg-gray-100 px-3 py-2 text-gray-800">
      <p className="whitespace-pre-wrap">{reply.text}</p>
      {reply.citations.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-gray-200 pt-1 text-[11px] text-gray-500">
          {reply.citations.map(c => <li key={c.id}>{c.id} · {c.title} {c.version} · 待专家审阅</li>)}
        </ul>
      )}
      {reply.toolCalls.length > 0 && (
        <details className="mt-1 text-[11px] text-gray-500">
          <summary className="cursor-pointer select-none">工具调用（{reply.toolCalls.length}）</summary>
          <ul className="mt-0.5 space-y-0.5 break-all font-mono">{reply.toolCalls.map((t: ToolCallRecord, i) => <li key={i}>工具：{t.name}({fmtArgs(t.args)})</li>)}</ul>
        </details>
      )}
    </div>
  );
}
/** Compact chat panel for one assistant: mode + degrade notice, scrollable messages, quick questions, free text. */
export function AgentPanel({ agent, context, quickQuestions }: { agent: AgentKind; context: ChatContext; quickQuestions: string[] }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [entries, loading]);
  const last = [...entries].reverse().find((e): e is Extract<Entry, { role: "assistant" }> => e.role === "assistant")?.reply;
  async function send(text: string) {
    const content = text.trim(); if (!content || loading) return;
    const history: ChatMessage[] = entries.filter((e): e is Exclude<Entry, { role: "error" }> => e.role !== "error").map(e => ({ role: e.role, content: e.content }));
    setEntries(es => [...es, { role: "user", content }]); setInput(""); setLoading(true);
    try {
      const r = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent, context, messages: recent([...history, { role: "user", content }]) }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const reply = (await r.json()) as ChatResponse;
      setEntries(es => [...es, { role: "assistant", content: reply.text, reply }]);
    } catch (e) {
      setEntries(es => [...es, { role: "error", content: `发送失败：${e instanceof Error ? e.message : String(e)}` }]);
    } finally { setLoading(false); }
  }
  return (
    <section aria-label={TITLES[agent]} className="flex h-[600px] flex-col rounded-xl border border-gray-200 bg-white text-sm">
      <header className="border-b border-gray-100 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-gray-800">{TITLES[agent]}</h2>
          <span className="text-xs text-gray-500" data-testid="agent-mode">模式：{last ? MODE_LABELS[last.mode] : "待首次回复"}</span>
        </div>
        {last?.degraded && <p role="status" className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{last.degraded}</p>}
      </header>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {entries.length === 0 && <p className="text-xs text-gray-400">可点击下方快捷问题或直接输入。回答仅供演示，不替代医生意见。</p>}
        {entries.map((e, i) => e.role === "user"
          ? <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-pink-600 px-3 py-2 text-white">{e.content}</div>
          : e.role === "assistant" ? <Reply key={i} reply={e.reply} />
          : <p key={i} role="alert" className="text-xs text-red-600">{e.content}</p>)}
        {loading && <p className="text-xs text-gray-400" aria-live="polite">正在思考…</p>}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-gray-100 px-3 pt-2">
        {quickQuestions.map(q => (
          <button key={q} type="button" disabled={loading} onClick={() => void send(q)}
            className="rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-left text-xs text-pink-700 hover:bg-pink-100 disabled:opacity-50">{q}</button>
        ))}
      </div>
      <form className="flex gap-2 p-3" onSubmit={e => { e.preventDefault(); void send(input); }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="输入问题…" aria-label="输入问题"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-pink-400 focus:outline-none" />
        <button type="submit" disabled={loading || !input.trim()} className="rounded-lg bg-pink-600 px-3 py-1.5 text-white disabled:opacity-50">发送</button>
      </form>
    </section>
  );
}
