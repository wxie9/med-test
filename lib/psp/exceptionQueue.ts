import type { DemoStore } from "@/lib/state/store";
import { displayName } from "@/lib/patient/display";
import { membershipAt, permissionAt } from "./permissions";
import { projectEnrollmentForAlert } from "./transaction";
export type ExceptionKind =
  | "overdue_questionnaire"
  | "failed_contact"
  | "pending_review"
  | "education_help";
export type ExceptionTarget = {
  kind: "assignment" | "alert" | "contact";
  id: string;
  href: string;
};
export type PspException = {
  id: string;
  kind: ExceptionKind;
  patientId: string;
  displayName: string;
  responsibleRole: "case_manager" | "doctor";
  dueAt?: string;
  sourceAt: string;
  overdue: boolean;
  reason: string;
  blockedReason?: string;
  target: ExceptionTarget;
  additionalTargets: ExceptionTarget[];
  verificationTarget?: ExceptionTarget;
  correctionHref?: string;
};
/** Current operational facts only. Corrections annotate originals, never complete tasks. */
export function projectExceptions(
  store: DemoStore,
  at: string,
): PspException[] {
  const s = store.psp,
    t = Date.parse(at),
    rows: PspException[] = [];
  const visible = (e: {
    occurredAt: string;
    recordedAt: string;
    sequence: number;
  }) =>
    Date.parse(e.occurredAt) <= t &&
    Date.parse(e.recordedAt) <= t &&
    e.sequence <= s.ledgerRevision;
  for (const e of s.enrollments.filter(
    (e) => e.projectId === s.project.id && store.patients.has(e.patientId),
  )) {
    const membership = membershipAt(s, e.id, at);
    if (membership === "invited") continue;
    const blockedReason =
      [
        membership === "paused"
          ? "成员已暂停"
          : membership === "exited"
            ? "成员已退出"
            : "",
        !permissionAt(s, e.id, "service", at) ? "服务授权已撤回" : "",
        t < Date.parse(s.project.startsAt) || t > Date.parse(s.project.endsAt)
          ? "不在项目服务期内"
          : "",
      ]
        .filter(Boolean)
        .join("；") || undefined;
    const target = (
      kind: ExceptionTarget["kind"],
      id: string,
    ): ExceptionTarget => ({
      kind,
      id,
      href: `/clinic/patients/${encodeURIComponent(e.patientId)}#${encodeURIComponent(`${kind}-${id}`)}`,
    });
    const plans = s.assignments.filter(
      (a) =>
        a.enrollmentId === e.id &&
        a.projectId === s.project.id &&
        Date.parse(a.assignedAt) <= t &&
        Date.parse(a.assignedRecordedAt ?? a.assignedAt) <= t &&
        (a.assignedSequence ?? 0) <= s.ledgerRevision,
    );
    const hasVisibleQuestionnaireCompletion = (assignmentId: string) => {
      const originals = (s.questionnaireEvidence ?? []).filter(
        (x) =>
          x.projectId === s.project.id &&
          x.enrollmentId === e.id &&
          x.assignmentId === assignmentId &&
          !x.revisionOf,
      );
      if (originals.length) return originals.some(visible);
      const plan = plans.find((a) => a.id === assignmentId);
      return (
        !!plan?.firstValidSubmittedAt &&
        Date.parse(plan.firstValidSubmittedAt) <= t
      );
    };
    const hasOnlyFutureContactCompletion = (assignmentId: string) => {
      const reached = s.serviceEvents.filter(
        (c) =>
          c.projectId === s.project.id &&
          c.enrollmentId === e.id &&
          c.assignmentId === assignmentId &&
          c.outcome === "reached",
      );
      return reached.length > 0 && !reached.some(visible);
    };
    const openPlan = (id: string) => {
      const plan = plans.find((a) => a.id === id);
      if (!plan) return false;
      if (plan.status === "open") return true;
      if (plan.status !== "completed") return false;
      return plan.kind === "questionnaire"
        ? !hasVisibleQuestionnaireCompletion(id)
        : plan.kind === "contact" && hasOnlyFutureContactCompletion(id);
    };
    const alerts = store.alerts.filter(
      (a) =>
        a.patientId === e.patientId &&
        Date.parse(a.timestamps.triggered) <= t &&
        projectEnrollmentForAlert(store, a.id)?.id === e.id,
    );
    const actions = (s.alertActions ?? []).filter(
      (a) =>
        a.projectId === s.project.id && a.enrollmentId === e.id && visible(a),
    );
    const alertOpen = (id: string) =>
      alerts.some(
        (a) =>
          a.id === id &&
          (a.status !== "closed" ||
            (s.alertActions ?? []).some(
              (x) => x.alertId === id && x.action === "close" && !visible(x),
            )),
      ) && !actions.some((a) => a.alertId === id && a.action === "close");
    const add = (
      row: Omit<
        PspException,
        "patientId" | "displayName" | "overdue" | "blockedReason"
      >,
      extraBlock?: string,
    ) =>
      rows.push({
        ...row,
        patientId: e.patientId,
        displayName: displayName(e.patientId),
        overdue: !!row.dueAt && Date.parse(row.dueAt) < t,
        blockedReason: extraBlock ?? blockedReason,
      });
    for (const a of plans.filter(
      (a) =>
        a.kind === "questionnaire" && openPlan(a.id) && Date.parse(a.dueAt) < t,
    ))
      add({
        id: `questionnaire:${a.id}`,
        kind: "overdue_questionnaire",
        responsibleRole: "case_manager",
        dueAt: a.dueAt,
        sourceAt: a.assignedAt,
        reason: "问卷计划已逾期，需核对并开展跟进，不代患者填答",
        target: target("assignment", a.id),
        additionalTargets: [],
      });
    const contacts = s.serviceEvents
      .filter(
        (c) =>
          c.enrollmentId === e.id &&
          c.projectId === s.project.id &&
          c.channel &&
          visible(c),
      )
      .sort(
        (a, b) =>
          Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
          a.sequence - b.sequence,
      );
    for (const c of contacts.filter((c) => c.outcome !== "reached")) {
      const refs: ExceptionTarget[] = [];
      if (c.assignmentId && openPlan(c.assignmentId))
        refs.push(target("assignment", c.assignmentId));
      for (const id of c.alertIds)
        if (alertOpen(id)) refs.push(target("alert", id));
      const remaining = refs.filter(
        (ref) =>
          !contacts.some(
            (later) =>
              (Date.parse(later.occurredAt) > Date.parse(c.occurredAt) ||
                (later.occurredAt === c.occurredAt &&
                  later.sequence > c.sequence)) &&
              later.outcome === "reached" &&
              (ref.kind === "assignment"
                ? later.assignmentId === ref.id
                : later.alertIds.includes(ref.id)),
          ),
      );
      if (!remaining.length) continue;
      const corrections = (s.corrections ?? []).filter(
        (x) =>
          x.projectId === s.project.id &&
          x.enrollmentId === e.id &&
          x.sourceRef.id === c.id &&
          Date.parse(x.recordedAt) <= t &&
          Date.parse(x.occurredAt) <= t,
      );
      const due = remaining
        .filter((r) => r.kind === "assignment")
        .map((r) => plans.find((a) => a.id === r.id)!.dueAt)
        .sort()[0];
      add({
        id: `contact:${c.interactionId}`,
        kind: "failed_contact",
        responsibleRole: "case_manager",
        dueAt: due,
        sourceAt: c.occurredAt,
        reason: `${c.outcome === "refused" ? "拒绝联系，请先核对患者意愿" : c.outcome === "no_answer" ? "实际联系未接通" : "联系渠道不可用"}；仍待处理 ${remaining.length} 个关联目标${corrections.length ? "；原执行记录，存在待核验／已核验补录" : ""}`,
        target: target("contact", c.id),
        additionalTargets: remaining,
        ...(corrections.length
          ? {
              correctionHref: `/governance/projects/${encodeURIComponent(s.project.id)}/corrections`,
            }
          : {}),
      });
    }
    // Stored status may already include a closure beyond this read boundary.
    // Visible structured submission and effective closure determine review work.
    for (const a of alerts.filter((a) => alertOpen(a.id))) {
      const submitted = actions
        .filter(
          (x) =>
            x.alertId === a.id && x.action === "submit_review" && x.disposition,
        )
        .sort((a, b) => b.sequence - a.sequence)[0];
      if (submitted)
        add({
          id: `review:${a.id}`,
          kind: "pending_review",
          responsibleRole: "doctor",
          sourceAt: submitted.occurredAt,
          reason: `${a.kind === "symptom" ? "症状" : "依从性"}预警 · ${a.rule}；个案管理师已提交本预警处置，待医生复核；关闭不代表症状改善`,
          target: target("alert", a.id),
          additionalTargets: [],
        });
    }
    for (const result of s.educationResults.filter(
      (r) => r.needsHelp && r.feedbackAt && Date.parse(r.feedbackAt) <= t,
    )) {
      const a = plans.find((a) => a.id === result.assignmentId);
      if (!a) continue;
      const feedback = (s.educationEvents ?? [])
        .filter(
          (x) =>
            x.assignmentId === a.id &&
            x.enrollmentId === e.id &&
            x.projectId === s.project.id &&
            x.action === "feedback" &&
            x.needsHelp &&
            visible(x),
        )
        .sort((a, b) => b.sequence - a.sequence)[0];
      if (
        !feedback &&
        (s.educationEvents ?? []).some(
          (x) => x.assignmentId === a.id && x.action === "feedback",
        )
      )
        continue;
      const followup = feedback?.followupAssignmentId
        ? plans.find((a) => a.id === feedback.followupAssignmentId)
        : undefined;
      if (followup?.status === "completed" && !openPlan(followup.id)) continue;
      const verify = !followup || !openPlan(followup.id);
      add(
        {
          id: `education:${a.id}`,
          kind: "education_help",
          responsibleRole: "case_manager",
          ...(followup ? { dueAt: followup.dueAt } : {}),
          sourceAt: feedback?.occurredAt ?? result.feedbackAt!,
          reason: verify
            ? "历史帮助需求，需核对跟进记录"
            : "教育已反馈需帮助，关联跟进尚未完成；不回写已理解",
          target: target("assignment", followup?.id ?? a.id),
          verificationTarget: target("assignment", followup?.id ?? a.id),
          additionalTargets: [],
        },
        verify
          ? [blockedReason, "需核对明确的开放跟进计划"]
              .filter(Boolean)
              .join("；")
          : undefined,
      );
    }
  }
  const rank = (r: PspException) => (r.blockedReason ? 2 : r.overdue ? 0 : 1);
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
      a.sourceAt.localeCompare(b.sourceAt) ||
      a.id.localeCompare(b.id),
  );
}
