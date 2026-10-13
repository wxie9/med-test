import { getStore } from "@/lib/state/store";
import { now, newId } from "@/lib/state/clock";
import { transition } from "@/lib/alerts/machine";
import type { FollowUpTask } from "@/lib/domain/types";
/** 提交复核 must record what was done (A3: the call is recorded in the alert notes). */
export function actOnAlert(id: string, action: Parameters<typeof transition>[1], by: string, note?: string) {
  if (action === "submit_review" && !note?.trim()) throw new Error("提交复核需填写处置记录");
  const s = getStore(); const i = s.alerts.findIndex(a => a.id === id); if (i < 0) throw new Error("alert not found");
  s.alerts[i] = transition(s.alerts[i], action, by, now(), note); return s.alerts[i];
}
export function closeAlertWithTask(id: string, by: string, note: string, task: { type: string; due: string; owner: string }) {
  const s = getStore(); const alert = actOnAlert(id, "close", by, note);
  const t = { id: newId("task"), patientId: alert.patientId, type: task.type, due: task.due, owner: task.owner, status: "open" as const, createdAt: now() };
  s.tasks.push(t);
  const message = { id: newId("msg"), patientId: alert.patientId, kind: "plan_update" as const, at: now(), text: `医生已处理您的报告：${note}。新增随访：${task.type}（${task.due}）。` };
  s.messages.push(message); return { alert, task: t, message };
}
/** POST /api/tasks — a standalone follow-up task (not tied to closing an alert). */
export function createTask(input: { patientId: string; type: string; due: string; owner: string }): FollowUpTask {
  const s = getStore(); if (!s.patients.has(input.patientId)) throw new Error("patient not found");
  const t: FollowUpTask = { id: newId("task"), ...input, status: "open", createdAt: now() };
  s.tasks.push(t); return t;
}
/** PATCH /api/tasks/:id — mark a task done (idempotent). */
export function completeTask(id: string): FollowUpTask {
  const s = getStore(); const i = s.tasks.findIndex(t => t.id === id); if (i < 0) throw new Error("task not found");
  s.tasks[i] = { ...s.tasks[i], status: "done" }; return s.tasks[i];
}
