import type { Alert } from "@/lib/domain/types";
type Action = "assign" | "accept" | "start" | "submit_review" | "close" | "escalate";
const NEXT: Record<string, Partial<Record<Action, Alert["status"]>>> = {
  triggered: { assign: "unassigned", escalate: "escalated" }, unassigned: { accept: "accepted", escalate: "escalated" }, escalated: { accept: "accepted" },
  accepted: { start: "in_progress" }, in_progress: { submit_review: "pending_review" }, pending_review: { close: "closed" },
};
export function transition(a: Alert, action: Action, by: string, at: string, note?: string): Alert {
  const next = NEXT[a.status]?.[action]; if (!next) throw new Error("invalid transition");
  return { ...a, version: (a.version ?? 1) + 1, status: next, assignee: action === "accept" ? by : a.assignee, timestamps: { ...a.timestamps, [next]: at }, notes: note ? [...a.notes, { at, by, text: note }] : a.notes };
}
const LIMIT_H = { high: 2, medium: 24 };
export function checkEscalations(alerts: Alert[], nowIso: string): Alert[] {
  return alerts.map(a => { if (a.status !== "unassigned") return a; const since = a.timestamps.unassigned ?? a.timestamps.triggered; const h = (new Date(nowIso).getTime() - new Date(since).getTime()) / 3_600_000; return h > LIMIT_H[a.level] ? transition(a, "escalate", "system", nowIso) : a; });
}
