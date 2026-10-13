import { z } from "zod";

export const Stage = z.enum(["early_adjuvant", "metastatic", "survivorship", "lost", "deceased"]);
export const Her2Ihc = z.enum(["0", "1+", "2+", "3+", "unknown"]);
export const Ish = z.enum(["positive", "negative", "not_done", "unknown"]);
export const TreatmentType = z.enum(["surgery", "radiation", "chemo", "endocrine", "anti_her2", "cdk46", "adc", "other"]);
export const Intent = z.enum(["neoadjuvant", "adjuvant", "metastatic"]);
export const StopReason = z.enum(["completed", "progression", "toxicity", "patient_choice", "lost", "death", "unknown", "ongoing"]);
export const OutcomeType = z.enum(["local_recurrence", "distant_metastasis", "progression", "death"]);
export const AlertStatus = z.enum(["triggered", "unassigned", "accepted", "in_progress", "pending_review", "closed", "escalated"]);

export const Biomarker = z.object({
  id: z.string(), specimenSite: z.enum(["primary", "metastatic"]), specimenDate: z.string(),
  erPct: z.number().min(0).max(100).nullable(), prPct: z.number().min(0).max(100).nullable(),
  her2Ihc: Her2Ihc, ish: Ish, ki67: z.number().nullable(), readVersion: z.string(),
  /** 结果录入系统的日期；缺省表示与 specimenDate 相同 */
  enteredAt: z.string().optional(),
});
export const Staging = z.object({ cTnm: z.string().nullable(), pTnm: z.string().nullable(), date: z.string(), system: z.literal("AJCC8") });
export const TreatmentEvent = z.object({
  id: z.string(), type: TreatmentType, intent: Intent, drug: z.string().nullable(),
  start: z.string().nullable(), end: z.string().nullable(), stopReason: StopReason, source: z.enum(["in_house", "external"]),
});
export const SystemicTherapyLine = z.object({
  lineNo: z.number().int().positive(), eventIds: z.array(z.string()), start: z.string(), end: z.string().nullable(),
  rulesVersion: z.string(), reviewStatus: z.enum(["unreviewed", "confirmed", "corrected"]), reviewer: z.string().nullable(),
});
export const OutcomeEvent = z.object({ id: z.string(), type: OutcomeType, date: z.string(), evidence: z.enum(["imaging", "pathology", "clinical_note"]), assessor: z.string() });
export const ProResponse = z.object({ id: z.string(), scaleId: z.enum(["endocrine_monthly_v1", "treatment_weekly_v1"]), submittedAt: z.string(), items: z.record(z.number()), flags: z.object({ stopIntent: z.boolean().optional(), missedDoses14d: z.number().optional() }) });
export const AdherenceLog = z.object({ date: z.string(), due: z.number(), taken: z.number(), missedReason: z.string().nullable() });
export const Consent = z.object({ followUp: z.boolean(), research: z.boolean(), pharmaDeidentified: z.boolean(), signedAt: z.string().nullable() });

export const Patient = z.object({
  id: z.string(), anchorKey: z.string().nullable(), age: z.number(), enrolledAt: z.string(), stage: Stage, consent: Consent,
  biomarkers: z.array(Biomarker), staging: z.array(Staging), treatments: z.array(TreatmentEvent), lines: z.array(SystemicTherapyLine),
  outcomes: z.array(OutcomeEvent), pro: z.array(ProResponse), adherence: z.array(AdherenceLog), lastContact: z.string(), surgeryDate: z.string().nullable(),
  genomics: z.object({ brca: z.enum(["positive", "negative", "not_tested"]), pik3ca: z.enum(["mutated", "wild", "not_tested"]), esr1: z.enum(["mutated", "wild", "not_tested"]) }),
  expertNote: z.string().optional(),
});
export type Patient = z.infer<typeof Patient>;
export type Biomarker = z.infer<typeof Biomarker>;
export type TreatmentEvent = z.infer<typeof TreatmentEvent>;
export type SystemicTherapyLine = z.infer<typeof SystemicTherapyLine>;
export type ProResponse = z.infer<typeof ProResponse>;

export const Alert = z.object({
  id: z.string(), patientId: z.string(), kind: z.enum(["symptom", "adherence"]), level: z.enum(["high", "medium"]), rule: z.string(),
  status: AlertStatus, assignee: z.string().nullable(), timestamps: z.record(z.string()), notes: z.array(z.object({ at: z.string(), by: z.string(), text: z.string() })),
  proId: z.string(),
});
export const FollowUpTask = z.object({ id: z.string(), patientId: z.string(), type: z.string(), due: z.string(), owner: z.string(), status: z.enum(["open", "done"]), createdAt: z.string() });
export const CohortFilter = z.object({
  hrPositive: z.boolean().optional(), her2: z.array(z.enum(["low", "zero", "positive"])).optional(),
  stage: z.array(Stage).optional(), priorCdk46: z.boolean().optional(), intent: z.array(Intent).optional(), currentTreatmentType: z.array(TreatmentType).optional(),
});
export const Cohort = z.object({ id: z.string(), name: z.string(), filter: CohortFilter, createdBy: z.string(), createdAt: z.string(), patientIds: z.array(z.string()), status: z.enum(["draft", "submitted"]) });
export const ResearchSnapshot = z.object({ id: z.string(), cohortId: z.string(), cutoff: z.string(), createdAt: z.string(), patients: z.array(Patient), quality: z.record(z.number()) });
export const CandidateRequest = z.object({ id: z.string(), snapshotId: z.string(), protocolId: z.string(), candidates: z.array(z.object({ patientId: z.string(), status: z.enum(["pending", "confirmed", "rejected"]) })), createdAt: z.string() });
export const DataGapTask = z.object({ id: z.string(), source: z.string(), field: z.string(), patientCount: z.number(), status: z.enum(["open", "done"]), createdAt: z.string() });
export const PatientMessage = z.object({ id: z.string(), patientId: z.string(), kind: z.enum(["alert_feedback", "research_opportunity", "plan_update", "emergency"]), text: z.string(), at: z.string() });

export type Alert = z.infer<typeof Alert>;
export type FollowUpTask = z.infer<typeof FollowUpTask>;
export type CohortFilter = z.infer<typeof CohortFilter>;
export type Cohort = z.infer<typeof Cohort>;
export type ResearchSnapshot = z.infer<typeof ResearchSnapshot>;
export type CandidateRequest = z.infer<typeof CandidateRequest>;
export type DataGapTask = z.infer<typeof DataGapTask>;
export type PatientMessage = z.infer<typeof PatientMessage>;
