"use client";
import { useState } from "react";
import { addDays } from "@/lib/domain/dates";
import { IDENTITIES, TASK_TYPES } from "@/lib/clinic/labels";
export type CloseInput = { note: string; task: { type: string; due: string; owner: string } };
/** Modal collecting 处置说明 + the follow-up task created when an alert is closed. */
export function CloseAlertDialog({ today, defaultOwner, busy, error, onCancel, onConfirm }: {
  today: string; defaultOwner: string; busy: boolean; error: string | null; onCancel: () => void; onConfirm: (v: CloseInput) => void;
}) {
  const [note, setNote] = useState("");
  const [type, setType] = useState<string>(TASK_TYPES[0]);
  const [due, setDue] = useState(addDays(today, 14));
  const [owner, setOwner] = useState(defaultOwner);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  /** Client-side only: copies the newest assistant reply on this page (data-testid="agent-reply") into the note. */
  function copyDraft() {
    const replies = document.querySelectorAll<HTMLElement>('[data-testid="agent-reply"] p');
    const last = replies[replies.length - 1]?.innerText.trim();
    if (last) { setNote(last); setCopyHint(null); } else setCopyHint("本页没有助手回复可复制（可在患者详情页先让医生助手起草）");
  }
  const valid = note.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(due);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="close-alert-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[480px] rounded-xl bg-white p-5 shadow-xl">
        <h2 id="close-alert-title" className="mb-3 text-base font-semibold">关闭预警并建立随访任务</h2>
        <div className="mb-3 block text-sm">
          <span className="mb-1 flex items-center justify-between text-gray-600">处置说明
            <button type="button" data-testid="copy-draft" onClick={copyDraft} className="text-xs text-pink-700 hover:underline">复制最近助手草稿到处置说明</button>
          </span>
          {copyHint && <span className="mb-1 block text-xs text-amber-700">{copyHint}</span>}
          <textarea data-testid="close-note" aria-label="处置说明" value={note} onChange={e => setNote(e.target.value)} rows={3} className="w-full rounded border border-gray-300 p-2" placeholder="如：建议加用对症处理，2 周后复评" />
        </div>
        <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
          <label className="block"><span className="mb-1 block text-gray-600">随访任务类型</span>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1">{TASK_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="block"><span className="mb-1 block text-gray-600">到期日</span>
            <input data-testid="close-task-due" type="date" value={due} onChange={e => setDue(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="block"><span className="mb-1 block text-gray-600">负责人</span>
            <select value={owner} onChange={e => setOwner(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1">{IDENTITIES.map(i => <option key={i}>{i}</option>)}</select>
          </label>
        </div>
        {error && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-sm">取消</button>
          <button type="button" data-testid="close-confirm" disabled={busy || !valid} onClick={() => onConfirm({ note: note.trim(), task: { type, due, owner } })} className="rounded bg-pink-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">确认关闭</button>
        </div>
      </div>
    </div>
  );
}
