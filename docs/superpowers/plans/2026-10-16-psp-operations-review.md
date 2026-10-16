# PSP 例外队列与修订核对 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已确认的内部例外队列与审核修订对照接入现有可操作 PSP demo，分别验证并提交。

**Architecture:** 服务端在既有内部读取中派生队列和明确父版差异，不建立新写入账本。展示层复用既有处理命令、身份与错误恢复规则；药企专用读取保持独立。

**Tech Stack:** Next 15.5.27、React 19、TypeScript、Vitest、Testing Library、Playwright、OpenNext Cloudflare Worker。

## Global Constraints

- 队列按读取响应中的 `serverNow` 判断当前状态，不用浏览器时间，也不借用月报 `cutoffAt`。
- `dueAt < serverNow` 才为逾期，恰好相等不算逾期。
- 汇总授权独立：仅撤回汇总授权不阻断已获服务授权的内部服务。
- 队列条数是内部运营事项数，不是患者人数、事件次数或月报分母。
- 同一次联系覆盖两条预警，只形成一条联系未成功事项，列出仍待处理的关联目标。
- 对照只比较当前报告与其明确的 `parentVersionId`，不是列表中的另一份“最新报告”。
- 旧版签署只存在于旧版历史，不能带入新修订。
- 仅新增读取模型，不修改持久化 schema、报告摘要算法、不可变字节、签署绑定、CAS 或原请求回执。
- 不部署、不推送，不重置用户当前 `localhost:3000` 演示；测试使用独立运行实例。

详细设计：`docs/superpowers/specs/2026-10-16-psp-operations-review-design.md`。各任务只需读取自身相关章节与全局约束。

---

### Task 1: 内部例外队列

**Files:**
- Create: `lib/psp/exceptionQueue.ts`, `components/psp/ExceptionQueue.tsx`
- Modify: `lib/psp/views.ts`, `components/psp/ServiceDesk.tsx`
- Modify if needed for exact target navigation: `components/psp/ServiceWorkflow.tsx`, `components/psp/Common.tsx`
- Test: `tests/unit/psp-exception-queue.test.ts`, `tests/unit/psp-exception-queue-ui.test.ts`, existing service/view tests as needed

**Interfaces:**
- Consumes: `DemoStore`, `membershipAt`, `permissionAt`, `projectEnrollmentForAlert`, `now`, original assignments/serviceEvents/educationEvents/corrections/alerts.
- Produces: `projectExceptions(store: DemoStore, at: string): PspException[]`, exported `PspException` type; `InternalProjectView.exceptions: PspException[]`; `ExceptionQueue` component.
- Queue kinds: `overdue_questionnaire`, `failed_contact`, `pending_review`, `education_help`.
- Each item exposes stable `id`, kind, `patientId`, `displayName`, role responsibility, optional known `dueAt`, source time, `overdue`, reason, blocked reason and precise existing workflow navigation target. Additional target refs support one interaction covering multiple still-open targets.

- [ ] **Step 1: Write failing domain tests.** Use `buildPspTestStore`/`installPspTestStore` and real PSP commands for representative flows. Start with the baseline overdue questionnaire assertion:

```ts
const rows = getInternalProjectView(projectId, 'case_manager', 'case-manager-chen').exceptions;
expect(rows.some(row => row.kind === 'overdue_questionnaire' && row.patientId === 'P-A')).toBe(true);
```

Add cases from design §2: exact due boundary/future evidence; failure covering two alerts deduplicates, partial recovery keeps remaining targets; pending review requires project disposition and does not invent deadline; needsHelp follows explicit future contact through completion; background help without link needs verification; service withdrawal/member pause/exit/project end block and explain, aggregate withdrawal alone allows; correction flags leave original completion unchanged; no unrelated project/seed or unauthorized public access. Assertions must check real conditions, not only row totals.

- [ ] **Step 2: Run RED.** `npm test -- tests/unit/psp-exception-queue.test.ts`. Record expected missing-feature failures before production changes.
- [ ] **Step 3: Implement the projection and internal read integration.** Keep one small module for rule derivation. Reuse original contact and education associations; deterministic sorting; clone data rather than returning mutable aliases. No per-patient HTTP fanout. Do not modify commands or persisted records.
- [ ] **Step 4: Write and observe failing UI tests, then integrate.** Render `ExceptionQueue` with representative domain rows. Assert type/role/overdue filters, explicit empty states and server timestamp, unknown reviewer deadline, blocked actions, names and working target hrefs. Mount ServiceDesk to test pending command navigation locks, read-error hiding and role/reset stale-response barriers. Retain original request/retry ownership; add refresh with `clearOnReadError` semantics appropriate for new patient data.
- [ ] **Step 5: GREEN and self-review.** Run focused tests plus original service/view/workflow tests, `npm run lint`, `npx tsc --noEmit`, then full `npm test -- --maxWorkers=4` before commit. Record real output, including pre-existing warnings. Do not start shared live servers.
- [ ] **Step 6: Commit.** Stage only Task 1 files. `git commit -m "feat(psp): add internal service exception queue"`. Report RED/GREEN, exact changed files and commit to controller for task review.

### Task 2: 审核修订对照

**Files:**
- Create: `lib/psp/reportComparison.ts`, `components/psp/ReportRevisionReview.tsx`
- Modify: `lib/psp/reportTypes.ts`, `lib/psp/reports.ts`, `components/psp/ReportDraftDesk.tsx`
- Modify if useful for role guidance reuse: `components/psp/ReportWorkbenchCards.tsx`
- Test: `tests/unit/psp-report-comparison.test.ts`, `tests/unit/psp-report-comparison-ui.test.ts`, relevant existing report UI/authorization tests

**Interfaces:**
- Consumes: `PspReportVersion`, `ReportWorkflowMetadata`, `ReportActionEvent`, `reportCanonical`, original `projectReport` workflow and action gates.
- Produces: `compareReportRevision(current: PspReportVersion, versions: PspReportVersion[], events: ReportActionEvent[]): ReportRevisionComparison`; exported comparison type; internal `PspReportDetail.revisionComparison`; `ReportRevisionReview` component.
- Comparison distinguishes initial/unavailable/compared. A compared result identifies the explicit parent and its return/client-change feedback; separate snapshot/window/content/rule changes; metric changes aligned by `metricKey`; multiset added/removed/unchanged nextActions preserving duplicate counts and timestamp precision. It never uses internal raw metrics as an input.

- [ ] **Step 1: RED domain tests.** Build report versions via existing snapshot/report/review commands. Verify r1→r2 only changes arrangements, preserves frozen facts and old bytes; new snapshot with identical visible facts does not mark all fact IDs as changed; status/value/definition changes are actual metric changes; duplicate arrangements and precise instants; first/unavailable/wrong seed/project/batch; explicit parent feedback and own signatures. Start with:

```ts
const detail = readInternalReport(revised.id, 'data_reviewer', 'data-reviewer-psp', seedVersion);
expect(detail.revisionComparison.status).toBe('compared');
expect(detail.revisionComparison.parent.id).toBe(original.id);
```

- [ ] **Step 2: Run RED.** `npm test -- tests/unit/psp-report-comparison.test.ts`; record failures before production changes.
- [ ] **Step 3: Implement pure comparison and internal detail integration.** Parent lookup must match explicit id+project+seed+batch. Use protected fixed facts only; do not recalculate or rewrite any report. Keep workflow events local to their version. Return fresh values in same authorized response.
- [ ] **Step 4: RED UI tests, then UI integration.** Show review pack before action panel; status and current/parent feedback clearly distinct; differences readable without raw JSON; current submission and double-sign handoff. Update workspace title. Retain report context when switching staff, while old response/write scope retires. Verify 503 exact retry,409 explicit acknowledgement and no enabled gate override. Test source revoked, stale revision and post-sign waiting states.
- [ ] **Step 5: GREEN and self-review.** Run comparison/UI tests and original report/review/delivery/public-boundary tests, lint/typecheck, full unit suite before commit. Include public DTO negative assertions that internal comparison and notes are absent.
- [ ] **Step 6: Commit.** `git commit -m "feat(psp): add revision comparison and review handoff"`; report exact evidence and concerns for task review.

### Task 3: 端到端验收与交接

**Files:**
- Create: `tests/e2e/psp-operations-review.spec.ts`
- Modify: relevant existing E2E selectors only when new truthful UI changes require them, `docs/demo-script.md`, `PRODUCT.md`
- Create: `docs/superpowers/sdd-ledger/2026-10-16-psp-operations-review-report.md`
- Update: this plan/spec progress checkboxes after actual completion

**Interfaces:**
- Consumes the two completed features on the existing owned Next/Worker E2E runtimes, using original PSP routes and command metadata.
- Produces actual workflow assertions, desktop/narrow screenshots, verified gates and documented demonstration steps.

- [ ] **Step 1: Add meaningful E2E.** Reset only owned runtime. Exercise questionnaire/failure/recovery/doctor-review/education-help queue transitions and unchanged other tasks. Exercise r1 return→r2 arrangement→comparison→data+medical sign→delivery→client acceptance. Use real commands to prepare preconditions and UI for new feature interactions and key workflow steps. Assert API values plus rendered state, no fabricated reviewer deadline, explicit targets, public projection exclusion and immutable old version.
- [ ] **Step 2: Run focused Next E2E.** `npx playwright test tests/e2e/psp-operations-review.spec.ts`. Fix reproducible product/test defects with regression tests; no increased timeouts/retries for concealment.
- [ ] **Step 3: Full checks after code freeze.** `npm test -- --maxWorkers=4`, `npm run lint`, `npx tsc --noEmit`, `npm run e2e`, `npm run build:worker`, `npx wrangler deploy --dry-run --outdir /tmp/med-psp-operations-review-dry-run`, `npx playwright test --config playwright.worker.config.ts`. Use bundled Node24.19 and owned isolated runtimes. Do not re-run passed gates without a changed source/failure/unresolved risk.
- [ ] **Step 4: Inspect representative screenshots.** 390px and1440px widths show full names, reasons, controls and comparisons without horizontal overflow; review focus/semantics and long feedback. Preserve evidence outside Playwright output directories before any later run overwrites them.
- [ ] **Step 5: Documentation and whole-branch review.** Record precise results, limits and source commits, update demonstration script. Fresh review covers spec+quality and public/privacy/immutable boundaries. Fix important findings and run covering checks before re-review.
- [ ] **Step 6: Commit and integrate locally.** `git commit -m "test(psp): verify operations and revision review workflow"`; confirm main remains clean/expected before fast-forward. No push/deploy. Preserve ignored QA evidence in the managed checkout.
