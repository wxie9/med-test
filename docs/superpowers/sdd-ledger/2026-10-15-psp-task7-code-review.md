# PSP Task 7：独立复审及修复记录

日期：2026-10-15；实施基线 `ef0c452d4f9cc777bde8409d5d301e73a79c2e5f`。本文由主任务汇编保护子模块、快照子模块和完整整合的独立审查；最终独立复审已完成；运行验收另由主任务记录，不以先前绿色测试替代问题修复。

## 范围与判定

审查覆盖 k=5 白名单投影与联动保护、同一次冻结的两个统计范围、来源副本及图关系、历史授权、CAS/seed/幂等、schema v2 恢复、staff API 和页面、503/409/迟到响应及原功能边界。原研究快照保持独立；Task 8 起的报告与交付不属于本次实现。PM/DR/MR 的身份参数仍为模拟。

最终规格 verdict：**PASS**。最终代码质量 verdict：**PASS**。Critical / Important / Minor 未关闭项均为 **0**。完整整合评审分轮复核真实正负例；最后核对的一行补录时间修正及真实回归通过，先前关闭项保持有效。

## 发现及收口要求

| 问题 | 修复与证据 |
|---|---|
| 非 interaction 子集计数漏查互补小格；非有限或非法数外发 | 按相同统计/样本单位检查结果及互补格；有限数、非负、整数/比例一致性守卫；保留 days/people 差异。[保护回归](../../../tests/unit/psp-protection.test.ts)与独立保护复审关闭。 |
| 教育反馈没有保存真实 send/open；恢复接受缺内容、跨归属、空支持及未来/逆序阶段 | 构造与恢复共用冻结来源图，检查真实内容/事件关系、同成员/计划、完整支持闭包和 cutoff/revision；重算摘要也不能绕过。 |
| 教育求助的计划先于反馈入账；医生关闭的计划晚于事件入账；新成员激活的固定计划另有出生依据 | 分别校验三种真实生产者；冻结实际首 active 成员事件及预定义日历依据；真实命令验证冻结、恢复与旧版不变。 |
| 未到期零/部分完成指标有样本规模却没有全部计划；预警分子子集也不能解释全体样本 | 保存独立 cohort 根及其资格支持，不改变 Task 6 数字或 direct sourceRefs；内部/汇总 18/14 与两个预警子集均回归；缺根或错类型/时间恢复拒绝。 |
| aggregate 提前完成样本恢复只校验内部服务资格 | 逐根保存并验证 cutoff_grant、historical_result 或有界 legacy_gap 依据；替换 service-only 成员且同时改资格根、重算支持图与摘要仍拒绝。真实联系及核验补录后同钟撤回仍能冻结；缺证保持 unknown。补录结果采用外层 occurredAt，实际更正历史回归及独立探针关闭。 |
| 医生关闭来源遗漏实际 submit_review 与引用联系 | 闭合 close→结构化处置→真实 interaction，验证同成员/预警和时序；staff 来源页面展示处置类别、摘要及联系引用。 |
| 来源静态类型说明不准确；POST 错误未禁缓存 | 明确 kind 标签与 Record value、严格运行时 schema 的区别；新 API 成功及错误响应均 no-store。 |

上述真实生产者、序号、样本与恢复回归主要在[快照测试](../../../tests/unit/psp-snapshot.test.ts)、[接口测试](../../../tests/unit/psp-snapshot-route.test.ts)及[真实 durable 集成测试](../../../tests/unit/psp-snapshot-durable.test.ts)。[页面测试](../../../tests/unit/psp-snapshot-ui.test.ts)、[快照浏览器用例](../../../tests/e2e/psp-snapshots.spec.ts)和[医患服务浏览器用例](../../../tests/e2e/psp-services.spec.ts)检查真实页面及冻结来源展示。

## 证据边界

独立审查使用冻结 diff、实际源码和隔离进程中的真实命令/encode/decode 探针；没有把根任务的完整测试冒称为独立重跑。主任务另跑最新单测、类型、lint、Next/Worker E2E、安全构建及真实重启。最终结果以[实施报告](2026-10-15-psp-task7-report.md)为准。初轮及 v2 的通过计数是当时记录，不能覆盖后来发现的缺陷。

原始审查报告、diff、探针、门禁输出与截图在本地证据包 `/tmp/med-psp-task7-evidence` 保存；可移植的回归源码随本提交保存。复审确认的实现源码差异（app/components/lib/tests）SHA-256 为 `673224c45bc8cd3ee9cfd0be78bf839bf956bc74ee84459c15d915905cfa1065`；完整 v4 评审包 SHA-256 为 `87c39cf43f2f22a8eb23907d04c51e4c3a9521d5c38842489a025b730e3fa70c`。后续仅补验收文档，提交前再次核对源码差异一致。
