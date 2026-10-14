# PSP Task 3 independent code review

Date: 2026-10-14. Reviewer: Senior Code Reviewer subagent. Worktree: `/Users/xue.w/.codex/worktrees/psp-project-pro/med_Test`; base `dc7eca4`; reviewed frozen uncommitted v2 source package `.superpowers/sdd/task-3-review-package-v2.md` and actual files. Review is scoped to the authorized Task 3 and its regression impact. No source, index, HEAD, branch, server, or shared application state was modified; only this requested review report was written. No duplicate test suite was run.

## Verdicts

- **Specification compliance: PASS.** Task 3's plan-bound clinical submission, first/latest completion, explicit revision, replay, patient binding, and failure paths are implemented. The concrete `data`/`seedVersion` result and exact-replay behavior correctly preserve the established Task 1 contract. No unauthorized Task 4–12 service writes or monthly-report implementation was added.
- **Code quality: APPROVED.** No unresolved P0/P1/P2 implementation finding was identified. The clinical writer, shared validation, assignment transaction, projection-driven UI and immutable pending-request hook separate their responsibilities adequately and retain legacy behavior.
- **Whole-branch readiness: APPROVED for authorized local commit/integration.** Static review and final validation are complete. The root supplied successful fresh lint/types, Next and Worker browser suites, safe Worker build, dry-run and actual persisted-restart verification. Final logs and completed documentation were inspected in this follow-up. No production/test source changed after the reviewed v2 freeze.

## Reviewed invariants and evidence

1. `lib/psp/transaction.ts` checks current seed, target ownership and simulated patient identity before receipt lookup. Same-body receipt replay precedes assignment CAS and current consent checks; changed-body reuse fails. New work uses assignment.version, while enrollment.version and authorizationVersion remain untouched. Enrollment command behavior is preserved.
2. `lib/psp/commands.ts` and `lib/pro/submit.ts` mutate a structured clone synchronously. Clinical response, applicable alerts/message, completion fields and receipt are validated and installed together. Ordinary completed submissions reuse saved result data without new clinical records or assignment version changes. Explicit revision requires current latest response and appends provenance while retaining first completion. Saved feedback avoids recomputing time-dependent wording on repeats.
3. `lib/psp/types.ts` and `lib/state/persistence.ts` validate completion-field consistency, unique clinical ID ownership, monthly scale/content, project/assignment timing, same-patient revision chains, chronological order and root first-completion time. Optional `revisionOf` has no default and retains compatibility with prior schema-v2 payloads. The durable coordinator is unchanged; the new actual-command tests exercise before-write failure and unknown outcome after write, decode authoritative saved state and replay without duplication.
4. Strict new API validation shares all existing item/flag rules with the generic endpoint. Generic top-level stripping, clinical rules and generic feedback remain intact; generic submission does not complete a PSP plan. Project feedback uses simulated natural-hour targets and retains the existing off-hours/emergency advice.
5. `ProjectPro`, `ProjectProForm` and `useProjectProSubmission` bind patient/assignment/seed/revision. Invalid or foreign assignment never falls back to the generic form. Pending network/503 retry retains the exact serialized body and request ID; editing/double submit are blocked. Old success/error callbacks are revoked on context switch/unmount. A 409 refreshes and requires explicit review without automatically resubmitting. Polling a committed revision does not hide its unresolved retry.
6. Revision prefill selects the exact current-patient response named by the assignment, rather than the most recent generic response. Delayed clinical arrival remounts with that answer. V2 adds readable clinical-read failure and guarded manual retry; its integration test uses real `usePatient` behavior with 503 then 200 and a newer unrelated generic response, verifying the correct prior answers.
7. Patient plan links are opt-in; internal Plans remain summary-only and contact/education plans remain read-only. The existing generic patient workflow and research routes remain present. Clinical/PSP seed sources and manifests are not changed. Reviewed 390px and 1440px screenshots show readable labels/deadline and no clipping; the original research viewport regression continues to cover 390–1920px and passed in both final browser suites.

## Verification observed at review time

- Root `.wrangler/task3-unit-final.log`: **53 files / 469 tests passed** on v2, duration 17.39s.
- UI handoff: **33 focused unit assertions across 7 files**, TypeScript and focused ESLint green; earlier six Task 3 Next E2E cases green.
- Backend handoff: **56 targeted tests across 12 files**, including legacy PRO/alerts, PSP transactions/permissions/seed/views, persistence and both durable failure modes.
- Reviewer independently ran `git diff --check`: exit 0.
- Final root validation: full lint and type-check exit 0; Next E2E **19/19**; Worker E2E **19/19**; safe Worker build complete with environment/artifact validation; deployment dry-run exit 0, without publishing. Reviewer inspected the completed saved logs.
- Actual Worker restart: root reports the before/after script exited 0 using the same independent persistence directory. Reviewer inspected the saved expected clinical/project state and completed implementation report: first response and revision, four alerts, two feedback messages, one late completion, unchanged first time and both exact same-body receipts survived restart; replay added no records and reset was completed. This was not rerun by the reviewer.
- Final plan, Task 3 checklist and implementation report now reflect Task 0–3 complete and Task 4–12 pending. Scope/data constraints remain intact.

## Findings

**Critical / Important:** None found.

**Minor documentation note: CLOSED.** The plan now identifies Task 3 as implemented, leaves Task 4–12 pending, and records all Task 3 checks as complete. Final verification counts and actual Worker restart results are recorded in the implementation report. No open findings remain.

The authorized Task 3 branch is ready for local commit/integration. Task 4+ functionality remains deliberately outside this review's acceptance criteria; no push or deployment is approved or implied by this review.
