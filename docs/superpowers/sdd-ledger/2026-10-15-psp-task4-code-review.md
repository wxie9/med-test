# Task 4 独立规格与质量复审（二轮）

## Spec Compliance

**✅ Spec compliant（所审 Task 4 代码）；Task quality: Approved。首轮四项、二轮文案和 recordedAt 窗口问题均已关闭，无剩余代码阻断。Ready to merge: With final integration verification。**

范围：base `4b4a23deda5c4b4b82e75043b475e18254605096` 至未提交 Task 4，首轮已阅读全实现差异，二轮核对 `task-4-review-package-v3.diff` 相对 v2 的全部增量，以及 v3→v4、v4→v5 全部增量、 `task-4-fix-report.md`、聚焦验证日志。原 brief/contract 不变。完整首轮报告保存在 `task-4-review-initial.md`；本评审只写本文件，没有修改 source/index/HEAD，也没有访问共享 API、执行 E2E 或重跑已绿全套。

## 首轮问题关闭

| 问题 | 修复证据 | 独立判断 |
|---|---|---|
| P1 教育后续阶段改写历史回执 | `lib/psp/transaction.ts:45`、`:76`、`:113` 三种 runner 均深克隆保存 receipt.result；`tests/unit/psp-education.test.ts:67` 覆盖 send/no-op send/open/no-op open 后续反馈及恢复后精确重试 | 已关闭：live projection 与历史回执分离，未改变身份/CAS/版本/返回语义 |
| P2 两次医生复核可串用后续任务引用并通过持久化 | `lib/psp/serviceValidation.ts:10` 校验 doctor task 独占；`:12` 校验 close/education future plan 全局独占；`:15`、`:43`、`:53` 核对计划稳定 origin ID | 已关闭：原复现及六种双边界 corruption 已覆盖，允许随后正常联系完成计划，不错误锁死为 open |
| P2 问卷误标教育反馈并丢失迟交文案 | `components/psp/Common.tsx:15` 将新增 completion 分支限于 contact/education；`tests/unit/psp-services-ui.test.ts:23` 使用真实 PRO→DTO 分别验证按时/迟交和修订链接 | 已关闭 |
| P2 医生复评日期自动预填，缺少明确选择 | `components/psp/ServiceWorkflow.tsx:16` 初值为空；`tests/unit/psp-service-workflow-ui.test.ts:49` 验证仅填 note、空值直接 submit、阈值/项目外时间、清空和精确 UTC 提交 | 已关闭 |

## Strengths / retained correctness

- `lib/psp/contact.ts:12` 保持一个 interaction/单一 outcome，可覆盖两个本患者项目预警并完成一个选中 contact plan；失败不关闭预警或完成计划。
- `lib/psp/contact.ts:32`、`lib/clinic/actions.ts:18` 继续以唯一状态机执行逐预警复核，临床 task/message 与 PSP future plan/event 在同一 draft 验证后发布。
- `lib/psp/education.ts:17` GET 仍无 open 写入；`:40` 明确阅读与反馈分离；`:57` 只增教育帮助联系计划。合成背景与实际服务事实分开展示。
- `lib/psp/serviceValidation.ts:14` 继续按事件 sequence 上界校验发生和记录时点的历史授权，后续撤回不否定此前真实事实；`lib/state/persistence.ts:23`、`:33` 对写出和恢复均执行交叉验证。
- 二轮增量没有 Task 5–12 实现、药企患者明细、真实医学内容或发布/部署操作。文档按 Task 4 更新，同时明确最终验收尚待补齐。

## 二轮新增问题：已关闭

**[P2，已关闭] 缺失教育投影被误判为尚未发送。** v3 中 `Common.Plans` 默认 education=[]，导致 `ServiceWorkflow` 与没有教育投影的 `ServiceDesk` 显示错误“待发送”。v4 的 `components/psp/ServiceWorkflow.tsx:41` 现传 `view.education`；`components/psp/Common.tsx:10`、`:18` 区分 undefined 与确定空结果，未知状态显示中性“待教育服务完成”。`tests/unit/psp-service-workflow-ui.test.ts:80` 覆盖内部已发送调用，`tests/unit/psp-services-ui.test.ts:39`、`:43` 分别覆盖未知/确定空投影。修复不扩大 DTO 或写入权限；对应 RED 2→GREEN 15/15 证据已报告。

## v4 附加变更核对

- `tests/e2e/psp-pro.spec.ts:56` 仅将 Task 3 的旧阶段占位文案断言替换为两个真实待办状态断言，保留 contact/education 两种计划可见性验证，没有删去业务检查。
- `tests/unit/psp-services-durable.test.ts:55` 将全 synthetic cohort 多次 gzip/恢复测试预算由默认 5 秒调整为 15 秒，保留全部事务和精确回执断言。root 已报告隔离每例 1175–1479ms；测试不是时延 SLA，调整合理。最终全量通过仍须提供结果，不能仅以 timeout 变更认定通过。

## root 补充边界检查：已关闭

**[P2，已关闭] 持久化接受项目结束之后才入账的实际联系。** 首先用 `/tmp/psp-task4-review-recorded-window.test.ts` 独立证实：仅将真实 contact 的 recordedAt 改成 `2027-01-01T00:00:00.000Z`，encode 与手工 gzip 后 decode 均接受。v5 `lib/psp/serviceValidation.ts:14` 现对 occurredAt 和 recordedAt 同时检查项目 startsAt/endsAt，保留时间先后及 sequence 限定的历史授权判断。`tests/unit/psp-service.test.ts:155` 明确验证两个边界拒绝该 corruption，同时允许项目期内跨 cutoff 的合法补录完整恢复。实现不读取 host clock，不重新解释历史数据。已阅读 `/tmp/psp-task4-fix-recorded-green.log`，service/routes 2 files / 20 tests passed；未重复运行已绿测试。

v5 其余变更仅修正文档的 Task 5 名称，以及将真实全 cohort 教育 corruption 编码/恢复测试的预算设为 15 秒，未删除或弱化任何业务断言。没有引入下一任务实现。

## Evidence and remaining integration gate

- 已阅读 `/tmp/psp-task4-fix-reviewer-receipt.log` 和 `...-links.log`：首轮两个原始隔离 reproducer 各 1/1 passed；没有重复运行。
- 已阅读 `/tmp/psp-task4-fix-focused.log`：8 files / 61 tests passed；`...-legacy.log`：3 files / 14 tests passed。修复测试核对到真实数据和 encode/decode，不只镜像实现。
- root 报告 lint/tsc 通过；首次全量 521 中仅 contact before-put durable 一项超过 5 秒 timeout（同时有 build/E2E），其余 520 通过。隔离无断言失败，v4 设置合理单例预算后，root 正重新完成最终全量；本评审未擅自重跑。
- 最终 Next/Worker E2E、safe build、Worker persistence restart 和 fixture 字节 SHA 均由 root 控制。本轮代码审查不代替这些验收，也不授权跳过。
- 已只读检查 `.wrangler/task4-ui-qa/psp-doctor-review-390.png`、`psp-patient-reading-feedback-390.png`：手机布局可读，字段与显式阅读操作完整。截图属于日期初值修复前的一轮，不能据此宣称修后截图验收；最终 E2E 应更新证据。

## Assessment

**v5 规格：符合所审 Task 4 合同。Task quality: Approved。Ready to merge: With final integration verification。**

首轮四项、二轮教育状态文案及 recordedAt 窗口问题均已关闭，未发现剩余代码阻断。root 仍需补齐最终全量、Next/Worker E2E、safe build、restart 与 fixture 校验并更新提交前报告；这些运行验收通过后，可进入已授权本地提交；本结论不覆盖尚未完成的运行验收，也不授权 Task 5–12、push 或部署。

## Root 最终运行验收与提交门槛关闭

2026-10-15，最终源码冻结后：标准 `npm test` 62 文件 / 525 项全部通过；标准 lint 零错误/警告、TypeScript 通过；Next 与 Workers 全量 E2E 各 23/23；安全 Worker 构建及 dry-run 通过。实际 Workers 停止/重启后服务、患者项目、临床与教育完整 DTO 相同，全部 14 份原命令回执精确重放且没有新增记录。八份 seed JSON 逐字节不变；新 390/1440px 截图已检查。两组 full-cohort 压缩测试的单例预算调整为 15 秒后保留全部断言；education 损坏恢复测试隔离约 1.6 秒，最终全量通过。

上述结果关闭本次代码批准附带的运行验收门槛，可以进行已授权本地提交。完整实现与限制见 [Task 4 报告](2026-10-15-psp-task4-report.md)；Task 5–12、push 与部署仍未执行。
