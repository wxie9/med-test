# PSP 第一阶段独立代码审查（修复复审完成）

审查对象：`/Users/xue.w/.codex/worktrees/psp-project-foundation/med_Test`，基线 `9f8364a`，2026-10-14 待提交的第一阶段改动。按 `superpowers:requesting-code-review` 的独立审查要求执行；未修改实现、未提交、未启动服务器或调用共享演示接口。

范围：Task 1–2 及 `/tmp/med-psp-phase1-contract.md`。新激活者按 10/11/12 月固定日历选择未来一期，既有 18 人保留 10 月计划。生产认证、项目 PRO/联系/教育写操作、月报交付均不在本次范围。

## 结论与开放问题

**代码审查通过；没有仍开放的阻断项或建议修复项。可在主代理最终全套检查、安全 Worker 构建、浏览器及持久化重启验证通过后提交 Task 1–2。**

首轮发现的恢复关系一致性缺口、同 URL 旧 callback 的 seed 防御、schema v2 升级重置文档现均已修复并复审。修复没有扩大到 Task 3+。

本结论仅覆盖 Task 1–2；不代表生产认证或未来报告/医学服务功能已实现。

## 分包审查结论

- **types / seed / persistence / Task 1：通过。** 固定20/18/14名单、54计划、初始项目问卷完成0、联系/教育合成背景、独立 checksum、六文件统一清单与指纹、schema2/key2成立。恢复严格校验临床嵌套结构；PSP当前状态与最终membership账一致，active需服务授权与医生确认；联系/教育事实不能早于计划建立；receipt revision不能超过总账。校验不依赖恢复机器当前时间。研究快照与批准教育内容深冻，可变enrollment不冻结。
- **permissions / DTO / API / Task 2：通过。** seed与身份检查在回执之前、同body回执在CAS前；两种授权独立，service撤回原子暂停并保留既有计划，grant不自动激活；doctor与CM/PM职责分离；邀请者激活生成稳定ID的未来固定计划。患者只看自己，内部身份受限；pharma固定白名单只返回项目配置和受保护人数，不带患者、内部人数和来源记录。未要求超出范围的生产认证。
- **UI / hook / privacy：通过。** 药企入口、研究链接、ModeBadge专用API、患者独立授权卡、服务台、邀请成员分组、窄屏导航重排符合范围。项目问卷未连到通用PRO，旧通用入口保留。hook对scope/identity切换、在途请求、reset、409、503重试保留请求ID有测试；command现绑定渲染seed并核对latest seed，旧回调不能跨reset写入；notice亦绑定访问token。
- **原临床 / 研究兼容：未发现代码层回归。** PSP命令不写旧Patient.pro/alerts/tasks；serialize/serializeLite显式剔除psp；研究投影保持边界，冻结研究快照不冻结候选审核活动状态。旧8项浏览器回归及安全Worker/重启由主代理执行，本审查未重复操作共享服务器。
- **文档：通过。** README新增第一阶段入口/演示步骤、固定未来计划、模拟身份、独立fixture与schema v2/key升级说明，明确旧v1进度重新初始化、不做隐式迁移以及失败恢复/重试行为。

## 修复复审证据

1. 首轮独立复现：仅把ENR-19.status改为active，旧实现encode/decode接受，而membershipAt仍invited、eligibility=false。新版`validatePspState`拒绝该状态；新增状态矛盾、active授权/适用性、时间关系、receipt bound、完整账序及真实decode负向测试。
2. 首轮隔离jsdom保留seed1的command、刷新至seed2后调用，旧实现POST携带seed2。修复后同一独立脚本输出`[]`，没有POST；仓库测试同时验证新callback仍可写入seed2。
3. README实际diff已核对，与已实现的key2和失败恢复语义一致。

## 独立验证

复审后执行：

```sh
npx vitest run tests/unit/psp-permissions.test.ts tests/unit/psp-routes.test.ts tests/unit/psp-seed.test.ts tests/unit/psp-state-validation.test.ts tests/unit/psp-transaction.test.ts tests/unit/psp-views.test.ts tests/unit/psp-ui-hook.test.ts tests/unit/worker-persistence.test.ts tests/unit/worker-durable-request.test.ts
npx tsx /tmp/psp-review-retained-command.ts
```

结果：**9 files / 43 tests passed，exit 0**；独立旧callback复现脚本输出**空POST数组 `[]`**。首轮独立6文件28测试亦通过。

源码覆盖全部新增lib/psp、PSP/pharma API、PSP组件、usePspState、seed/runtime/persistence、durable wrapper，以及关联临床类型、序列化和导航改动。全suite/lint/types、实际Worker构建、旧/新e2e和重启证据以本目录第一阶段实施验收报告为准。
