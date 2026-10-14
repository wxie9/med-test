"use client";
import { useState } from "react";
import type { PatientServiceView } from "@/lib/psp/serviceView";
import { ALERT_KIND } from "@/lib/clinic/labels";
import { buttonClass, formatPspTime } from "./Common";
export const contactOutcomeLabel: Record<string, string> = { reached: "已接通", no_answer: "无人接听", refused: "拒绝联系", channel_unavailable: "渠道不可用" };
export const fieldClass = "mt-1 block w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50 placeholder:text-gray-600";
export function ContactForm({ view, disabled, onRecord }: { view: PatientServiceView; disabled: boolean; onRecord: (body: Record<string, unknown>, version: number) => void }) {
 const plans = view.assignments.filter(a => a.kind === "contact" && a.status === "open").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
 const [assignmentId, setAssignmentId] = useState(plans[0]?.id ?? ""), [alertIds, setAlertIds] = useState<string[]>([]);
 const [channel, setChannel] = useState("phone"), [outcome, setOutcome] = useState("reached");
 const selected = plans.find(a => a.id === assignmentId);
 const available = view.alerts.filter(a => a.status !== "closed");
 return <form data-testid="psp-contact-form" className="space-y-3 border-t border-gray-200 pt-4" onSubmit={e => { e.preventDefault(); if (!disabled && (selected || alertIds.length)) onRecord({ enrollmentId: view.enrollment.id, ...(selected ? { assignmentId: selected.id } : {}), alertIds, channel, outcome }, selected?.version ?? view.enrollment.version); }}>
  <h3 className="font-semibold">记录一次实际联系</h3><p className="text-sm text-gray-600">一次电话可覆盖多个预警。无人接听会保留联系尝试，不完成计划或关闭预警。</p>
  <fieldset disabled={disabled} className="space-y-3">
   <label className="block text-sm">关联固定联系计划<select aria-label="关联固定联系计划" className={fieldClass} value={selected?.id ?? ""} onChange={e => setAssignmentId(e.target.value)}><option value="">仅关联本次所选预警</option>{plans.map(a => <option key={a.id} value={a.id}>{a.title} · {formatPspTime(a.dueAt)}</option>)}</select></label>
   <fieldset><legend className="text-sm font-medium">本次覆盖的预警（可多选）</legend>{available.length ? available.map(a => <label key={a.id} className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" aria-label={`联系覆盖：${ALERT_KIND[a.kind]} · ${a.rule}`} checked={alertIds.includes(a.id)} onChange={e => setAlertIds(old => e.target.checked ? [...old, a.id] : old.filter(id => id !== a.id))} className="mt-1 accent-pink-600" /><span>{ALERT_KIND[a.kind]} · {a.rule}</span></label>) : <p className="text-sm text-gray-600">暂无待处理的项目预警，可联系固定计划。</p>}</fieldset>
   <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">联系渠道<select aria-label="联系渠道" className={fieldClass} value={channel} onChange={e => setChannel(e.target.value)}><option value="phone">电话</option><option value="message">消息</option></select></label><label className="block text-sm">联系结果<select aria-label="联系结果" className={fieldClass} value={outcome} onChange={e => setOutcome(e.target.value)}>{Object.entries(contactOutcomeLabel).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label></div>
   <button type="submit" disabled={disabled || (!selected && !alertIds.length)} className={buttonClass}>记录本次联系</button>
  </fieldset>
 </form>;
}
