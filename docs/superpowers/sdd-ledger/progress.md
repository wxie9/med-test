# SDD ledger — plan: docs/superpowers/plans/2026-10-13-breast-cancer-lifecycle-demo.md
Spec: docs/superpowers/specs/2026-10-13-breast-cancer-lifecycle-demo-design.md (read)
Branch: feat/demo-v1 (created from main @ c56de59). Models: all subagents = opus (user instruction 2026-10-13).
Ruling: work on branch feat/demo-v1 in-place, no worktree — repo is docs-only and user manages it directly; cost if wrong: none material.

## Preflight scan
| Pair / Task | Produces vs consumes | Found |
|---|---|---|
| T1→T2 | Patient type, inferLines, addDays | OK |
| T1→T4 | currentHer2, isHrPositive from lib/domain/her2 | OK (both defined in T1) |
| T2→T3 | loadSeed/Manifest; store test expects >2000 patients | OK (12+2000) |
| T3→T6/7/8/10 | getStore/now/newId/isOffHours | OK |
| T4→T8/9/10/11 | compute index exports | OK |
| T5→T6/T7 | transition from triggered via "assign" → unassigned; T6 test expects unassigned | OK |
| T7 self | invalid "close" from unassigned throws | OK |
| T8 self | createCohort with {} filter returns all | OK |
| T9 self | Step 2 creates lib/research/usecases.ts not in Files list | Ruling: add file; brief carries note — cost if wrong: none |
| T11 self | adapter references guidelineIds() and collectToolNumbers() undefined in plan | Ruling: implementer defines both in lib/agents/tools.ts (guidelineIds reads guidelines.json; collectToolNumbers recursive numeric collect incl. pct rounded 1dp) — cost if wrong: minor rework |
| T12→T6..T11 | E2E data-testids not listed in T6–T11 briefs | Ruling: controller carries testid list into each dispatch — cost if wrong: E2E fix round |
| T0 self | .gitignore already exists; create-next-app on non-empty dir | Note in dispatch: merge gitignore, keep docs/tasks/.claude/.superpowers |
| T2/T3 | cohort.json gitignored; tests need `npm run seed` first | Note in dispatch for T3+ |
| Global | npm run demo one-command | T0 defines ✓ |

## Execution
Task 0: implementer a62be71bf858d8eb2, BASE 86ef377, HEAD fdb9ea4, DONE_WITH_CONCERNS (localhost unresolvable on this Mac; vitest host set to 127.0.0.1).
Ruling: Playwright baseURL/webServer url will use http://127.0.0.1:3000 in Task 12 (env quirk, not a code defect) — cost if wrong: none.
Task 0: review by a379ecdfbe0d72163 — spec ✅, 1 Important (plan-mandated: playwright localhost URLs), minors deferred.
Task 0: minor (deferred): scaffold leftovers (default page.tsx, public/*.svg, title "Create Next App", lang="en") — Task 3 replaces page/layout and should delete the SVGs.
Task 0: minor (deferred): next/font/google network dependency in layout; globals.css Arial overrides it — Task 3 may switch to system fonts.
Task 0: minor (deferred): next lint deprecation notice; npm audit advisories untriaged; redundant .gitignore lines; no engines field.
Ruling (supersedes earlier): fix playwright URLs to 127.0.0.1 now in Task 0 fix round 1 rather than Task 12 — reviewer confirmed e2e would hang 120s; cost if wrong: none.
Task 0: fix round 1/5 (2 addressed, 0 open — playwright 127.0.0.1, dev server verified; commits fdb9ea4..40e166f)
Task 0: complete (commits 86ef377..40e166f, review clean)
Task 1: BASE 40e166f
Task 1: implementer afb582df8fb241dea, HEAD 93e7cb4, DONE_WITH_CONCERNS (inferLines docstring overstates rule; "ultra-low" never derived; same-date same-site sort tie).
Ruling: "ultra-low" is not derivable from the v1 data model (needs incomplete-membrane staining detail); keep the enum value for forward compatibility, but Task 8's filter UI offers only low/zero/positive and Task 2 generator does NOT set an ultra-low flag — cost if wrong: one filter option missing in demo.
Task 1: review by aaa35abd3019b7119 — spec ✅, 2 Important plan-mandated (inferLines docstring ≠ code; "ultra-low" never derivable), 6 minors deferred.
Ruling: keep lines-v1 behaviour (new line when a systemic event starts >28 days after current line start), rewrite docstring to match, add test for mid-line drug addition without progression → line 2 — cost if wrong: treatment-pattern counts in demo slightly off, no downstream contract change.
Ruling: remove "ultra-low" from Her2Class and CohortFilter.her2 (not derivable from v1 data model); Task 2 generator will NOT mark ultra-low despite plan text — cost if wrong: one classification absent from demo.
Task 1: minor (deferred): currentHer2 tie-break ignores readVersion and has no tests; ISH-only positive → indeterminate; "other" type never forms a line and previous line end not closed on new line; date fields accept any string; isHrPositive treats null as negative; some inferred types not exported.
Task 1: fix round 1/5 (2 addressed, 0 open — docstring + test; ultra-low removed; commits 93e7cb4..dd5a11e)
Task 1: complete (commits 40e166f..dd5a11e, review clean)
Task 2: BASE dd5a11e
Task 2: implementer a6170499956618c5b, HEAD e2495b3, DONE_WITH_CONCERNS (survivorship endocrine still ongoing; lost lastContact before events; P-B lacks progression outcome; P-A letrozole overlaps chemo; no entry-date field).
Task 2: review by a67d1261b364424b4 — spec ✅ (transcription exact), quality Needs fixes: 7 Important plan-mandated (endocrine concurrent with chemo incl. anchor A; validator too narrow; HR+/HER2+ no endocrine; survivorship endocrine ongoing; lost timelines impossible; rates off target; no entry-date for anchor L), minors.
Ruling: adjuvant endocrine starts 10 days after chemo ends (surgery+140) or surgery+40 without chemo; anchor A letrozole start → 2025-11-25, narrative "第 11 个月", PROs from 2025-12 — cost if wrong: story numbers shift, no contract change.
Ruling: metastasis date clamped ≥ surgery+150; adjuvant events truncated at metastasis with stopReason progression — cost: slight distribution shift.
Ruling: validator gains: death requires prior metastasis/progression/recurrence; deceased⇔death event; no PRO/adherence/ongoing treatment after death; neoadjuvant start < surgery; chemo must not overlap endocrine; adjuvant must not extend past metastasis — cost: none.
Ruling: HER2+ subtype ER drawn as 55% HR+ (10–100) / 45% 0; all HR+ get adjuvant endocrine — cost: none.
Ruling: survivorship only when adjuvant endocrine started >5y before cutoff; endocrine closed at start+5y "completed" — cost: none.
Ruling: lost patients: lastContact = max(enrolledAt, last event date)+0..100d and must be < cutoff−200d else not lost; ongoing events closed at lastContact with stopReason "lost" — cost: none.
Ruling: IHC pick ["0","0","1+","2+"]; unknown stopReason 4% per non-surgery finished event; external source 12% with 85% date stripping; add rate tests with tolerance — cost: none.
Ruling: add optional `enteredAt?: string` to Biomarker schema (Task 1 file) so anchor L can be late-entered; Task 8 snapshot will exclude biomarkers with enteredAt > cutoff — cost: small cross-task change, carried into Task 8 brief.
Ruling: anchor B gains progression outcome 2026-06-30 (imaging); anchor E gains endocrine in metastatic line 1; anchor G drug → tamoxifen; pre-2023 specimens readVersion "ASCO/CAP2018"; anchor A lastContact 2026-10-13; edge-case 3 → adjuvant-before-surgery; test var renamed her2PosShare; add anchors-pass-validator test — cost: none.
Task 2: minor (deferred): checksum covers cohort only; PRO missedDoses14d independent of adherence log in generator; metastatic biomarker copies primary ISH; TNBC never reach survivorship.
Task 2: fix round 1 implemented 60a1587 (gen-v2, checksum c2b1c6d314bd4143). Implementer concerns: 6%/event unknown-stop (patient-level 8.4%) accepted; P-E docetaxel removed (HP+letrozole L1) accepted; lost rate 3.95% accepted.
Ruling: patient-level rate targets govern, per-event probabilities are free; P-E simplified first line accepted; lost ≈4% accepted — cost if wrong: cosmetic.
Task 2: fix round 1/5 (8 addressed, 0 open; commits e2495b3..60a1587)
Task 2: minor (deferred): no negative unit tests for new validator rules; validator ignores treatment end after death; non-lost living patients' lastContact may precede a recent PRO/event; HER2+/HR+ metastatic L1 has no endocrine.
Task 2: complete (commits dd5a11e..60a1587, review clean)
Task 3: BASE 60a1587
Task 3: implementer abe5e45e4994dfb22, HEAD 6c01912, DONE_WITH_CONCERNS (as-unknown casts for lint; /api/state ≈7MB polled every 3s; clone not proven by test; docs/demo-script.md link 404; dark-mode block removed).
Ruling: /api/state default payload EXCLUDES patients; `?include=patients` returns them; `useDemoState(pollMs, include?)`; pages needing patient lists pass include — applied in Task 3 fix round if reviewer confirms, else carried to Task 6 — cost if wrong: a few extra fetch calls.
Ruling: nav page links to `/demo-script`; Task 12 adds `app/demo-script/page.tsx` rendering docs/demo-script.md — cost: none.
Task 3: review by a674f814a03a85027 — spec ✅, 2 Important (7MB payload per poll, plan-mandated; useDemoState overlap/stale race), minors.
Ruling: apply lite /api/state now (fix round 1): default excludes patients, adds patientCount; `?include=patients` returns full; hook `useDemoState(pollMs, include?)` with in-flight guard, sequence number, try/catch — cost if wrong: later pages must pass include.
Task 3: minor (deferred): invalid DEMO_FIXED_NOW throws; tests share global store order; structuredClone redundant (keep, comment).
Task 3: fix round 1/5 (all addressed; commits 6c01912..af43aaf)
Task 3: minor (deferred): hook has no fetch timeout/AbortController; awaited refresh() may be superseded; clone test resets only on success; link text still mentions docs/demo-script.md.
Task 3: complete (commits 60a1587..af43aaf, review clean)
Task 4: BASE af43aaf
Task 4: implementer a47e2a791fc8a785d, HEAD e4f0696, DONE_WITH_CONCERNS (latestBio vs currentHer2 specimen choice; ≤2 lines in seed; ECOG always unknown ⇒ finalMet always 0; lineReviewRate 1.3%; cutoff unused). Expected counts 93/960/380/53/138.
Ruling (pending review): ECOG must exist in data — add optional `ecog` to Patient, generator v3 assigns ECOG to metastatic patients (0/1 80%, 2 5%, unknown 15%), anchors get values, funnel ECOG criterion uses it; generator also marks 70% of synthetic lines "confirmed" — cost if wrong: checksum changes, expected counts unaffected.
Task 4: review by a442a3f845d7624a3 — spec ✅, 1 Important plan-mandated (ECOG always unknown ⇒ finalMet empty), 9 minors.
Ruling (supersedes pending ECOG ruling): do NOT add ECOG to the data model; add `verifyAtSite?: boolean` to Criterion — a verifyAtSite criterion records unknown counts/reasons but does not demote met patients; FunnelResult gains `pendingVerification: { criterionId, patientIds }[]`; ECOG criterion is verifyAtSite — cost if wrong: funnel semantics slightly different from spec text "信息不足", but spec story (candidates need clinician check) is preserved.
Task 4: minor (deferred): HR filter treats null ER/PR as negative; latestBio/currentHer2 tie-break differ; lineGapStatus ignores cutoff; qualityMetrics empty-cohort inconsistency; meanTakenRate is pooled; closedThisWeek rolling window; test gaps (adherence/patterns unasserted); seed lineReviewRate 1.3% and lopsided line-2 gap (consider generator v3 marking 70% lines confirmed in final review triage).
Task 4: fix round 1 implemented 2f68831 (finalMet 17, pendingVerification ecog 17). Note for Task 9: candidate count = finalMet.length, not ecog step met.
Task 4: fix round 1/5 (3 addressed, 0 open; commits e4f0696..2f68831)
Task 4: complete (commits af43aaf..2f68831, review clean). Note for Task 9 UI: funnel last bar must use finalMet.length / pendingVerification, not steps[last].met.
Task 5: BASE 2f68831
Task 5: implementer a56414f9fe99da8a2, HEAD db82679, DONE_WITH_CONCERNS (lint excludes tests/ by default; boundary semantics as brief).
Task 5: review by a252f95608c5c6605 — spec ✅, 0 Important, minors.
Task 5: minor (deferred): triggered→escalated edge dead (creation must assign immediately — carried to Task 6); escalation clock vs alertMetrics clock differ; tests lack escalated→accept, medium 24h, immutability, adherence-only cases; NEXT typed Record<string>; `_p` misnamed.
Task 5: complete (commits 2f68831..db82679, review clean)
Checkpoint A: controller ran npm test + build (below). Anchor clinical review by 项目方 deferred to Checkpoint C (user not available mid-run).
Ruling: Task 6 adds GET /api/patients/[id] + client hook usePatient(id) so patient pages never fetch the 7MB payload — cost if wrong: none.
Task 6: BASE db82679
Task 6: implementer ab25a832a6e1cb1f8, HEAD f8d0111, DONE_WITH_CONCERNS (small additions: feedback field, today in patient API, localStorage unread count, 今日未服 button, off-hours test env leak).
Task 6: review by a0491d6327bf4ab2e — spec ✅, 1 Important plan-mandated (yearly imaging due date fixed at surgery+365, already past for P-A), minors.
Ruling: roll yearly imaging to next anniversary; add test every due ≥ today; also fix off-hours test env hygiene and add daytime feedback-text assertion — cost if wrong: none.
Task 6: minor (deferred): today() is UTC date; ?patient= read only on mount; feedback colour keyed on offHours not emergency; items keys not validated against scale.
Task 6: fix round 1 implemented 6ff0180. Note: RTK hook rewrites 'npx eslint tests …' badly — tell implementers to use 'rtk proxy' or 'npx eslint ./tests …'.
Task 6: fix round 1/5 (3 addressed, 0 open; commits f8d0111..6ff0180)
Task 6: complete (commits db82679..6ff0180, review clean)
Task 7: BASE 6ff0180
Task 7: implementer a752cf9923652d730, HEAD 9069e2f, DONE_WITH_CONCERNS (closed section collapsed on reload — e2e note; close-note required; escalation only on /api/state; serverNow/task-row extras).
Task 7: review by ab8fe2250fc250f1b — spec ❌ on e2e compatibility (closed alert moves below open table so alert-row.first() no longer shows 已关闭), 1 Important, minors.
Ruling: option (a) — alerts closed during the current page session stay inline in the main table at their sorted position showing 已关闭; only alerts already closed at page load go to the collapsed section. Also require non-empty note + task on close at the API — cost if wrong: none.
Task 7: minor (deferred): UTC "today" in clinic pages; latestSpecimen duplicates currentHer2 ordering; ProTrend duplicate same-date ticks and fixed y-domain; patients list refetch 340KB/10s; test gaps (sortQueue, NEXT_ACTION, route 400s); PATCH enum accepts assign/escalate.
Task 7: fix round 1 implemented a96cf0d.
Task 7: fix round 1/5 (3 addressed, 0 open; commits 9069e2f..a96cf0d)
Task 7: minor (deferred): closedHere set added after refresh (one-frame window); never pruned.
Task 7: complete (commits 6ff0180..a96cf0d, review clean)
Ruling: serializeLite must strip snapshots[].patients (replace with patientCount) so the lite state stays small as snapshots accumulate — applied in Task 8 — cost if wrong: none.
Task 8: BASE a96cf0d
Task 8: implementer a96964d1326b48148, HEAD 777fa8f, DONE (cohort-count shows … until first preview; cohorts carry full patientIds in lite state; snapshot drops only late biomarkers). Snapshot v1 n=77 of 93 (consent filter).
Task 8: review by af8c97dad0ca8dadd — spec ❌ on e2e sync (duplicate snapshot id text; cohort-count no settled signal; create+submit two client requests), 3 Important, minors.
Ruling: snapshot id rendered once per snapshot (list item with data-testid="snapshot-id"); cohort-count exposes data-pending + aria-busy; POST /api/cohorts accepts {submit:true} as one server step and the status message gets data-testid="cohort-submitted"; lite state emits cohorts with patientCount instead of patientIds (full serialize keeps ids); enteredAt compared by date part — cost if wrong: none. Task 12 e2e must wait on data-pending=false and cohort-submitted.
Task 8: minor (deferred): cutoff regex accepts impossible dates; quality card fetched once per cohort id; brittle P-L test index; no route 400/404 unit tests; layout header magic number.
Task 8: fix round 1 implemented 15d6730.
Task 8: fix round 1/5 (5 addressed, 0 open; commits 777fa8f..15d6730)
Task 8: minor (deferred): preview failure leaves data-pending=true; cohort-submit enabled while pending; snapshots keep post-cutoff treatments/outcomes. Task 12 e2e must: POST /api/reset first; wait initial data-pending=false before clicking filters.
Task 8: complete (commits a96cf0d..15d6730, review clean)
Checkpoint B: controller ran npm test + build (below); 主线 A/C verified by implementers' curl/browser runs; 项目方 confirmation deferred to Checkpoint C.
Task 9: BASE 15d6730
Task 9: implementer a43cd02b5012d57f3, HEAD d544797, DONE_WITH_CONCERNS (typed result instead of any; per-chart n; adherence n=0 for metastatic snapshot; candidates endpoint pending Task 10).
Task 9: review by a5a0fdc5a06b82252 — spec ❌ (StatFooter lacks events/follow-up on most charts; patient-id arrays sent to pharma client), 2 Important, minors.
Ruling: every research use-case response carries `summary: { n, events, followUpMedian, cutoff }` (server-side) and every chart's StatFooter renders all four ("不适用" when N/A); feasibility response exposes counts only (finalMetCount, finalUnknownCount, pendingVerification: {criterionId,count}[]) — no patient ids reach the research client; Task 10 recomputes runFunnel server-side for the candidate request — cost if wrong: none.
Task 9: minor (deferred): lite-state polling from research portal carries clinic collections; percentile lower nearest-rank; survival test only checks type; zero segments dropped from DOM; fixed widths; decodeURIComponent on params.
Task 9: fix round 1 implemented 85ff476 (events count patients with event; line-gap footers use patterns n).
Task 9: fix round 1/5 (3 addressed, 1 open — overview summary.events sums per-type counts (139>n); +1 new Important: survival card footer shows combined events; commits d544797..85ff476)
Task 9: fix round 2 implemented 39011f9.
Task 9: fix round 2/5 (2 addressed, 0 open; commits 85ff476..39011f9)
Task 9: minor (deferred): no render test for survival footer; demo cohort has 0 deaths so grey card shows 事件数 0.
Task 9: complete (commits 15d6730..39011f9, review clean)
Ruling: lite /api/state emits candidateRequests as pharma summaries (id, snapshotId, protocolId, total, confirmed, createdAt) — no patient ids; clinicians fetch GET /api/candidates for full requests — applied in Task 10 — cost if wrong: none.
Task 10: BASE 39011f9
Task 10: implementer a90babb62dbac4b12, HEAD 7ac8980, DONE_WITH_CONCERNS (test regex fixed to P-\d{4}; pharmaView moved to lib/research/pharmaView.ts; repeat-confirm guard; protocolId ignored by funnel; latestPro often empty).
Task 10: review by a54fa1a72ca9d5ec3 — spec ✅ core, 2 Important (lite state messages leak confirmed patient ids to pharma poller; clinic card header button matches non-exact "确认" locator), minors.
Ruling: add GET /api/research/state (snapshot summaries, cohort id+name+patientCount, candidateRequests via pharmaView, manifest, agentMode, seedVersion, serverNow) and switch all research-portal polling to it; drop `messages` from serializeLite (no lite consumer); card header toggle gets aria-label and counts move outside the button — cost if wrong: none. Task 12 e2e uses exact:true for 确认.
Task 10: minor (deferred): protocolId ignored by funnel; confirmed→rejected allowed by API; PATCH maps all errors to 404; candidates.ts imports clinic label; clinicView rebuilds Map per poll; latestPro often "—".
Task 10: fix round 1 implemented c3037fe (ModeBadge uses research state on /research/**).
Task 10: fix round 1/5 (2 addressed, 0 open; commits 7ac8980..c3037fe)
Task 10: complete (commits 39011f9..c3037fe, review clean). Lite /api/state still carries alerts/tasks (clinic-internal; no auth in demo) — accepted.
Task 11: BASE c3037fe
Task 11: implementer a0445d29a346a86c5, HEAD 4539b62, DONE_WITH_CONCERNS (extra line_transition tool; raw English error in degraded notice; hand-written JSON schemas; providers tested with mocked fetch only).
Task 11: review by ad5cc98001bc725ae — spec ✅ mostly (missing "数据不支持" research boundary), 2 Important (research keyword routing too broad incl. write path; stop-medication boundary not enforced in model mode / narrow keywords), minors.
Ruling: research_gap requires 信息不足 + (原因|补齐|补录); add research_boundary template "当前快照数据不支持回答该问题" for OS/PFS/生存/疗效 etc.; patient_stop_med short-circuits to deterministic in every mode and keyword list widened (减量/剂量/换药/不吃药/停掉); degraded reason mapped to Chinese categories; provider budget 7.5 s; client trims history to last 20 turns — cost if wrong: none.
Task 11: minor (deferred): citations not checked against this turn's search; last round still sends tools; no round-cap/Claude-failure tests; research_count sums pendingVerification in template; panel header "待首次回复"; bound ids echoed in tool list; single-char stop words; create_gap_task offered every research turn.
Task 11: fix round 1 implemented 9df51a2.
Task 11: fix round 1/5 (5 addressed, 0 open; commits 4539b62..9df51a2)
Task 11: minor (deferred): OUTCOME substring match on "OS" (catches POSITIVE/DOSE); PERMITS_STOP_MED matches "不可以停药"; 5xx labelled 网络错误; guarded replies show configured mode in ModeBadge; consecutive user turns after a failed send.
Task 11: complete (commits c3037fe..9df51a2, review clean)
Task 12: BASE 9df51a2
Task 12: implementer aec4d9da4f5f16377, HEAD b11aa32, DONE_WITH_CONCERNS (A in month 11 not 14; first candidate is anchor P-K; no 建议草稿 quick question; ultra-low not implemented; DEMO_PERSIST unused). e2e 3/3 ×3 runs.
Task 12: review by aeb93c2ae9be1b9cf — spec ✅, 0 Important, minors.
Task 12: minor (deferred): story spec leaves server dirty (no afterAll reset); night-time reused-server failure not self-explaining; getByText snapshot id not exact; renderer drops #### and extra table cells; no raw-HTML-stays-text test; 缺 ISH denominator ambiguous; 失访 draw excludes deceased; 备用话术 missing for C/闭环; /demo-script lacks back link/title.
Task 12: complete (commits 9df51a2..b11aa32, review clean)
All tasks complete. Final whole-branch review: MERGE_BASE below.
Final review by afd872431b1990f83: 0 Critical, 12 Important, minors; triage recorded. Fix wave spec: .superpowers/sdd/2026-10-13-breast-cancer-lifecycle-demo/final-fix-wave.md. FIX_BASE b11aa32.
Ruling (final wave): F1 统计一致 = page==export==preview==unit test, assistant==snapshot n; F2 gen-v3 clip at cutoff + anti-HER2 after AC + cutoff validator; F3 everMetastatic filter, scripted cohort hrpos+evermet+cdk46 (no HER2 filter); F4 covered by F3; F5 second snapshot early endocrine + stopReasonDist; F6 keep protocol, candidate-open link, candidates ∩ research consent, P-B legitimately not a candidate; F7 action notes + doctor_draft + copy-to-note; F8 context-bound quick questions; F9 wider med guard + emergency template; F10 tasks merged into plan + feedback tool; F11 snapshot clips everything; F12 max_tokens 1500 + stop_reason handling, no unverified fields — cost if wrong: checksum/expected/doc numbers must be re-measured (done in wave).
Final fix wave: implementer a1283e86036b2f57d, b11aa32..e5a130f, DONE_WITH_CONCERNS (gen-v3 adds endocrine drug switching 10.3% for F5 chart; F11 clips undated biomarkers by specimen date; F8 lost/deceased mapping; F12 OpenAI length not handled). Checksum c010dc01451e15f8; expected 207/974/357/37/134; 175 unit, e2e 3/3 ×2.
Final fix wave re-review by abdf797b73285d135: all F1–F12 and promoted minors ADDRESSED; privacy boundary verified; docs numbers trace; unit 175, e2e 3/3.
Parked — Ruling: research_snapshot_size regex precedes research_count ("快照里符合条件的有多少例" → snapshot total) — real but non-blocking; cost: one odd assistant answer.
Parked — Ruling: single-char verbs 停/减/换 + 药 over-trigger safety template — errs safe; keep.
Parked — Ruling: lost-with-metastasis patients get early doctor quick questions — cosmetic.
Parked — Ruling: snapshot stage re-derivation only for deceased→metastatic at non-default cutoffs — demo cutoff unaffected.
Parked — Ruling: copy-draft copies last assistant reply of any kind — presenter uses it right after the draft question.
Parked — Ruling: OpenAI finish_reason "length" not degraded — real-key test before demo day is the human's step.
Parked — Ruling: docs nuance 缺 ISH 12 (any specimen) vs 信息不足 11 (latest specimen) — both correct; presenter note.
Final review clean after one fix wave. Ledger copied to docs/superpowers/sdd-ledger/ before workspace deletion.
