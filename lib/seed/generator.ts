import seedrandom from "seedrandom";
import { createHash } from "node:crypto";
import type { Patient, TreatmentEvent, Biomarker } from "@/lib/domain/types";
import { addDays } from "@/lib/domain/dates";
import { inferLines } from "@/lib/domain/lines";

type Rng = () => number;
const pick = <T,>(r: Rng, arr: T[]) => arr[Math.floor(r() * arr.length)];
const chance = (r: Rng, p: number) => r() < p;
const between = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

export function checksumOf(ps: Patient[]) { return createHash("sha256").update(JSON.stringify(ps)).digest("hex").slice(0, 16); }

export function generateCohort({ seed, n, cutoff }: { seed: number; n: number; cutoff: string }): Patient[] {
  const r = seedrandom(String(seed));
  const out: Patient[] = [];
  for (let i = 0; i < n; i++) out.push(genPatient(r, `P-${String(i + 1).padStart(4, "0")}`, cutoff));
  return out;
}

const readVersion = (specimenDate: string) => (specimenDate < "2023-01-01" ? "ASCO/CAP2018" : "ASCO/CAP2023");

function genPatient(r: Rng, id: string, cutoff: string): Patient {
  const age = between(r, 32, 78);
  const dx = addDays(cutoff, -between(r, 120, 365 * 7));           // 诊断日 4 个月～7 年前
  const subtype = r() < 0.65 ? "hr_pos" : r() < 0.57 ? "her2_pos" : "tnbc"; // 65 / 20 / 15
  const hrPos = subtype === "hr_pos" || (subtype === "her2_pos" && chance(r, 0.55)); // HER2+ 中约 55% 为 HR+
  const bio: Biomarker = {
    id: `${id}-b1`, specimenSite: "primary", specimenDate: addDays(dx, 2), readVersion: readVersion(addDays(dx, 2)),
    erPct: hrPos ? between(r, 10, 100) : 0,
    prPct: hrPos ? between(r, 0, 90) : 0, ki67: between(r, 5, 70),
    her2Ihc: subtype === "her2_pos" ? "3+" : pick(r, ["0", "0", "1+", "2+"]), ish: "not_done", // 非 HER2+ 中低表达约 50%
  };
  if (bio.her2Ihc === "2+") bio.ish = chance(r, 0.95) ? "negative" : "not_done";   // 5% 缺 ISH
  const stageT = pick(r, ["pT1N0M0", "pT2N0M0", "pT2N1M0", "pT3N1M0", "pT3N2M0"]);
  const surgeryDate = addDays(dx, between(r, 14, 45));
  const enrolledAt = addDays(dx, 30);
  let treatments: TreatmentEvent[] = [{ id: `${id}-t1`, type: "surgery", intent: "adjuvant", drug: null, start: surgeryDate, end: surgeryDate, stopReason: "completed", source: "in_house" }];
  let k = 2;
  const push = (t: Omit<TreatmentEvent, "id">) => treatments.push({ id: `${id}-t${k++}`, ...t });
  const chemoEnd = subtype !== "hr_pos" || /N[12]/.test(stageT) ? addDays(surgeryDate, 130) : null;
  if (chemoEnd) push({ type: "chemo", intent: "adjuvant", drug: "AC-T", start: addDays(surgeryDate, 21), end: chemoEnd, stopReason: "completed", source: "in_house" });
  // 所有 HR+ 患者（不论 HER2）均行辅助内分泌，化疗结束后 10 天开始；无化疗则术后 40 天
  if (hrPos) push({ type: "endocrine", intent: "adjuvant", drug: pick(r, ["来曲唑", "阿那曲唑", "他莫昔芬"]), start: chemoEnd ? addDays(chemoEnd, 10) : addDays(surgeryDate, 40), end: null, stopReason: "ongoing", source: "in_house" });
  if (subtype === "her2_pos") push({ type: "anti_her2", intent: "adjuvant", drug: "曲妥珠单抗", start: addDays(surgeryDate, 21), end: addDays(surgeryDate, 386), stopReason: "completed", source: "in_house" });

  // 复发/转移：按分期与分型设置年风险；转移日不早于术后 150 天
  const annualRisk = (/N2/.test(stageT) ? 0.12 : /N1/.test(stageT) ? 0.07 : 0.03) * (subtype === "tnbc" ? 1.6 : 1);
  const yearsObs = Math.max(0, (new Date(cutoff).getTime() - new Date(surgeryDate).getTime()) / (365 * 86_400_000));
  const outcomes: Patient["outcomes"] = []; let stage: Patient["stage"] = "early_adjuvant";
  let metDate: string | null = null;
  for (let y = 1; y <= Math.floor(yearsObs); y++) if (!metDate && chance(r, annualRisk)) {
    const d = addDays(surgeryDate, y * 365 - between(r, 0, 300)), minMet = addDays(surgeryDate, 150);
    metDate = d < minMet ? minMet : d;
  }
  const biomarkers = [bio];
  if (metDate && metDate < cutoff) {
    const met = metDate;
    stage = "metastatic";
    outcomes.push({ id: `${id}-o1`, type: "distant_metastasis", date: met, evidence: "imaging", assessor: "Dr. Mock" });
    // 辅助治疗被转移截断：转移后才开始的删除，跨过转移日的截止于转移日并记为进展
    treatments = treatments.filter(t => t.intent !== "adjuvant" || t.type === "surgery" || t.start! <= met);
    for (const t of treatments) if (t.intent === "adjuvant" && t.type !== "surgery" && (t.end === null || t.end > met)) { t.end = met; t.stopReason = "progression"; }
    const metSpecimen = addDays(met, 5);
    biomarkers.push({ ...bio, id: `${id}-b2`, specimenSite: "metastatic", specimenDate: metSpecimen, readVersion: readVersion(metSpecimen), her2Ihc: chance(r, 0.3) ? pick(r, ["0", "1+", "2+"]) : bio.her2Ihc });
    // 一线
    const l1Start = addDays(met, between(r, 10, 30));
    const l1Dur = between(r, 90, 700); const l1End = addDays(l1Start, l1Dur);
    const l1Prog = l1End < cutoff;
    if (subtype === "hr_pos") {
      push({ type: "endocrine", intent: "metastatic", drug: "氟维司群", start: l1Start, end: l1Prog ? l1End : null, stopReason: l1Prog ? "progression" : "ongoing", source: "in_house" });
      push({ type: "cdk46", intent: "metastatic", drug: pick(r, ["哌柏西利", "阿贝西利", "达尔西利"]), start: addDays(l1Start, between(r, 0, 10)), end: l1Prog ? l1End : null, stopReason: l1Prog ? "progression" : "ongoing", source: "in_house" });
    } else if (subtype === "her2_pos") {
      push({ type: "anti_her2", intent: "metastatic", drug: "曲妥珠单抗+帕妥珠单抗", start: l1Start, end: l1Prog ? l1End : null, stopReason: l1Prog ? "progression" : "ongoing", source: "in_house" });
    } else push({ type: "chemo", intent: "metastatic", drug: "白蛋白紫杉醇", start: l1Start, end: l1Prog ? l1End : null, stopReason: l1Prog ? "progression" : "ongoing", source: "in_house" });
    if (l1Prog) {
      outcomes.push({ id: `${id}-o2`, type: "progression", date: l1End, evidence: "imaging", assessor: "Dr. Mock" });
      const l2Start = addDays(l1End, between(r, 10, 40));
      if (l2Start < cutoff) {
        const her2 = biomarkers[1].her2Ihc;
        const drug = her2 === "3+" ? "德曲妥珠单抗" : her2 === "0" ? pick(r, ["戈沙妥珠单抗", "卡培他滨"]) : pick(r, ["德曲妥珠单抗", "戈沙妥珠单抗"]);
        const l2End = addDays(l2Start, between(r, 60, 400)); const l2Prog = l2End < cutoff;
        push({ type: drug === "卡培他滨" ? "chemo" : "adc", intent: "metastatic", drug, start: l2Start, end: l2Prog ? l2End : null, stopReason: l2Prog ? (chance(r, 0.25) ? "toxicity" : "progression") : "ongoing", source: "in_house" });
        if (l2Prog && chance(r, 0.35)) { const d = addDays(l2End, between(r, 20, 200)); if (d < cutoff) { outcomes.push({ id: `${id}-o3`, type: "death", date: d, evidence: "clinical_note", assessor: "Dr. Mock" }); stage = "deceased"; } }
      }
    }
  } else {
    // 生存期：仅当辅助内分泌开始已满 5 年，并在满 5 年时以 completed 结束
    const endo = treatments.find(t => t.type === "endocrine" && t.intent === "adjuvant");
    const fiveYears = endo ? addDays(endo.start!, 1826) : null;
    if (endo && fiveYears && fiveYears < cutoff && chance(r, 0.5)) { stage = "survivorship"; endo.end = fiveYears; endo.stopReason = "completed"; }
  }
  // 失访：末次联系 = 最晚已知日期 + 0～100 天，且须早于截止日 200 天以上；进行中事件于末次联系日以 lost 结束
  const deathDate = outcomes.find(o => o.type === "death")?.date;
  let lastContact = deathDate ?? addDays(cutoff, -between(r, 0, 45));
  if (stage !== "deceased" && chance(r, 0.06)) {
    const known = [enrolledAt, ...treatments.flatMap(t => [t.start, t.end]).filter((d): d is string => d !== null), ...outcomes.map(o => o.date)].sort();
    const lc = addDays(known[known.length - 1], between(r, 0, 100));
    if (lc < addDays(cutoff, -200)) {
      stage = "lost"; lastContact = lc;
      for (const t of treatments) if (t.end === null) { t.end = lc; t.stopReason = "lost"; }
    }
  }
  // 不完美注入：已结束的非手术事件 6% 停药原因未知（患者层面约 8%）；12% 患者有一条辅助系统治疗来自外院，其中 85% 仅有药名无日期
  for (const t of treatments) if (t.type !== "surgery" && t.end !== null && t.stopReason !== "lost" && chance(r, 0.06)) t.stopReason = "unknown";
  const adjSystemic = treatments.filter(t => t.intent === "adjuvant" && t.type !== "surgery");
  if (adjSystemic.length && chance(r, 0.12)) { const t = pick(r, adjSystemic); t.source = "external"; if (chance(r, 0.85)) { t.start = null; t.end = null; } }
  const p: Patient = {
    id, anchorKey: null, age, enrolledAt, stage, surgeryDate,
    consent: { followUp: true, research: chance(r, 0.9), pharmaDeidentified: chance(r, 0.8), signedAt: enrolledAt },
    biomarkers, staging: [{ cTnm: null, pTnm: stageT, date: addDays(surgeryDate, 7), system: "AJCC8" }], treatments, lines: [], outcomes,
    pro: [], adherence: [], lastContact,
    genomics: { brca: chance(r, 0.1) ? "positive" : chance(r, 0.6) ? "negative" : "not_tested", pik3ca: stage === "metastatic" && chance(r, 0.7) ? (chance(r, 0.4) ? "mutated" : "wild") : "not_tested", esr1: "not_tested" },
  };
  p.lines = inferLines(p.treatments);
  genProAndAdherence(r, p, cutoff);
  return p;
}

function genProAndAdherence(r: Rng, p: Patient, cutoff: string) {
  const endo = p.treatments.find(t => t.type === "endocrine" && t.intent === "adjuvant" && t.start && !t.end);
  if (endo && p.stage === "early_adjuvant") {
    for (let m = 1; m <= 6; m++) {
      const at = addDays(cutoff, -30 * m); if (at < endo.start!) break;
      p.pro.push({ id: `${p.id}-pro${m}`, scaleId: "endocrine_monthly_v1", submittedAt: at + "T09:00:00+08:00", items: { 关节痛: between(r, 0, 3), 潮热: between(r, 0, 2), 情绪: between(r, 0, 2), 睡眠: between(r, 0, 2) }, flags: { stopIntent: chance(r, 0.08), missedDoses14d: chance(r, 0.25) ? between(r, 1, 6) : 0 } });
    }
    for (let d = 59; d >= 0; d--) { const date = addDays(cutoff, -d); if (date < endo.start!) continue; const miss = chance(r, 0.07); p.adherence.push({ date, due: 1, taken: miss ? 0 : 1, missedReason: miss ? (chance(r, 0.7) ? pick(r, ["忘记", "关节痛", "外出"]) : null) : null }); }
  }
  const active = p.treatments.find(t => t.intent === "metastatic" && !t.end && t.start);
  if (active && p.stage === "metastatic") for (let w = 1; w <= 4; w++) p.pro.push({ id: `${p.id}-prow${w}`, scaleId: "treatment_weekly_v1", submittedAt: addDays(cutoff, -7 * w) + "T09:00:00+08:00", items: { 恶心: between(r, 0, 2), 乏力: between(r, 0, 3), 口腔炎: between(r, 0, 2), 腹泻: between(r, 0, 1), 手足综合征: 0, 发热: 0 }, flags: {} });
}

export function generateEdgeCases(): Patient[] {
  const base = generateCohort({ seed: 1, n: 20, cutoff: "2026-10-13" });
  return base.map((p, i) => {
    const q = structuredClone(p); q.id = `E-${String(i + 1).padStart(2, "0")}`;
    if (i % 4 === 0 && q.treatments[0]) q.treatments[0].end = "2000-01-01";           // end<start
    if (i % 4 === 1) q.treatments.push({ ...q.treatments[0], id: q.treatments[0].id }); // duplicate
    if (i % 4 === 2) { const t = q.treatments.find(t => t.intent === "adjuvant" && t.type !== "surgery" && t.start) ?? q.treatments[0]; t.start = addDays(q.surgeryDate!, -10); } // 辅助治疗早于手术
    if (i % 4 === 3) q.outcomes.push({ id: "x", type: "death", date: "2020-01-01", evidence: "clinical_note", assessor: "x" }); // 死亡后仍有事件
    return q;
  });
}
