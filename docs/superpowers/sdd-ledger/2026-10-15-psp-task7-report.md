# PSP Task 7：指标保护、独立服务快照与来源追溯（验收通过）

日期：2026-10-15；实施起点 `ef0c452d4f9cc777bde8409d5d301e73a79c2e5f`。Task 7 实现、最终独立复审与下表全部运行门禁均已通过。本文随实现一同提交；后续 Task 8 的固定报告草稿尚未实施。

## 范围与入口

内部入口为 `/governance/projects/PSP-BC-ENDO-001/snapshots`，从项目服务台“服务快照与指标来源”进入。模拟项目经理和数据审核者可冻结；医学审核者只读。页面可选择冻结版本、核对精确内部/汇总指标、查看受保护汇总预览、展开每项指标的实际来源及资格支持。患者、医生、个案管理师和药企身份不能读取这些 staff API。模拟身份不构成生产认证。

药企页面/API 没有新增候选快照。保护预览明确标注“仅内部预览，尚未形成已交付报告”。Task 8–12 的报告草稿、双审核、交付、客户验收和公开读取门控继续按原计划后续实施；原患者预警、研究快照和候选流程保持独立。

## 指标与冻结规则

[保护层](../../../lib/psp/protection.ts)先处理 unknown，再判定已知无适用、k=5 样本、非零结果及互补小格、细分类别表、共享样本指标族和可反推合计的递归抑制。不能把缺证写成零。非可用对象仅保留 key/unit/status/固定 reason，精确样本、分子、分母、时长、内部解释和来源不透出。计数样本与统计单位分开；days/people 不误作相同计数，非有限和不一致数值拒绝展示。

[快照服务](../../../lib/psp/snapshot.ts)从一个同步暂存状态，在同一冻结前 sourceLedgerRevision 上计算内部及允许汇总两个范围，固定窗口、项目配置、冻结时授权版本、算法 psp-metrics-v1、保护 psp-k5-v1、指标、受保护投影和最小来源值。冻结使用项目 ledgerRevision 作 CAS，提交后账头仅前进一步；来源账头与幂等 commandReceipts 各自保留。相同请求编号和归一化窗口返回原 CommandResult，旧 seed、换体、过期账头及无权身份拒绝。

新增可选 psp.snapshots，无默认数组、旧记录回填、storage key 或 schema v2 变更。原 gen-v4/psp-v1 种子保持原状。后续现场更正只影响新快照；恢复校验只使用冻结副本，hydrate 深冻结嵌套值，不要求旧版等于当前可变来源。未复制病历、聊天、整个 store、旧快照或命令回执作为统计来源。

## 来源和历史资格

[共享来源图](../../../lib/psp/snapshotSourceGraph.ts)用于构造及恢复：直接事实、样本 cohort 根、资格依据和支持引用分开保存。真实 locator 定位 collection/key；支持闭包保存原始联系/核验更正、问卷及嵌套预警、批准教育内容及实际 send/open/feedback、自报修订和必要成员/授权历史。关闭预警还保留真实 submit_review 处置及其 interaction 引用。

三种新计划分别核对真实出生顺序：首 active 成员状态产生固定日历计划；医生关闭先记事件再生成复评计划；教育求助先生成计划再记反馈。不复制无关工作流来替代最小证据，也不放宽为无父计划。阶段初期即使提前完成为零，内部/汇总 18/14 个未来计划仍有完整冻结依据；预警子集指标同样保留完整样本总体。

汇总提前完成逐根保存 cohortQualifications：截止日有效授权、合法历史结果，或明确旧问卷缺证的有界资格见证。恢复验证归属、类型、时间、序号及历史授权；把 service-only 成员替换进等量汇总 cohort、重算支持图和摘要仍拒绝。合法联系及核验补录后同钟撤回不抹掉历史；旧 typed 问卷缺口仍为 unknown，不从临床、opaque ID 或回执重建完成值。后续对外读取/撤回 gate 属 Task 10，冻结时授权版本不等于永久对外授权。

## 页面与可靠性

[工作台](../../../components/psp/SnapshotDesk.tsx)消费冻结 DTO，不在客户端重算。阶段窗口标明 cutoff，不称整月已完成。503 使用相同请求体及编号重试；409 刷新账头并经操作者核对；seed、身份、快照和 scope 切换隔离迟到响应。来源按业务字段展开，核验前后值、医生处置类别/摘要及联系引用可核对，locator 渐进展示。保护区无来源按钮和精确隐藏字段。GET 只读、严格 scope/query/seed，成功及错误响应 no-store。

## 验证

最终[独立复审](2026-10-15-psp-task7-code-review.md)为 PASS / PASS，未关闭 Critical/Important/Minor 均为 0。真实命令、重算摘要后的异常恢复、双范围 cohort、不同计划出生顺序和更正后撤回均有独立探针；源码回归见[快照单测](../../../tests/unit/psp-snapshot.test.ts)、[真实 durable 集成](../../../tests/unit/psp-snapshot-durable.test.ts)、[页面单测](../../../tests/unit/psp-snapshot-ui.test.ts)、[快照浏览器用例](../../../tests/e2e/psp-snapshots.spec.ts)及[医患服务闭环用例](../../../tests/e2e/psp-services.spec.ts)。

| 最新运行门禁 | 结果 |
|---|---|
| npm test | 78 文件，694 项通过，21.19 秒 |
| npm run lint / npx tsc --noEmit --pretty false | 均 exit 0；lint 0 错误/0 警告 |
| 固定时钟 Next 端到端与八宽度检查 | 31 项通过；390/640/755/800/1024/1280/1440/1920px 无横溢出，截图已检查 |
| Worker 安全构建、dry-run、端到端 | build 与 dry-run exit 0；产物无 dotenv/环境值；独立本地 8792，31 项通过 |
| 实际 Worker 重启与持久化原值核对 | 两个快照、来源 API、保护投影、医患 DTO 和 37 份原回执完全一致；实际 SQLite DO 解码后 PSP/临床事实一致，两个源账版本的两 scope 指标及保护投影重算一致、嵌套深冻结 |
| 源码/种子完整性、文档及 diff 检查 | 实现源码差异 hash 与独立复审一致；data/依赖/构建策略/临床种子无改动；本地链接、围栏、空白与 git diff --check 通过 |

前期 684/690/693 项及 Next 30/31 项属于对应修复前记录；最终结论只采用上表最新冻结代码的结果。原始 diff、独立探针、日志、运行脚本、截图及实际持久化证据保存在本地 `/tmp/med-psp-task7-evidence`，回归测试源码随提交保存。未推送、未部署；本地提交与本报告属于同一变更，实际 SHA 可由 git log 查询。
