import type { Alert, FollowUpTask } from "@/lib/domain/types";
import type { Her2Class } from "@/lib/domain/her2";
export const IDENTITIES = ["个案管理师小陈", "张医生"] as const;
export type ClinicIdentity = (typeof IDENTITIES)[number];
export const TASK_TYPES = ["复评", "门诊", "检查", "电话随访"] as const;
export const ALERT_STATUS: Record<Alert["status"], string> = { triggered: "已触发", unassigned: "待接单", accepted: "已接单", in_progress: "处置中", pending_review: "待复核", closed: "已关闭", escalated: "已升级" };
export const ALERT_KIND: Record<Alert["kind"], string> = { symptom: "症状", adherence: "依从性" };
export const ALERT_LEVEL: Record<Alert["level"], string> = { high: "高", medium: "中" };
export const TASK_STATUS: Record<FollowUpTask["status"], string> = { open: "待完成", done: "已完成" };
export const HER2_LABEL: Record<Her2Class, string> = { low: "HER2-low", zero: "HER2-0", positive: "HER2 阳性", indeterminate: "待定" };
/** The single legal clinician action for a status, with its exact button text (assign/escalate are system-only). */
export const NEXT_ACTION: Partial<Record<Alert["status"], { action: "accept" | "start" | "submit_review" | "close"; label: string }>> = {
  unassigned: { action: "accept", label: "接单" }, escalated: { action: "accept", label: "接单" },
  accepted: { action: "start", label: "开始处置" }, in_progress: { action: "submit_review", label: "提交复核" }, pending_review: { action: "close", label: "关闭" },
};
/** Hours from triggered to accepted, or null if not accepted yet. */
export function firstResponseHours(a: Alert): number | null {
  if (!a.timestamps.accepted || !a.timestamps.triggered) return null;
  return (Date.parse(a.timestamps.accepted) - Date.parse(a.timestamps.triggered)) / 3_600_000;
}
export const fmtHours = (h: number | null) => (h === null ? "—" : `${h.toFixed(1)} 小时`);
/** High before medium, then oldest trigger first. */
export function sortQueue(alerts: Alert[]): Alert[] {
  const rank = { high: 0, medium: 1 } as const;
  return [...alerts].sort((a, b) => rank[a.level] - rank[b.level] || (a.timestamps.triggered ?? "").localeCompare(b.timestamps.triggered ?? ""));
}
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
