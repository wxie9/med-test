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

function genPatient(r: Rng, id: string, cutoff: string): Patient {
  const age = between(r, 32, 78);
  const dx = addDays(cutoff, -between(r, 120, 365 * 7));           // 诊断日 4 个月～7 年前
  const subtype = r() < 0.65 ? "hr_pos" : r() < 0.57 ? "her2_pos" : "tnbc"; // 65 / 20 / 15
  const bio: Biomarker = {
    id: `${id}-b1`, specimenSite: "primary", specimenDate: addDays(dx, 2), readVersion: "ASCO/CAP2023",
    erPct: subtype === "tnbc" ? 0 : subtype === "hr_pos" ? between(r, 10, 100) : between(r, 0, 100),
    prPct: subtype === "tnbc" ? 0 : between(r, 0, 90), ki67: between(r, 5, 70),
    her2Ihc: subtype === "her2_pos" ? "3+" : pick(r, ["0", "1+", "1+", "2+"]), ish: "not_done",
  };
  if (bio.her2Ihc === "2+") bio.ish = chance(r, 0.95) ? "negative" : "not_done";   // 5% 缺 ISH
  const stageT = pick(r, ["pT1N0M0", "pT2N0M0", "pT2N1M0", "pT3N1M0", "pT3N2M0"]);
  const surgeryDate = addDays(dx, between(r, 14, 45));
  const treatments: TreatmentEvent[] = [{ id: `${id}-t1`, type: "surgery", intent: "adjuvant", drug: null, start: surgeryDate, end: surgeryDate, stopReason: "completed", source: "in_house" }];
  let k = 2;
  const push = (t: Omit<TreatmentEvent, "id">) => treatments.push({ id: `${id}-t${k++}`, ...t });
  if (subtype !== "hr_pos" || /N[12]/.test(stageT)) push({ type: "chemo", intent: "adjuvant", drug: "AC-T", start: addDays(surgeryDate, 21), end: addDays(surgeryDate, 130), stopReason: "completed", source: "in_house" });
  if (subtype === "hr_pos") push({ type: "endocrine", intent: "adjuvant", drug: pick(r, ["来曲唑", "阿那曲唑", "他莫昔芬"]), start: addDays(surgeryDate, 40), end: null, stopReason: "ongoing", source: chance(r, 0.1) ? "external" : "in_house" });
  if (subtype === "her2_pos") push({ type: "anti_her2", intent: "adjuvant", drug: "曲妥珠单抗", start: addDays(surgeryDate, 21), end: addDays(surgeryDate, 386), stopReason: "completed", source: "in_house" });

  // 复发/转移：按分期与分型设置年风险
  const annualRisk = (/N2/.test(stageT) ? 0.12 : /N1/.test(stageT) ? 0.07 : 0.03) * (subtype === "tnbc" ? 1.6 : 1);
  const yearsObs = Math.max(0, (new Date(cutoff).getTime() - new Date(surgeryDate).getTime()) / (365 * 86_400_000));
  const outcomes: Patient["outcomes"] = []; let stage: Patient["stage"] = yearsObs > 5 && subtype === "hr_pos" && chance(r, 0.5) ? "survivorship" : "early_adjuvant";
  let metDate: string | null = null;
  for (let y = 1; y <= Math.floor(yearsObs); y++) if (!metDate && chance(r, annualRisk)) metDate = addDays(surgeryDate, y * 365 - between(r, 0, 300));
  const biomarkers = [bio];
  if (metDate && metDate < cutoff) {
    stage = "metastatic";
    outcomes.push({ id: `${id}-o1`, type: "distant_metastasis", date: metDate, evidence: "imaging", assessor: "Dr. Mock" });
    const endoAdj = treatments.find(t => t.type === "endocrine"); if (endoAdj) { endoAdj.end = metDate; endoAdj.stopReason = "progression"; }
    biomarkers.push({ ...bio, id: `${id}-b2`, specimenSite: "metastatic", specimenDate: addDays(metDate, 5), her2Ihc: chance(r, 0.3) ? pick(r, ["0", "1+", "2+"]) : bio.her2Ihc });
    // 一线
    const l1Start = addDays(metDate, between(r, 10, 30));
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
  }
  // 不完美注入
  for (const t of treatments) { if (t.source === "external" && chance(r, 0.6)) { t.start = null; t.end = null; } if (t.stopReason !== "ongoing" && chance(r, 0.08)) t.stopReason = "unknown"; }
  const lost = stage !== "deceased" && chance(r, 0.06); if (lost) stage = "lost";
  const lastContact = stage === "lost" ? addDays(cutoff, -between(r, 200, 600)) : addDays(cutoff, -between(r, 0, 45));
  const deathDate = outcomes.find(o => o.type === "death")?.date;
  const p: Patient = {
    id, anchorKey: null, age, enrolledAt: addDays(dx, 30), stage, surgeryDate,
    consent: { followUp: true, research: chance(r, 0.9), pharmaDeidentified: chance(r, 0.8), signedAt: addDays(dx, 30) },
    biomarkers, staging: [{ cTnm: null, pTnm: stageT, date: addDays(surgeryDate, 7), system: "AJCC8" }], treatments, lines: [], outcomes,
    pro: [], adherence: [], lastContact: deathDate ?? lastContact,
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
    for (let d = 59; d >= 0; d--) { const miss = chance(r, 0.07); p.adherence.push({ date: addDays(cutoff, -d), due: 1, taken: miss ? 0 : 1, missedReason: miss ? (chance(r, 0.7) ? pick(r, ["忘记", "关节痛", "外出"]) : null) : null }); }
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
    if (i % 4 === 2) q.staging = [];                                                   // 缺分期（由质量指标捕获）
    if (i % 4 === 3) q.outcomes.push({ id: "x", type: "death", date: "2020-01-01", evidence: "clinical_note", assessor: "x" }); // 死亡后仍有事件
    return q;
  });
}
