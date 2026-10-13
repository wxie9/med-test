# Final fix wave — report

FIX_BASE b11aa32 → HEAD e5a130f, branch `feat/demo-v1`. Status: **DONE_WITH_CONCERNS** (every ruling is implemented as written; some rulings needed small additions to hold up in the scripted demo, listed under Concerns).

## Commits (in order)

| SHA | Subject |
|---|---|
| 737221c | fix(seed): gen-v3 clips events at the cutoff, anti-HER2 after AC, cutoff validator rules (F2) |
| ae4f7a5 | feat(cohorts): everMetastatic filter and f-evermet checkbox; demo cohort HR+ / ever metastatic / prior CDK4/6 (F3) |
| de910e5 | feat(research): funnel-unknown testid per step; demo cohort shows real 信息不足 at HER2-low (F4) |
| adf7733 | fix(governance): snapshot clips every record at the cutoff (F11) |
| 060251a | feat(research): second snapshot for adherence; stop-reason distribution chart (F5) |
| 9b587c6 | feat(candidates): 打开患者视图 link per candidate; candidates require research consent (F6) |
| 3a4e44f | feat(stats): 导出 CSV on the cohort page; research_snapshot_size template (F1) |
| e6d3e74 | feat(clinic): action notes on 开始处置/提交复核; doctor_draft 建议草稿; copy draft into the close note (F7) |
| 74a054d | fix(agents): wider medication boundary, emergency template, word-bounded OS/PFS (F9) |
| 2d82761 | feat(agents): quick questions bound to the patient's stage; CTCAE by actual symptoms (F8) |
| 5ede8ef | feat(patient): clinician follow-up tasks join the patient's plan; 医生怎么说 feedback (F10) |
| ce334f4 | fix(agents): Claude max_tokens 1500; truncated or refused turns degrade (F12) |
| 4f08ce1 | fix: promoted minors — seen ids, reset clears demo storage, [后续] boxes, P-K note, AI bone density, allowedDevOrigins |
| 3e2d8cb | fix(patient): newest message wins on equal timestamps (F10 follow-up) |
| e5a130f | docs: re-measured numbers for gen-v3; script follows the fix wave (F1-F12, T12) |

F9 was done before F8 because the new metastatic patient quick question (少打一次) only passes the "every quick question" test once the F9 keywords exist.

## Per finding

### F1 — 统计一致
- Changed: `lib/clinic/cohortExport.ts` (new, `cohortCsv`), `app/api/cohorts/export/route.ts` (new, POST {filter} → text/csv with BOM, `x-row-count`), `app/clinic/cohorts/page.tsx` (button `data-testid="cohort-export"` "导出 CSV（当前筛选 N 例）", disabled while the preview is pending; `data-testid="cohort-name"` on the name input), `lib/agents/templates.ts` (`research_snapshot_size`, routed on `/快照.*(共|有)多少例|样本量/` before `research_count`; calls `count_cohort({filter:{}})`; text "当前快照共 N 例（数据截止 …）…"), `lib/agents/tools.ts` (`count_cohort` result also returns `cutoff`), `lib/agents/quickQuestions.ts` (4th research question "当前快照共有多少例？"), `docs/demo-script.md` (统计一致 paragraph; no claim that the assistant reproduces cohort-page counts).
- CSV columns: `patient_id,stage,her2,hr_positive,current_treatment,last_contact` (stage/HER2 class codes, hr true/false, current treatments = ongoing drugs joined by "+").
- Tests: `tests/unit/cohorts-route.test.ts` (for every expected.json key: CSV data rows == preview count == expectedCount; row content for P-B; 400), `tests/unit/agents.test.ts` "research_snapshot_size" (routing, exact text, tool call, == overview n). e2e story: page count == expected `hrpos_evermet_cdk46` == downloaded CSV data rows == `/api/cohorts/preview`; research assistant's "当前快照共 N 例" == `/api/research/overview` n.
- Evidence (live API, flow script): preview 207, CSV rows 207, cohort 207; assistant "当前快照共 169 例（数据截止 2026-10-13）", overview n 169, snapshot card 169.

### F2 — generator gen-v3
- Changed: `lib/seed/generator.ts` (adjuvant trastuzumab start = surgery + 21 + 56, end = start + 365; after building treatments: start > cutoff dropped, end > cutoff → `end: null, stopReason: "ongoing"`; metastatic biopsy only when its date ≤ cutoff; line-2 drug uses the latest biomarker), `lib/seed/validate.ts` (`validatePatients(ps, cutoff = "2026-10-13")`, new rule: any treatment start/end, outcome, PRO date, adherence date, biomarker specimen date > cutoff), `scripts/generate-seed.ts` (VERSION "gen-v3", validates anchors + cohort with CUTOFF), seed regenerated, `scripts/fill-expected.ts` run, expected.json/manifest updated.
- Tests: `tests/unit/generator.test.ts` — cohort has no date after the cutoff, adjuvant anti-HER2 starts ≥ surgery + 77 (not with AC), some adjuvant anti-HER2 ongoing at the cutoff; new describe "validator: cutoff rules (purpose-built violations)": clean anchor at default and explicit cutoff, flags late treatment start, late treatment end, late outcome / PRO / adherence / biomarker, later cutoff accepts the same dates (closes deferred T2 minor).
- Evidence: `npm run seed` ×2 → `seed ok c010dc01451e15f8` both times; anchors + cohort violations 0 (also re-checked with the validator over the files).

### F3 — everMetastatic
- Changed: `lib/domain/types.ts` (`CohortFilter.everMetastatic?`), `lib/compute/filter.ts` (`everMetastatic(p)` = has a `distant_metastasis` outcome), `lib/clinic/cohortFilter.ts` (form state + mapping), `components/clinic/CohortFilterForm.tsx` (group 转移史, checkbox "曾发生远处转移（含已故/失访）", `data-testid="f-evermet"`), `lib/agents/tools.ts` (count_cohort schema doc), `data/seed/expected.json` (key `hrpos_her2low_metastatic_cdk46` replaced by `hrpos_evermet_cdk46` {hrPositive, everMetastatic, priorCdk46}; other keys kept), story + reset e2e use the new filter. `stage` semantics unchanged.
- Tests: `tests/unit/compute.test.ts` (everMetastatic includes deceased, P-B/P-J/P-K, complement sums to all, stage "metastatic" still excludes deceased), `tests/unit/cohort-filter.test.ts`, `tests/unit/cohorts-route.test.ts` (uses the new key), `tests/unit/research-route.test.ts` (demo cohort snapshot: deaths ≥ 10, survival estimable).
- Evidence: cohort 207 = metastatic 161 + deceased 36 + lost 10; SNAP v1 deaths 28 → survivalEstimable true.

### F4 — real 信息不足 in the scripted funnel
- Changed: `components/FunnelChart.tsx` (`data-step={id}` on each row; count element `data-testid="funnel-unknown"`).
- Generator change NOT needed: measured her2_low step on SNAP v1 = 符合 94 / 不符合 64 / 信息不足 11 (reason "IHC 2+ 缺 ISH 或结果未知" 11). no_prior_adc step 信息不足 2 (external ADC without dates / carried unknowns).
- Tests: `tests/unit/research-route.test.ts` (her2_low unknown > 0, notMet > 0, reason count == unknown); e2e reads the her2_low row's `funnel-unknown` > 0.

### F5 — second snapshot, stop reasons
- Changed: `lib/compute/adherence.ts` (`stopReasonDist`: adjuvant endocrine events across the whole snapshot with `end !== null` and stopReason in toxicity/patient_choice/progression/unknown/lost/death, counted per event), `components/research/ReasonBars.tsx` (new), `app/research/[snapshotId]/adherence/page.tsx` (second chart "停药原因分布（按治疗事件）", `data-testid="stop-reason-chart"`, its own StatFooter), `app/governance/page.tsx` (equal createdAt → newest submitted first), e2e story creates `early_endocrine_ongoing` (f-hrpos, f-stage-early_adjuvant, f-cur-endocrine) → card by name → `SNAP-2026-10-13-v2` → adherence StatFooter n > 0 and the chart visible.
- Generator addition (see Concerns): 15% of adjuvant endocrine patients stop the first drug 90–720 days after start (toxicity 55% / patient_choice 30% / unknown 15%) and switch (AI ↔ tamoxifen) 7–30 days later; survivorship counts five years from the first endocrine drug and completes the ongoing one. Without this, every adjuvant endocrine event in the early_endocrine_ongoing cohort is ongoing and the v2 chart is empty (measured `{}` before the addition). Edge-case death injection moved to the front of the outcomes list (one base patient became deceased under gen-v3 and its injected death was otherwise not the first death found).
- Tests: `tests/unit/compute.test.ts` (stopReasonDist on constructed events: counts toxicity and P-B's progression, ignores completed / metastatic intent / ongoing), `tests/unit/research-route.test.ts` (v2-equivalent snapshot: adherence n > 0, stop reasons > 0, no completed/ongoing keys).
- Evidence: SNAP v2 806 patients, adherence n 805, stopReasonDist {toxicity 43, patient_choice 26, unknown 16}; SNAP v1 adherence n 0 with stopReasonDist {progression 142, unknown 11, toxicity 9, patient_choice 3}.

### F6 — candidate-open link, research consent
- Changed: `lib/research/candidates.ts` (candidates = finalMet ∩ `consent.research` of the snapshot copy; `candidateSummary.consentResearch`), `components/clinic/CandidateRequestCard.tsx` (columns 科研同意 "科研同意：是/否" `data-testid="candidate-consent"` and 患者端 link "打开患者视图" `data-testid="candidate-open"`, href `/patient/research?patient=<id>`, same tab), `components/research/CandidateRequestPanel.tsx` (text "（N 例，仅含已同意科研联系者）"). Protocol XX-ADC-301 unchanged; P-B non-candidate recorded in the script's 闭环 and 故障应对.
- Tests: `tests/unit/candidates.test.ts` (ids == finalMet filtered by consent; pharma total == that length; a met patient whose consent is withdrawn is excluded), `tests/unit/candidates-route.test.ts` (summary keys incl. consentResearch). e2e: asserts "科研同意：是" and clicks `candidate-open`, URL `/patient/research?patient=<pid>`.
- Evidence: SNAP v1 finalMet 20 → candidates 17 (pharma total 17); first candidate P-K; P-B in the snapshot but not a candidate.

### F7 — A3 notes, A4 draft
- Changed: `components/AlertQueue.tsx` (开始处置 / 提交复核 open an inline note row: `action-note`, `action-confirm`; optional on 开始处置, required on 提交复核 — confirm disabled while empty), `app/api/alerts/[id]/route.ts` (refine: submit_review requires non-empty note), `lib/clinic/actions.ts` (actOnAlert also rejects submit_review without a note), `lib/agents/tools.ts` (doctor tool `get_latest_pro`: date, scale, symptoms sorted by grade), `lib/agents/templates.ts` (`doctor_draft`: top 2 symptoms with grade ≥ 1, `ctcae_grade` per symptom/grade, `search_guidelines` by those symptoms + current therapy class (aromatase inhibitor → "AI"), bullets "症状（N 级）→ 处理", relevant guideline line, last line "以上为草稿，需医生确认。"; no PRO / no symptom cases handled), `components/clinic/CloseAlertDialog.tsx` (button `copy-draft` "复制最近助手草稿到处置说明" copies the last `agent-reply` text on the page into `close-note`; hint when none; note wrapper changed from label to div so the button does not become the label's control).
- Tests: `tests/unit/alerts-route.test.ts` (start without note 200, submit_review without / blank note 400, with note 200, notes recorded; actOnAlert throws), `tests/unit/clinic-actions.test.ts`, `tests/unit/agents.test.ts` "doctor_draft" (P-B: 恶心/乏力 2 级, query "恶心 乏力 ADC", G-017 cited, validation ok; P-A after a new PRO: query "关节痛 潮热 AI", citations G-004/G-005/G-006). e2e fills "电话沟通：关节痛导致漏服" at 开始处置 and "已沟通，建议复评" at 提交复核 (asserts confirm disabled while empty) and asks the draft question on `/clinic/patients/P-A` (reply contains "关节痛（2 级）" and "以上为草稿，需医生确认").
- Evidence (live API): P-A alert notes ['电话沟通：关节痛导致漏服', '已沟通，建议复评', '2 周后复评'].

### F8 — context-bound quick questions
- Changed: `lib/agents/quickQuestions.ts` (`quickQuestions(agent, stage?)` with the exact ruled lists; metastatic lists for stage metastatic or deceased, early lists otherwise), `app/patient/assistant/page.tsx` (loads the patient, passes its stage), `app/clinic/patients/[id]/page.tsx` (passes `p.stage`), feasibility page (`quickQuestions("research")`). `doctor_ctcae`: grades the latest PRO's top symptoms plus the class-typical AEs, searches guidelines by `[top symptoms, therapy class, 不良事件, CTCAE]`, and prints "最近一次问卷（date）报告：…" plus the guideline line. `doctor_guideline` picks guideline vocabulary out of the question (so the early adherence question cites G-002).
- Tests: `tests/unit/agents.test.ts` "F8" (exact lists per stage, 4 research questions, "参加临床研究需要注意什么？" for all five stages; metastatic patient question answered by the safety template; adherence guideline → G-002 first; CTCAE query "恶心 乏力 ADC 不良事件 CTCAE" for P-B and "腹泻 ADC 不良事件 CTCAE" after a new PRO), and the "every context's quick questions" test now runs all five lists (patient early/metastatic, doctor early/metastatic, research) through validation. e2e still clicks "参加临床研究需要注意什么？" for the metastatic candidate (P-K).

### F9 — medication boundary, emergency
- Changed: `lib/agents/templates.ts` (patient_stop_med = explicit phrases incl. 少打/少吃/跳过/推迟/暂停/不打/漏服一次/自己停, OR 药/打针/化疗/输液 + a stop/skip/delay verb; new `patient_emergency` on 发热/高烧/出血/呼吸困难/胸痛/意识 with text "…请立即前往最近医院急诊就诊，或拨打值班电话 021-0000-0000（演示）…"; `SAFETY_TEMPLATES`; OUTCOME = `/\b(OS|PFS)\b/` + Chinese words; the stop-med reply is generic for ADC/chemo patients instead of joint-pain-only), `lib/agents/adapter.ts` (short-circuit for every safety template in every mode; `PERMITS_STOP_MED = /(?<!不)(可以|不妨|建议|不如)(先|直接)?(停药|减量|换药|停掉|少打|少吃|跳过|推迟|暂停)/`).
- Tests: `tests/unit/agents.test.ts` "F9" (11 new phrasings route to stop_med, 3 non-stop questions don't; 7 emergency phrasings incl. "化疗后发热，能推迟下次吗"; emergency reply text/no tools/validation; Claude and OpenAI modes never call fetch for stop-med/emergency (guarded); guard regex positives and "不可以停药"/"请不要自行停药或减量"/"是否暂停需由医生确认" negatives; a model reply "不可以停药…" stays in openai mode, "建议暂停一次" degrades; OS/PFS word boundaries vs POSITIVE/dose).

### F10 — clinician tasks reach the patient
- Changed: `lib/plan/followup.ts` (`buildFollowUpPlan(p, today, tasks = [])` merges the patient's OPEN tasks as `{ title: "<type>（医生安排）", due, kind: "visit" }`), `app/patient/plan/page.tsx` (passes tasks; `data-testid="plan-item"`; unique keys), `app/patient/page.tsx` (home 下一个随访项 passes tasks), `lib/agents/tools.ts` (`get_followup_plan` passes store tasks; new patient tool `get_latest_feedback` → {date, kind, text} of the newest plan_update/alert_feedback, no ids), `lib/agents/templates.ts` (`patient_feedback` on 医生怎么说/处理结果/反馈). Follow-up commit 3e2d8cb: equal timestamps (fixed demo clock) are broken by write order, both in the tool and on the messages page — found while verifying the script against the live server (the tool returned the submit acknowledgement instead of the plan update).
- Tests: `tests/unit/followup.test.ts` (open tasks merged, done / other-patient tasks excluded, sorted, default arg), `tests/unit/agents.test.ts` "F10" (routing, no-feedback text, plan contains 复评（医生安排）, reply quotes the plan_update under equal timestamps, tool order, no ids, validation). e2e: after closing, `/patient/plan` has exactly one item containing "复评" and "复评（医生安排）" shows 2026-10-27.

### F11 — snapshot clips everything
- Changed: `lib/governance/snapshot.ts` (`snapshotPatient` exported: treatments start > cutoff dropped, end > cutoff → ongoing; outcomes / PROs / adherence after cutoff dropped; lastContact capped; biomarkers dropped when `(enteredAt ?? specimenDate)` > cutoff; deceased → metastatic when the death is after the cutoff; lines re-inferred from the clipped treatments, keeping rulesVersion/reviewStatus/reviewer when the event ids are unchanged).
- Tests: `tests/unit/snapshot.test.ts` (P-B at 2026-07-01: P-B-t6 T-DXd gone, one confirmed line [t4,t5], no PROs, lastContact 2026-07-01, outcomes metastasis + progression; at 2026-06-01 the line-1 events are ongoing and the progression is gone; at 2026-10-13 treatments/lines equal the live record; live patient untouched; P-J at 2025-01-01 is metastatic without death). Existing P-L enteredAt tests still pass.

### F12 — Claude provider
- Changed: `lib/agents/providers/shared.ts` (MAX_TOKENS 1500; `OutputRejected` error), `lib/agents/providers/claude.ts` (stop_reason `max_tokens` / `refusal` → OutputRejected before any text or tool_use is used), `lib/agents/adapter.ts` (OutputRejected → category 输出未通过校验, detail = the stop reason), README ("演示前请用真实密钥试跑一次"). No request fields added.
- Tests: `tests/unit/agents.test.ts` (Claude body max_tokens 1500 and exact key set [max_tokens, messages, model, system, tools]; `max_tokens` and `refusal` degrade with detail "max_tokens"/"refusal"; a max_tokens stop with a tool_use block is not executed).

### Promoted minors
- **T12**: `test.afterAll` reset in `tests/e2e/story.spec.ts`; 备用话术 added for 主线 C and 闭环 in `docs/demo-script.md`.
- **Candidate row 科研同意**: F6.
- **P-K expertNote** (`data/seed/anchors.json`): "…按 lines-v1 规则，二线卡培他滨开始后即计为“已进入下一线”，但换线原因不明，医生可在复核治疗线时标注" (no longer says 信息不足). data-generation table row updated.
- **[后续] labels**: "MDT 资料包 [后续]" card on `/clinic/patients/[id]` (`mdt-pack-later`), "援助项目 [后续]" on `/patient` (`aid-program-later`).
- **Unread badge**: `lib/client/messageSeen.ts` stores seen ids in `demo.seenMsgs.<patientId>`; home uses `unreadCount`; messages page marks all listed ids. Test `tests/unit/message-seen.test.ts`.
- **Reset clears localStorage**: `clearDemoStorage` removes `demo.patientId`, `demo.clinicIdentity`, `demo.seen*`; called by 一键重置 on `/`. Tested in message-seen.test.ts.
- **Bone density**: drug contains 唑 OR 依西美坦 (`lib/plan/followup.ts`); test for 依西美坦 / 阿那曲唑 / 他莫昔芬.
- **next.config.ts**: `allowedDevOrigins: ["127.0.0.1"]` (the dev-server cross-origin warning no longer appears in e2e logs).

## Number-change table (docs)

Sources: **seed** = regenerated `data/seed/cohort.json` (gen-v3, checksum c010dc01451e15f8) measured with a throwaway script over the file; **fill** = `npx tsx scripts/fill-expected.ts`; **API** = live dev server (DEMO_FIXED_NOW 2026-10-13T10:00+08:00) after replaying the scripted steps via HTTP (reset → P-A PRO → alert flow with notes → close → P-B PRO → cohort 1 → snapshot v1 → research use cases → assistant → candidate request → cohort 2 → snapshot v2 → confirm first candidate); **store** = same computation in-process.

| Item | Old (gen-v2 docs) | New | Source |
|---|---|---|---|
| Generator version | gen-v2 | gen-v3 | manifest |
| Checksum | c2b1c6d314bd4143 | c010dc01451e15f8 | `npm run seed` ×2 |
| Cohort stages early / metastatic / survivorship / lost / deceased | 1410 / 285 / 137 / 79 / 89 | 1433 / 265 / 133 / 104 / 65 | seed |
| Edge-case violations | 42 | 40 | seed (validator) |
| 停药原因未知 (patients) | 8.4% | 9.85% | seed |
| 外院无日期 (any external) | 10.5% (12.3%) | 11.1% (13.1%) | seed |
| 缺 ISH primary (2+ count); incl. metastatic | 1.0% (20/385); 2.25% | 1.15% (23/409); 2.30% | seed |
| 失访 | 3.95% | 5.20% | seed |
| HER2+ primary 3+ | 19.65% | 19.10% | seed |
| HER2-low among non-HER2+ | 48.7% | 50.7% | seed |
| 三阴性 | 16.25% | 14.55% | seed |
| HR+ among HER2+ | 53.7% | 51.0% | seed |
| Current HER2 0 / low / positive / indeterminate | 793 / 784 / 378 / 45 | 780 / 821 / 355 / 44 | seed |
| Endocrine switch (new) | — | 154 / 1501 (10.3%) | seed |
| Ongoing at cutoff: adjuvant trastuzumab / adjuvant chemo / HR+ early without endocrine yet (new) | — | 63 / 24 / 21 | seed |
| expected: demo cohort | hrpos_her2low_metastatic_cdk46 = 93 | hrpos_evermet_cdk46 = 207 | fill |
| expected: early_endocrine_ongoing | 960 | 974 | fill |
| expected: her2_positive_all | 380 | 357 | fill |
| expected: metastatic_on_adc | 53 | 37 | fill |
| expected: survivorship | 138 | 134 | fill |
| B4/B5/B6 cohort count, CSV rows, submitted | 93 | 207 (161 metastatic / 36 deceased / 10 lost) | API |
| C1 quality: subtype / stage / lines / review; consent followUp / research / pharma | (not stated) | 94.7% / 100.0% / 100.0% / 1.7%; 100.0% / 92.3% / 81.6% | API `/api/cohorts/:id/quality` |
| C2 SNAP v1 n | 77 | 169 | API |
| C3 snapshot subtype / review | (not stated) | 93.5% / 2.1% | API |
| D2 n / metastasis / progression / death | 77 / – / – / 0 | 169 / 169 / 134 / 28 | API |
| D2 survival card | 不可估计 | 可估计（不绘制曲线） | API |
| D2 follow-up median; missing ISH / stopReason / externalNoDate | (not stated) | 55.6 months; 12 / 37 / 20 | API |
| D3 sequences; top; 一线后 next / on / lost / unknown | (not stated) | 3; CDK4/6+内分泌 → ADC 105; 134 / 32 / 2 / 1 | API |
| D4 her2_low met / not / unknown | (not stated) | 94 / 64 / 11 | API |
| D4 符合已知条件; ECOG pending; 信息不足 | 17; –; – | 20; 20; 2 | API |
| D5 assistant snapshot size (new) | — | 169 | API |
| D6 top gap reason | 数据源无 ECOG 字段 | 数据源无 ECOG 字段, 22 人次 | API |
| D7 v1 adherence | n 0, "—" | n 0, "—"; stop reasons progression 142 / unknown 11 / toxicity 9 / patient_choice 3 | API |
| D8 candidate request | 17 | 17（仅含已同意科研联系者; finalMet 20） | API |
| D9 cohort 2 / SNAP v2 (new) | — | 974 / 806 | API |
| D10 v2 adherence (new) | — | n 805; stop intent 7.6%; mean taken 93.0%; missed 未填写 962 / 外出 787 / 关节痛 785 / 忘记 763; stop reasons toxicity 43 / patient_choice 26 / unknown 16 | API |
| E1 first candidate | P-K | P-K (17 rows) | API |
| A6 draft / B3 CTCAE / E3 citations (new text) | — | G-004/G-005/G-006; G-017/G-018/G-019; G-028/G-029/G-030 | store |
| Patients loaded | 2012 | 2012 (unchanged) | API `/api/state` |

## Verification (final, at HEAD e5a130f; dev server on 3000 stopped first)

- `npm test`: Test Files 24 passed (24); Tests 175 passed (175) (was 139 at FIX_BASE).
- `npx tsc --noEmit`: exit 0, no errors.
- `npm run lint`: ✔ No ESLint warnings or errors.
- `npx eslint ./tests ./lib ./app ./components`: exit 0, no output.
- `npm run build`: exit 0, "✓ Compiled successfully".
- `npm run seed` ×2: `seed ok c010dc01451e15f8` both runs (manifest checksum identical; git tree clean afterwards).
- `npm run e2e` run 1: 3 passed (24.7s) — reset rounds, 1440×900, full story (16.7s).
- `npm run e2e` run 2: 3 passed (24.5s) — same three, story 17.0s.
- `/demo-script` served 200 with the new checksum, key and link text.

## Concerns

1. **F5 generator addition**: the ruling's stopReasonDist definition gives an empty chart for the scripted early_endocrine snapshot (every adjuvant endocrine event there is ongoing). To make "discontinuation reasons" visible in the scripted demo I added adjuvant endocrine switching (15% drawn, 10.3% realised) to gen-v3, adjusted survivorship to five years from the first endocrine drug, and moved the edge-case death injection to the front of the list. The stopReasonDist definition itself is exactly as ruled.
2. **F11 extensions**: biomarkers are clipped by `enteredAt ?? specimenDate` (the type says a missing enteredAt equals the specimen date; previously a missing enteredAt never clipped), and a patient whose death is after the cutoff has stage metastatic in that snapshot (keeps the snapshot consistent with validator rule 7). Neither changes the demo (cutoff 2026-10-13).
3. **F7**: the 提交复核 note is enforced in the UI, the API and `actOnAlert`; two existing unit tests now pass a note. The copy-draft button is client-side only and not exercised by e2e (the story closes on `/clinic/alerts`, which has no assistant panel).
4. **F8 stage mapping**: deceased uses the metastatic lists, lost uses the early lists (the ruling lists only early_adjuvant/survivorship/metastatic). `doctor_guideline` now extracts guideline vocabulary from the question (needed for the new early-stage adherence question to cite G-002 instead of noise).
5. **F9**: the stop-med reply was generalised (it was joint-pain-only, which would be wrong for the new metastatic 少打一次 question); "意识" can over-trigger the emergency template (by ruling).
6. **F12**: MAX_TOKENS is a shared constant, so the OpenAI-compatible provider also sends 1500; its `finish_reason: "length"` is not handled (not in the ruling). Real-key behaviour is still untested (human task per ruling).
7. `patient_feedback` returns the newest plan_update **or** alert_feedback as ruled; the submit acknowledgement is an alert_feedback, so before any clinician action "医生怎么说" quotes that acknowledgement.
8. Lost-to-follow-up share rose from 3.95% to 5.20% and the snapshot v1 now has 28 deaths — both are consequences of gen-v3 and the new cohort, documented in the docs.
