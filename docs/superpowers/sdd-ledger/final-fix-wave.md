# Final whole-branch review — fix wave (one dispatch)

FIX_BASE: b11aa32. Spec is the binding authority: docs/superpowers/specs/2026-10-13-breast-cancer-lifecycle-demo-design.md. Ledger: .superpowers/sdd/2026-10-13-breast-cancer-lifecycle-demo/progress.md.
Every item below carries a controller ruling; implement the ruling, not the reviewer's alternative, unless marked "your call".

## Important findings (all must be fixed in this wave)

### F1 — 统计一致 acceptance row not met; demo script overclaims
Ruling: the "三处一致" demonstration is: (a) clinic cohort page `cohort-count`; (b) a new "导出 CSV" button on `/clinic/cohorts` (`data-testid="cohort-export"`) that downloads the CURRENT filter's patients (id, stage, her2, hrPositive, currentTreatment, lastContact) — its data-row count equals (a); (c) `/api/cohorts/preview` count (already); (d) `tests/unit/compute.test.ts` expected.json assertions. For the research assistant: add a deterministic template `research_snapshot_size` routed on 快照…(共|有)多少例 / 样本量 that calls `count_cohort` with an empty filter and answers "当前快照共 N 例（数据截止 …）" — N equals the governance snapshot card n and the research overview n. Add research quick question "当前快照共有多少例？" (replace none; append as 4th). Update `docs/demo-script.md` to describe exactly this (page == export == preview == unit test; assistant == snapshot n) and remove any claim that the assistant reproduces cohort-page counts. Add an e2e assertion in story.spec: the research assistant's reply number equals the overview page's n (read from the overview StatFooter or /api/research/overview).

### F2 — generator emits events after the cutoff; anti-HER2 concurrent with anthracycline
Ruling (generator v3, bump VERSION to "gen-v3"): any treatment with start > cutoff is dropped; any treatment with end > cutoff becomes `end: null, stopReason: "ongoing"`; outcomes/PROs/adherence after cutoff are impossible by construction — add a validator rule "no treatment/outcome/PRO/adherence/biomarker date > cutoff" (validatePatients gets a second arg `cutoff` with default "2026-10-13"; anchors must pass too). Adjuvant anti-HER2 starts with the taxane phase: start = surgery + 21 + 56 (after 4 cycles AC), end = start + 365. Add negative unit tests for the new validator rules (purpose-built violating inputs) — this also closes the deferred T2 minor. Regenerate: `npm run seed` ×2 (identical checksum), run `npx tsx scripts/fill-expected.ts`, update `data/seed/expected.json`, `docs/data-generation.md`, `docs/demo-script.md` and README numbers (checksum, version, rates, counts) — every number must be re-measured, none carried over.

### F3 — "转移性" filter excludes deceased/lost ⇒ 0 deaths, survival never estimable
Ruling: add `everMetastatic?: boolean` to `CohortFilter` (true ⇒ patient has a `distant_metastasis` outcome, regardless of current stage); checkbox "曾发生远处转移（含已故/失访）" with `data-testid="f-evermet"` on `/clinic/cohorts`. Keep `stage` semantics unchanged. The scripted demo cohort becomes **HR 阳性 + 曾转移 + CDK4/6 经治** (NO HER2 filter — see F4): expected.json key `hrpos_her2low_metastatic_cdk46` is REPLACED by `hrpos_evermet_cdk46` with filter `{ hrPositive: true, everMetastatic: true, priorCdk46: true }` (fill the count). The e2e story checks `f-hrpos`, `f-evermet`, `f-cdk46`. Keep `metastatic_on_adc` and the other keys.

### F4 — scripted funnel shows no real 信息不足
Ruling: covered by F3's cohort (no HER2 pre-filter ⇒ her2_low step yields 不符合 for zero/positive and 信息不足 for IHC 2+ without ISH; `no_prior_adc` can yield 信息不足 for external ADC without dates if any). Add an e2e assertion that on the feasibility page the her2_low funnel-step row shows an 信息不足 count > 0 (expose `data-testid="funnel-unknown"` on the unknown count element per row, or read the row text). If the regenerated data yields 0 unknown at that step, adjust the generator so ~5% of IHC 2+ lack ISH among metastatic patients too (today the 5% rule applies to all; verify it reaches the cohort) — report the measured number.

### F5 — adherence use case empty in the scripted demo; discontinuation reasons missing
Ruling: the demo script and e2e create a SECOND cohort+snapshot: `early_endocrine_ongoing` (`f-hrpos`, `f-stage-early_adjuvant`, `f-cur-endocrine`) → snapshot `SNAP-2026-10-13-v2` → research adherence page shows n > 0. Extend `adherenceStats` with `stopReasonDist: Record<string, number>` computed from adjuvant endocrine events that ENDED with a stopReason other than "completed"/"ongoing" (toxicity/patient_choice/progression/unknown/lost) across the snapshot, and render it as a second chart "停药原因分布（按治疗事件）" on the adherence page. e2e: assert adherence page StatFooter n > 0 for snapshot v2.

### F6 — loop closes on P-K via hand-typed URL
Ruling: keep protocol XX-ADC-301 (excluding prior ADC is realistic; patient B is legitimately not a candidate — this is a recorded ruling, state it in the script's 故障应对 and in 闭环 segment). Add on each candidate row a link "打开患者视图" (`data-testid="candidate-open"`, href `/patient/research?patient=<id>`, opens in the same tab). Script uses that link instead of typing a URL. Also exclude candidates without `consent.research` from `requestCandidates` (candidates = finalMet ∩ consent.research) and show "科研同意：是/否" on the candidate row — update the unit test and the pharma `total` accordingly; re-measure and update docs.

### F7 — spec A3 (record the call) and A4 (建议草稿) not demonstrable
Ruling: (a) `开始处置` and `提交复核` row actions open a small inline note input (optional on 开始处置, REQUIRED non-empty on 提交复核; testids `action-note`, `action-confirm`); the note is passed to `actOnAlert`. e2e fills "电话沟通：关节痛导致漏服" at 开始处置 and "已沟通，建议复评" at 提交复核. (b) Add doctor template `doctor_draft` + quick question "根据最近一次问卷起草症状处理建议" that reads the latest PRO (top 2 symptoms by grade), searches guidelines by those symptom names and the patient's current therapy class, and renders a draft (symptom → suggested management bullet → "以上为草稿，需医生确认"); numbers only from tools; citations required. The clinic close dialog gets a button "复制最近助手草稿到处置说明" that copies the last `agent-reply` text of the panel into `close-note` (client-side only).

### F8 — quick questions not bound to context
Ruling: `QUICK_QUESTIONS` becomes a function of context: patient → by stage (`early_adjuvant`/`survivorship`: ["我最近关节痛，能不能先停药？","下次要做什么检查？","参加临床研究需要注意什么？"]; `metastatic`: ["最近恶心乏力明显，能不能少打一次？","下次要做什么检查？","参加临床研究需要注意什么？"]); doctor → early: ["总结这位患者的治疗经过","根据最近一次问卷起草症状处理建议","辅助内分泌治疗依从性差时指南建议是什么？"], metastatic: ["总结这位患者的治疗经过","当前线不良事件按 CTCAE 如何分级记录？","指南对 CDK4/6 后 HER2 低表达的推荐是什么？"]; research unchanged + F1's 4th question. The server resolves stage from the patient id (AgentPanel fetches `/api/agent/quick?agent=&patientId=` or the page passes stage — your call, keep it simple). The CTCAE template must search guidelines by the patient's actual top symptoms and current drug class (not a fixed string). The e2e button "参加临床研究需要注意什么？" must remain present for every stage.

### F9 — medication boundary bypass in model mode; deterministic falls to generic
Ruling: input keyword list for `patient_stop_med` adds 少打/少吃/跳过/推迟/暂停/不打/漏服一次/自己停; any patient question containing 药/打针/化疗/输液 AND one of those verbs routes to the safety template in EVERY mode (short-circuit). Output guard regex becomes `/(?<!不)(可以|不妨|建议|不如)(先|直接)?(停药|减量|换药|停掉|少打|少吃|跳过|推迟|暂停)/`. Severe-symptom escalation: patient text containing 发热/高烧/出血/呼吸困难/胸痛/意识 → template `patient_emergency` ("请立即联系…急诊…值班电话 021-0000-0000（演示）") in every mode. Fix the deferred T11 minors here too: OUTCOME uses `\b(OS|PFS)\b` word boundaries for the Latin tokens; PERMITS uses the lookbehind above. Tests for each new phrasing and for "不可以停药" not degrading.

### F10 — clinician follow-up tasks never reach the patient's plan
Ruling: `buildFollowUpPlan(p, today, tasks?)` merges OPEN `FollowUpTask`s for the patient as plan items `{ title: task.type + "（医生安排）", due: task.due, kind: "visit" }`; patient plan page, home "下一个随访项" and the `get_followup_plan` tool pass the patient's tasks. Add butler tool `get_latest_feedback(patientId)` returning the latest `plan_update`/`alert_feedback` message text (no ids), and a template `patient_feedback` routed on 医生怎么说/处理结果/反馈. e2e: after the close step, `/patient/plan` lists an item containing "复评".

### F11 — snapshot cutoff only clips biomarkers
Ruling: `createSnapshot` clips EVERYTHING at cutoff: treatments starting after cutoff dropped, treatments ending after cutoff → end null/ongoing, outcomes/PROs/adherence after cutoff dropped, `lastContact = min(lastContact, cutoff)`, biomarkers as today; lines re-inferred from the clipped treatments (keep reviewStatus confirmed where ids match). Unit test with an early cutoff on P-B (its T-DXd event must vanish for cutoff 2026-07-01).

### F12 — Claude provider likely degrades every turn
Ruling: raise `max_tokens` to 1500; handle `stop_reason` `max_tokens` → degrade category 输出未通过校验 (detail "max_tokens") and `refusal` → 输出未通过校验; do NOT add unverified request fields. Add a README "演示前请用真实密钥试跑一次" note. (Real-key testing is the human's job before demo day.)

## Deferred minors promoted to this wave
- T12: add `test.afterAll` reset in story.spec; 备用话术 for segments C and 闭环 in the script.
- Candidate row shows 科研同意 (F6).
- P-K `expertNote`: rewrite so it does not contradict `lineGapStatus` (say it is counted as 已进入下一线 by rule and that the clinician may annotate).
- Missing [后续] labels: add "MDT 资料包 [后续]" box on clinic patient detail and "援助项目 [后续]" entry on the patient home.
- Unread badge: track seen message ids (localStorage set) instead of timestamp comparison.
- Reset button on `/` also clears localStorage keys `demo.patientId`, `demo.clinicIdentity`, `demo.seen*`.
- Bone density rule: drug name contains 唑 OR 依西美坦.
- `next.config.ts`: `allowedDevOrigins: ["127.0.0.1"]`.

## Verification required in the fix report
npm test, tsc, lint (both), build, `npm run seed` twice (identical checksum), `npm run e2e` twice (all green), and a table of every number changed in docs (old → new, source).
