# Review fixes implementation plan

> **For agentic workers:** Use test-driven-development for each behavior change, with independent task review before completion. The user's “好的，继续” approves implementing the preceding review recommendations.

**Goal:** Fix the 15 reviewed defects and three known remaining risks, then refresh dependencies and verify the full demo.

**Architecture:** Preserve the Next.js single-process synthetic-data demo and its public API shapes. Keep facts in server computation, rebuild historical snapshots from cutoff-bounded records, and invalidate client requests/cache with patient identity and seedVersion. Work in the existing clean feature checkout; each worker has exclusive file ownership, and only the controller integrates and commits.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Playwright.

## Global constraints

- All data remain synthetic. No real identity/authentication, HIS integration, clinical guideline revalidation, or database persistence is added.
- Existing scripted cohort membership and snapshot IDs retain their conventions; frozen snapshots stay immutable and research responses remain count-only.
- Every reported bug gets a regression test observed failing before implementation. Run focused tests per task, then unit/lint/types/build/e2e for the integrated result.
- No subagent commits, stages files, installs dependencies, runs build/e2e, or edits files owned by another task.
- Date input uses a shared `DateOnly` schema in `lib/domain/dateSchema.ts`; midnight/day boundaries use Asia/Shanghai.

## Task 1: Assistants and output provenance

**Own:** lib/agents/**, tests/unit/agents.test.ts and new agent validation tests.

- [x] Reproduce the ordinary-question → “可以自行停用来曲唑” model-output bypass; enforce the patient medication boundary including negation and common paraphrases.
- [x] Enforce `research_boundary` in every provider mode before model execution, and reject unsupported efficacy/survival assertions in model output.
- [x] Replace the all-number evidence pool as the validator's authority with tool-field evidence: patient age, symptom grades, dates, counts and rates are distinct. Reject unsupported clinical numbers and the `age=52` → “52例” confusion; preserve correctly grounded replies.
- [x] Require citations to have been returned by this turn's search, not merely exist in the catalog; reject truncated/refused OpenAI completions.
- [x] Answer second→third line using lineNo=2 and dynamic wording; reject unsupported or ambiguous line questions instead of returning first→second results. Fix snapshot-size vs filtered-count routing precedence.
- [x] Run focused tests and write `/tmp/med-fix-agent-report.md` with red/green evidence, limitations and changed files.

## Task 2: Historical snapshots and research correctness

**Own:** lib/governance/snapshot.ts, lib/domain/her2.ts, lib/compute/{filter,funnel,quality}.ts, lib/seed/{generator,validate}.ts, lib/research/candidates.ts, associated existing tests and new research regression tests. Do not change generated seed files or docs; controller regenerates and measures them.

- [x] Exclude patients not enrolled or not pharma-consented by cutoff. Require a valid cutoff even for direct createSnapshot calls, using the shared schema.
- [x] Clip staging, surgery date and records; derive deceased/lost/metastatic/survivorship/early_adjuvant from cutoff-known facts. Require specimen date and recorded date to be within cutoff. Keep unchanged line review statuses, immutability and original cohort membership semantics.
- [x] Include lost metastatic patients in quality denominators, distinguishing no applicable lines from actual unreviewed lines.
- [x] Introduce shared HR tri-state logic: either known positive => positive; both known negative => negative; otherwise indeterminate. Boolean filters match only known results; funnel uses the same logic.
- [x] Bound treatment-weekly PRO generation by therapy start, add independent validator coverage; preserve fixed-seed reproducibility. Notify controller of checksum implications.
- [x] Reject unknown protocol IDs (only XX-ADC-301 supported), including direct calls; retain consent and idempotency behavior.
- [x] Run focused tests and write `/tmp/med-fix-research-report.md` with red/green evidence and changed files.

## Task 3: Client identity, reset and chat recovery

**Own:** lib/client/usePatient.ts, components/research/{useResearch,CandidateRequestPanel}.tsx or .ts, components/AgentPanel.tsx, new client jsdom tests, minimal related page wiring if needed. Do not change clock/date schemas or agent APIs.

- [x] Ensure old refresh closures cannot replace a different patient view. Guard identity changes, callbacks after mutations, errors and unmounts with request context generation.
- [x] Invalidate immutable research caches and posted candidate state by seedVersion; reset clears old content and a reused snapshot ID fetches new data. Minimize duplicate polling where practical.
- [x] Limit messages to 4000 characters before sending; rejected user messages stay visible as errors but do not poison future request history. Preserve safe history trimming and retry recovery.
- [x] Run real hook/component regressions in jsdom and write `/tmp/med-fix-client-report.md` with red/green evidence and changed files.

## Task 4: Controller integration, API/date contracts, dependencies and verification

**Own:** lib/domain/dateSchema.ts, lib/state/clock.ts, date-related clinic page wiring, app/api/{pro,snapshots,tasks,alerts}/** (shared DateOnly imports), package.json/package-lock.json, scripts/seed version, generated data manifests/expected, documentation and integration tests.

- [x] Add failing tests: real dates reject 2026-02-31/2026-99-99 and accept 2024-02-29; API invalid dates =>400; no invalid state mutations. Implement DateOnly via shape regex + UTC calendar round trip.
- [x] Fix today() using Asia/Shanghai date parts, expose consistent serverToday where pages currently slice UTC serverNow. Test midnight check-in and deadline behavior.
- [x] Validate PRO items by exact scale symptom keys, with 0..3 grades and missedDoses14d in 0..14; weekly flags must not carry endocrine-only adherence responses. Existing reset story must stay valid.
- [x] Update vulnerable dependency paths without an unreviewed major framework migration. Verify audited installed/lock versions and reject automated downgrade/major fixes. Migrate lint command if necessary.
- [x] Regenerate seed with version bump when generation changes, refill expected, and update measured checksum/counts in docs. Check twice-generated checksums and hard constraints.
- [x] Review each worker's diff, run full test/lint/type/build/e2e checks, and request an independent integrated review. Resolve actionable findings and update this plan with final evidence.


## Final evidence — 2026-10-14

Completed in the existing feature checkout without commits/staging/push. Independent task reviews and final integration spec/quality review pass; their findings were fixed and re-reviewed. Final verification: 30 unit test files / 332 tests, ESLint, whole-project typecheck, Next 15.5.27 build, and all 3 Playwright end-to-end tests pass. Seed gen-v4 checksum cc3217fe1d251f10 reproduced twice; zero hard constraints; default counts retained.

Dependency remediation leaves 5 high audit nodes on the single unpatched braces development-lint chain; production-only audit has 0 findings. This explicit residual replaces a claim of audit clean. Live model keys and clinical expert validation remain outside the synthetic demo verification.

Durable implementation and review record: `docs/superpowers/sdd-ledger/2026-10-14-review-fix-report.md`.
