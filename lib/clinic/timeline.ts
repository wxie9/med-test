import type { Patient } from "@/lib/domain/types";
import { deriveHer2Low, type Her2Class } from "@/lib/domain/her2";
import { diffDays, shanghaiCalendarDay } from "@/lib/domain/dates";
export type LaneKey = "specimen" | "staging" | "treatment" | "outcome" | "pro";
export type TimelineItem = {
  id: string; start: string; end: string | null; title: string; detail: string;
  tone: "primary" | "metastatic_specimen" | "staging" | "neoadjuvant" | "adjuvant" | "metastatic" | "outcome" | "pro";
  her2?: Her2Class; lineNo?: number;
  /** Packed position, in % of the axis. */
  left: number; width: number; row: number; alignRight: boolean;
};
export type TimelineLane = { key: LaneKey; label: string; rows: number; items: TimelineItem[] };
export type TimelineModel = { start: string; end: string; lanes: TimelineLane[]; ticks: { date: string; label: string; left: number }[] };
const TX: Record<Patient["treatments"][number]["type"], string> = { surgery: "手术", radiation: "放疗", chemo: "化疗", endocrine: "内分泌", anti_her2: "抗 HER2", cdk46: "CDK4/6 抑制剂", adc: "ADC", other: "其他" };
const OUTCOME: Record<Patient["outcomes"][number]["type"], string> = { local_recurrence: "局部复发", distant_metastasis: "远处转移", progression: "疾病进展", death: "死亡" };
const ISH: Record<Patient["biomarkers"][number]["ish"], string> = { positive: "阳性", negative: "阴性", not_done: "未做", unknown: "未知" };
const STOP: Record<Patient["treatments"][number]["stopReason"], string> = { completed: "完成", progression: "进展", toxicity: "毒性", patient_choice: "患者意愿", lost: "失访", death: "死亡", unknown: "原因不详", ongoing: "进行中" };
const EVIDENCE: Record<Patient["outcomes"][number]["evidence"], string> = { imaging: "影像", pathology: "病理", clinical_note: "临床记录" };
const INTENT: Record<Patient["treatments"][number]["intent"], string> = { neoadjuvant: "新辅助", adjuvant: "辅助", metastatic: "解救" };
export const HER2_SHORT: Record<Her2Class, string> = { low: "HER2-low", zero: "HER2-0", positive: "HER2 阳性", indeterminate: "HER2 待定" };
/** Room reserved for a text label, in % of the axis (labels are wider than short bars); specimen labels carry a second detail line. */
const LABEL_PCT: Record<LaneKey, number> = { specimen: 34, staging: 15, treatment: 15, outcome: 15, pro: 0 };
type Raw = Omit<TimelineItem, "left" | "width" | "row" | "alignRight">;
/** Lay a patient's history out on a date axis from the first event to `today`, packing overlapping items into sub-rows per lane. */
export function buildTimeline(p: Patient, today: string): TimelineModel {
  const lineOf = new Map<string, number>(); for (const l of p.lines) for (const id of l.eventIds) lineOf.set(id, l.lineNo);
  const raw: Record<LaneKey, Raw[]> = {
    specimen: p.biomarkers.map(b => {
      const her2 = deriveHer2Low(b);
      return { id: b.id, start: b.specimenDate, end: null, tone: b.specimenSite === "primary" ? "primary" : "metastatic_specimen", her2,
        title: `${b.specimenSite === "primary" ? "原发灶" : "转移灶"} ${b.specimenDate}`,
        detail: `IHC ${b.her2Ihc} / ISH ${ISH[b.ish]} → ${HER2_SHORT[her2]}${b.erPct !== null ? ` · ER ${b.erPct}%` : ""}${b.prPct !== null ? ` PR ${b.prPct}%` : ""}` };
    }),
    staging: p.staging.map((s, i) => ({ id: `stg-${i}`, start: s.date, end: null, tone: "staging", title: s.pTnm ?? s.cTnm ?? "分期不详", detail: `${s.pTnm ? "病理" : "临床"}分期 ${s.system} · ${s.date}` })),
    treatment: p.treatments.filter(t => t.start).map(t => {
      const lineNo = t.intent === "metastatic" ? lineOf.get(t.id) : undefined; const name = t.drug ?? TX[t.type];
      return { id: t.id, start: t.start!, end: t.end ?? today, tone: t.intent, lineNo,
        title: lineNo ? `L${lineNo} · ${name}` : name, detail: `${INTENT[t.intent]}${TX[t.type]} · ${t.start} ~ ${t.end ?? "进行中"}${t.stopReason !== "ongoing" ? `（${STOP[t.stopReason]}）` : ""}` };
    }),
    outcome: p.outcomes.map(o => ({ id: o.id, start: o.date, end: null, tone: "outcome", title: OUTCOME[o.type], detail: `${o.date} · ${EVIDENCE[o.evidence]}` })),
    pro: p.pro.map(r => ({ id: r.id, start: shanghaiCalendarDay(r.submittedAt), end: null, tone: "pro", title: "", detail: `${shanghaiCalendarDay(r.submittedAt)} · ${Object.entries(r.items).map(([k, v]) => `${k} ${v}`).join("、")}` })),
  };
  const dates = Object.values(raw).flat().map(i => i.start).concat(p.enrolledAt);
  const start = dates.reduce((m, d) => (d < m ? d : m), today);
  const span = Math.max(1, diffDays(start, today));
  const pct = (d: string) => Math.min(100, Math.max(0, (diffDays(start, d) / span) * 100));
  const LABELS: Record<LaneKey, string> = { specimen: "标本/分型", staging: "分期", treatment: "治疗事件", outcome: "结局事件", pro: "PRO 提交点" };
  const lanes = (Object.keys(raw) as LaneKey[]).map(key => {
    const ends: number[] = [];
    const items = [...raw[key]].sort((a, b) => a.start.localeCompare(b.start)).map((it): TimelineItem => {
      const left = pct(it.start); const width = it.end ? Math.max(0.4, pct(it.end) - left) : 0;
      if (key === "pro") return { ...it, left, width, row: 0, alignRight: false };
      const w = LABEL_PCT[key]; const alignRight = left + w > 100;
      const [from, to] = alignRight ? [left - w, left + width] : [left, left + Math.max(width, w)];
      let row = ends.findIndex(e => e <= from); if (row < 0) { row = ends.length; ends.push(to); } else ends[row] = to;
      return { ...it, left, width, row, alignRight };
    });
    return { key, label: LABELS[key], rows: Math.max(1, ends.length), items };
  });
  return { start, end: today, lanes, ticks: monthTicks(start, today, pct) };
}
function monthTicks(start: string, end: string, pct: (d: string) => number) {
  const months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7));
  const step = [1, 2, 3, 6, 12].find(s => months / s <= 8) ?? 12;
  const out: { date: string; label: string; left: number }[] = [];
  let y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7)) + 1; // first of the month after start
  if (step === 12) { y += 1; m = 1; }
  for (;;) {
    if (m > 12) { y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1; }
    const d = `${y}-${String(m).padStart(2, "0")}-01`; if (d > end) break;
    if (pct(d) <= 90) out.push({ date: d, label: step === 12 ? String(y) : d.slice(0, 7), left: pct(d) }); // right edge carries the "今天" label
    m += step;
  }
  return out;
}
