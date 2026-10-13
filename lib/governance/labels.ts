import type { Cohort, DataGapTask } from "@/lib/domain/types";
export const pct = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(1)}%`);
export const COHORT_STATUS: Record<Cohort["status"], string> = { draft: "草稿", submitted: "已提交" };
export const GAP_STATUS: Record<DataGapTask["status"], string> = { open: "待补录", done: "已完成" };
