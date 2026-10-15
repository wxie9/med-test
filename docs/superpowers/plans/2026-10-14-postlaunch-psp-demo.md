# 上市后 PSP Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有合成乳腺癌演示中串起药企项目入口、患者问卷、医护服务证据、独立阶段月报、双审核、交付与客户验收。

**Architecture:** 业务集中在 `lib/psp`，临床 PRO/预警仍只有一份规范记录，PSP 保存固定计划和证据关联。内部服务账与外部药企 DTO 分开；不可变快照/报告和独立授权门控共同控制交付。Next.js 本地保持内存模式，Workers 复用单一共享 Durable Object，以新应用 schema/key 保存 PSP 状态。

**Tech Stack:** 当前 Node.js v24.14.1、Next.js 15.5.27、React 19.1.0、TypeScript、Zod、Tailwind CSS 4、Vitest、Playwright；OpenNext 1.20.11 / Wrangler / SQLite-backed Durable Object。不新增数据库、模型SDK或真实身份系统。

## Global Constraints

- 计划最初在代码基线 `48b519f` 制定。Task 0–7 已实施并分段验收；Task 6 的纯计算指标、历史资格与最小证据扩展已通过独立复审和最终集成 gate（644 项单测、Next/Workers 各 27 E2E、安全构建/dry-run、实际重启及 35 原回执/四组指标一致性；这些是 Task 6 当时的统计）。Task 7 的保护、服务快照、内部来源与 staff 页面已通过最终独立复审及门禁：694 项单测、Next/Workers 各 31 E2E、安全构建/dry-run、实际重启后两个快照及 37 份原回执一致。Task 8–12 尚未实施。记录见[第一阶段报告](../sdd-ledger/2026-10-14-psp-phase1-report.md)、[Task 3 报告](../sdd-ledger/2026-10-14-psp-task3-report.md)、[Task 4 报告](../sdd-ledger/2026-10-15-psp-task4-report.md)、[Task 5 报告](../sdd-ledger/2026-10-15-psp-task5-report.md)、[Task 6 报告](../sdd-ledger/2026-10-15-psp-task6-report.md)及[Task 7 报告](../sdd-ledger/2026-10-15-psp-task7-report.md)。
- 详细需求以[PSP设计](../specs/2026-10-14-postlaunch-psp-demo-design.md)为准；[现状评审](../sdd-ledger/2026-10-14-psp-current-state-review.md)定义新增依赖。
- 项目`PSP-BC-ENDO-001`，虚构药企A，治疗类别支持；周期2026-10-01至2026-12-31。
- 固定时钟`2026-10-13T10:00:00+08:00`；阶段报告窗口为10月1日至该时点，不能称整月完成业绩。
- 20候选、18服务授权、其中14药企项目汇总授权；P-A包含在14内，P-K留在研究支线。
- 临床gen-v4、checksum `cc3217fe1d251f10`、2012患者及五组筛选207/974/357/37/134保持不变；新增运营fixture独立版本/checksum。
- 既有974人本期monthly PRO为0，P-A最新历史PRO在9月；10月问卷现场成功提交后才计完成。
- high接单/联系目标2/2自然小时，medium24/24自然小时，均为虚构配置；临床紧急提示不等待运营时限。
- `k=5`为演示输出策略；小样本与非零互补小格保护n、分子/分母、比例、时长及相关细分表。
- 当前药企/患者/医生身份仍为模拟；新DTO不等于生产访问控制，全部数据合成。
- 不做疗效归因、销售ROI、正式PV、完整RWS/IIT、真实医院接入、真实报告发送、生产认证或生产数据库迁移。
- 支持390/640/755/800/1024/1280/1440/1920px；语义表单、键盘可操作、状态有文字，保留现有视觉语言。
- Workers不上传模型密钥、不启用付费服务；报告首版采用确定性模板，现有临床助手的在线/回退边界保留。

---

## 1 执行分段与停止条件

| 分段 | Tasks | 可独立演示的结果 | 进入下一段的门槛 |
|---|---|---|---|
| 发布与检查基线 | 0 | 安全构建可复现，标准lint可运行 | sentinel不入包；标准检查通过 |
| 项目与状态基础 | 1–2 | 药企看到项目，内部看到18人服务账，患者可选两种授权 | 20/18/14、专用DTO、恢复/重置/冲突成立 |
| 医患服务 | 3–5 | P-A填报→一电话覆盖两预警→医生复核→教育反馈 | 原子/幂等、未来复评待办、证据可追溯 |
| 报告事实 | 6–8 | 可手算指标、保护后的快照与固定草稿 | 历史/时间/授权/小格/冻结成立 |
| 月报交付 | 9–11 | 退回修订→双审核→交付→客户反馈/验收 | 同版本双签、每次读取门控、无内部字段外发 |
| 整链验收 | 12 | 本地及Workers完整新主线，原研究支线回归 | A01–A17及部署新增负向场景成立 |

每段结束先做需求覆盖复核，再做代码复核。问题只影响该段时修该段，不因页面完成就跳过分母或授权验证。Task 0–2未通过前，不优先搭完整药企仪表盘或月报UI。

## 2 文件边界

下表保留完整规划；Task 0–7 已验收，Task 7 的保护、服务快照与 staff 内部来源入口已可用；Task 8–12 的报告、审核与交付路径仍是后续计划，不能把未实现路径当成可用接口。

| 文件/目录 | 职责 |
|---|---|
| `scripts/build-worker-safe.ts`、`scripts/worker-build-policy.ts` | 无env文件的暂存构建、子进程环境白名单、环境产物检查；不读取/打印真实密钥 |
| `lib/runtime/seedFiles.ts` | 临床及PSP种子路径唯一清单，打包与fingerprint共用 |
| `data/seed/psp.json`、`data/seed/psp-manifest.json` | 稳定成员ID、固定计划、合成运营事件、教育内容与独立校验值 |
| `lib/psp/types.ts`、`seed.ts`、`permissions.ts` | 独立Zod实体/命令边界、fixture校验、历史授权与成员区间 |
| `lib/psp/transaction.ts`、`commands.ts` | 同步暂存、版本校验、幂等去重、原子写临床与PSP账 |
| `lib/psp/views.ts`、`pharmaView.ts` | 内部/患者/药企三个白名单投影，外部仅汇总 |
| `lib/psp/contact.ts`、`education.ts`、`selfReport.ts`、`corrections.ts` | 独立联系事实、医学批准教育版本、不可变服药副本、补录核验 |
| `lib/psp/evidenceTypes.ts`、`evidenceValidation.ts`、`evidenceWindow.ts`、`evidenceView.ts` | 已实现证据 schema/恢复校验、历史整日与精确来源资格、内部/患者只读 DTO；尚不计算月报指标 |
| `lib/psp/metricTypes.ts`、`metricWindow.ts`、`metrics.ts` | 已实现并验收唯一纯计算入口、历史窗口/资格、可证明数值或 `unknown` 的 `Metric` 与来源引用 |
| `lib/psp/metricEvidenceTypes.ts`、`metricEvidenceValidation.ts`、`assignmentCancellation.ts` | 已实现可选项目问卷/预警副本、创建序号校验及内部合法取消证据；schema v2/seed不变 |
| `lib/psp/protection.ts`、`snapshot.ts` | Task 7 已接入 k=5 联动策略、独立服务快照与内部来源追溯；来源图独立复审及最终门禁通过 |
| `lib/psp/reports.ts`、`review.ts`、`delivery.ts` | 草稿/版本、双审核、交付验收与独立授权门控 |
| `lib/psp/reportTemplate.ts` | 固定章节、受控事实句和结构化下一步；不接临床聊天或整份store |
| `lib/client/usePspState.ts` | 项目/患者/报告绑定请求、授权/重置版本、迟到响应丢弃 |
| `components/psp/*` | 项目摘要、服务证据表单、教育、指标口径/来源、报告审核；UI不另算数字 |
| `app/api/psp/*` | 内部/患者输入校验和命令；明确错误码 |
| `app/api/pharma/*` | 外部项目/批次/报告/下载/验收白名单，统一门控 |
| `app/pharma/*`、`app/clinic/projects/*`、`app/governance/projects/*` | 新入口与工作台；原research路由保留 |
| `tests/helpers/psp.ts`、`tests/unit/psp-*.test.ts`、`tests/e2e/psp-*.spec.ts` | 独立业务fixture、命令/路由/保护测试与真实页面整链 |

## 3 跨任务接口与版本

这些签名保留完整实施契约。Task 6 的 `Metric` 已在 `lib/psp/metricTypes.ts` 实现；Task 7 的 `ProtectedMetric` 已在 `lib/psp/protectionTypes.ts` 实现，报告类型仍属后续规划。数组/普通对象保存到PSP状态，避免额外Map的JSON还原陷阱。

```ts
type PspRole = "patient" | "case_manager" | "doctor" | "project_manager"
  | "data_reviewer" | "medical_reviewer" | "pharma_owner";
type CommandMeta = {
  seedVersion: number;
  expectedVersion: number; // 目标对象版本；freeze针对ledgerRevision
  clientRequestId: string;
  actorId: string;
  role: PspRole; // 演示动作场景，不能当真实认证
};
type PspErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN_ACTION"
  | "STALE_SEED" | "VERSION_CONFLICT" | "CONSENT_REQUIRED"
  | "AUTHORIZATION_BLOCKED" | "INVALID_TRANSITION" | "PERSISTENCE_FAILED";
type CommandResult<T> = { data: T; objectVersion: number; ledgerRevision: number; seedVersion: number }; // 已实现：相同请求返回完全相同回执
type MetricOptions = { projectId: string; periodStart: string; periodEnd: string; cutoffAt: string; scope: "internal" | "aggregate"; ledgerRevision: number };
type Metric = {
  key: string; label: string;
  unit: "people" | "forms" | "assignments" | "alerts" | "interactions" | "doses" | "hours" | "days" | "records";
  sampleUnit: "people" | "forms" | "assignments" | "alerts" | "interactions" | "records";
  sampleN: number | null; numerator?: number; denominator?: number;
  value: number | null; status: "available" | "no_applicable" | "unknown"; sourceRefs: string[];
  window: MetricOptions; applicability: string; algorithmVersion: "psp-metrics-v1";
  complementCells?: number[]; // 完成/未完成等保护所需的互补格
};
type ProtectedMetric =
  | { key: string; unit: Metric["unit"]; sampleUnit: Metric["sampleUnit"]; status: "available"; sampleN: number; numerator?: number; denominator?: number; value: number }
  | { key: string; unit: Metric["unit"]; status: "suppressed" | "no_applicable" | "unknown"; reason: string }; // Task 7 已实现；无值状态不带精确字段
type ReportStatus = "draft" | "in_review" | "changes_requested" | "approved"
  | "delivered" | "accepted" | "client_changes_requested";
type ReportGate = { authorizationGate: "eligible" | "blocked" | "revoked"; authorizationVersion: number };
```

`PspState`目前保存project、enrollments、membershipEvents、permissionEvents、assignments、serviceEvents、educationContents、educationResults、commandReceipts及fixtureVersion/checksum/ledgerRevision/authorizationVersion。Task 5 已实现可选 `selfReportRevisions` / `corrections`；Task 6 增加可选 `questionnaireEvidence` / `assignmentCancellations` 及动态计划的 `assignedRecordedAt` / `assignedSequence`；Task 7 增加可选 `snapshots`，无默认数组，不预填旧记录或修改 fixture；继续沿用 schema v2/storage key。`stopIntent` 缺失保留为 null。旧 PRO 修订链缺前缀时，既不凭回执或临床回读恢复，也不从后来 typed 修订反推中间修订的时间、序号或授权；证据不足的纯计算结果为 `unknown`，与已知零分母的 `no_applicable` 分开。reportVersions/reviewActions/deliveryReceipts 仍为后续规划。快照 `sourceLedgerRevision` 是计算采用的源账头；冻结后的 `ledgerRevision` 与 `commandReceipts` 用于命令版本和幂等，不能替换源账版本。实体字段按规格§13落实，每个可修改聚合有`version`，事件有唯一ID、occurredAt、recordedAt和账序号；date-only 来源保留日期精度且 occurredAt 为 null。去重回执保存请求作用域、规范化body摘要与结果引用；同ID换body返回400，不静默复用不同操作。

精确时间统一存UTC ISO（沿用now().toISOString），比较用epoch；显示与自然日/月份边界用Asia/Shanghai。第4节+08:00写法是人可读时点，不能用字符串字面相等代替时间相等。日期级历史值保留DateOnly及精度标记。

最小模拟动作矩阵如下，服务端校验role和预置actorId对应关系、projectId及目标归属；患者actorId必须等于目标enrollment.patientId。其它角色只操作本项目，pharma_owner绑定虚构资助方A，禁止借该动作调用内部读DTO。这些可伪造的演示参数不是登录认证。

| 角色 | 预置actorId | 允许动作 |
|---|---|---|
| patient | 当前patientId | 自己的授权、问卷/打卡、教育打开/反馈和自己项目GET |
| case_manager | case-manager-chen | 本项目纳入/暂停/退出、接单、联系、开始处置/提交复核、发送批准教育与服务跟进、显式导入历史服药副本及提议联系补录；Task 6 内部命令可为已失去服务资格的未完成计划记录合法取消 |
| doctor | doctor-zhang | 服务适用性确认、临床复核/关闭/未来复评 |
| project_manager | project-manager-psp | 内部运营读取、非临床成员管理、Task 6 内部合法取消命令；冻结、草稿/修订、提交和双审版交付为后续任务 |
| data_reviewer | data-reviewer-psp | 内部来源读取、冻结/补录核验、数据签署或退回 |
| medical_reviewer | medical-reviewer-psp | 必要内部来源/医学措辞读取、医学签署或退回 |
| pharma_owner | pharma-owner-a | 受保护项目/报告读取下载、客户修改请求/验收 |

两类审核用不同预置actor，不允许同一个actor换kind完成双签。活动状态与授权scope分别验证；计划类型对应合法执行者不能靠任意role绕过。只用一个预置项目，跨项目参数仍要拒绝。

写入次序：校验seed→校验对象/项目/角色场景/归属→命中同body幂等回执可返回原结果→校验expectedVersion与当前授权→在隔离副本执行业务→校验完整新状态→同步替换全局状态。已持久化请求丢失响应后的重试回放，不产生撤回授权后的新写入。不要在业务提交中等待模型。本地业务校验失败时原状态不变。

Workers成功响应以durable保存完成为提交点：写入确定失败且未落存储时，恢复上一次已持久化状态，返回503；新tentative状态不供下一次请求读取。写入结果不确定时重新读取存储，按真实保存值恢复，恢复读取也失败则保持503并阻止读取tentative状态。不能承诺已写成功但客户端丢失响应的请求会回滚：该情形已提交，重试从保存的幂等回执返回原结果。handler异常/500、压缩失败、容量超限与put失败分别注入测试；后续GET与重启都必须匹配实际durable状态，而不是把不确定结果当成成功或重复执行业务。

REST错误映射：输入400、对象不存在404、非法动作/授权403、旧seed/版本冲突/非法生命周期409、持久化失败503。错误含code和可读中文说明，不带堆栈、病历或密钥。

外部请求键：`seedVersion + projectId + period + reportVersionId + authorizationVersion`。原reset后相同对象ID不可复用旧响应。初版PSP上线采用payload schema v2、新key；旧v1演示进度不迁移，明确发布时全局重置。保留DO绑定/class/tag v1，只有应用payload/key升级。

## 4 固定fixture与手算基线

### 4.1 成员名单

只读现有loadSeed/applyFilter得到下列稳定名单，下一轮把列表固定入PSP文件；不能每次动态重选以凑人数。

| 序号 | patientId | 服务授权 | 汇总授权 |
|---|---|---|---|
| 01 | P-A | 是 | 是 |
| 02 | P-0002 | 是 | 是 |
| 03 | P-0004 | 是 | 是 |
| 04 | P-0006 | 是 | 是 |
| 05 | P-0009 | 是 | 是 |
| 06 | P-0011 | 是 | 是 |
| 07 | P-0013 | 是 | 是 |
| 08 | P-0016 | 是 | 是 |
| 09 | P-0018 | 是 | 是 |
| 10 | P-0024 | 是 | 是 |
| 11 | P-0025 | 是 | 是 |
| 12 | P-0028 | 是 | 是 |
| 13 | P-0029 | 是 | 是 |
| 14 | P-0030 | 是 | 是 |
| 15 | P-0032 | 是 | 否 |
| 16 | P-0033 | 是 | 否 |
| 17 | P-0035 | 是 | 否 |
| 18 | P-0036 | 是 | 否 |
| 19 | P-0040 | 否，invited | 否 |
| 20 | P-0042 | 否，invited | 否 |

01–18在10月1日00:00开始active/service授权，01–14同一时点另有aggregate授权；19–20没有任何收费项目服务计划。教育示例已作演示医学批准且版本固定，标签说明实际上线仍需专家审核。

### 4.2 计划和运营事实

- 01–18各有10月问卷计划，ID `PSP-BC-ENDO-001:ENR-XX:PRO:2026-10`，dueAt=10月13日09:00；初始全部open，无当月PRO引用。
- 01–18各有常规contact计划，dueAt=10月8日09:00。02–09、15–16各在10月8日08:00有一个reached事实；01、10–14、17–18有一个no_answer事实。不关联任何不存在的临床预警。
- 01–18各有education计划，dueAt=10月10日09:00。02–09、15–16有发送/打开/有效反馈三个不同事件，其余尚待实际安排/发送与反馈；计划存在不表示已发送。A在S6执行既定计划，可明确呈现此前未完成的服务积压。
- 18人在此窗口初始无新增精确PSP打卡；旧date-only日志通过独立导入副本处理。10月1日00:00授权生效，因此10月1日至12日完整日可纳入：内部18人216条/剂次、taken199、due216；汇总14人168条/剂次、taken153、due168。10月13日date-only边界日志内部18条/汇总14条全部排除。以上已用当前种子只读独立核算；隔离无历史日志helper用于零分母/边界测试，不能替代默认项目的实际核算。
- 背景联系/教育都是新增合成运营事实，不改原Patient.pro、alerts、tasks或原临床历史。不预建P-A的10月成功结果。

| 指标 | 初始内部值 | 初始汇总授权范围值 | P-A主线执行后的变化 |
|---|---|---|---|
| 候选/期内服务/允许汇总 | 20 / 18 / 14 | 仅允许汇总人数14，合同范围另示 | 无变动；药企不见20/18/差额 |
| 到期问卷完成 | 0/18 | 0/14，可呈现0及缺口 | 1/18；外部1/14因完成小格被整项抑制 |
| 按时问卷完成 | 0/18 | 0/14 | A10:00迟交，内部按时数仍0；外部与完成率同族抑制 |
| 到期常规contact成功 | 10/18 | 8/14≈57.1%，互补6≥5 | A成功事实覆盖既有计划后11/18、9/14≈64.3% |
| 到期education有效反馈 | 10/18 | 8/14≈57.1%，互补6≥5 | A反馈后11/18、9/14≈64.3%；不表达改善 |
| 到期contact+education服务任务 | 20/36 | 16/28≈57.1% | A联系/反馈后22/36、18/28≈64.3%；不含问卷 |
| 旧日志自报剂次比例 | 199/216≈92.13%，18人/12日 | 153/168≈91.07%，14人/12日 | 主线仅填问卷不改日志；若另测A精确当天taken0，变199/217与153/169 |
| 本期PRO预警联系 | 0，no_applicable | no_applicable | 实际规则产生A的预警；若2件，一通电话覆盖2件但只计1interaction，外部小样本抑制 |
| A新预警按时联系率 | no_applicable | no_applicable | 固定时钟10:00触发，截止10:00均未到2/24h目标：pending，按时分母0 |
| 未来医生复评 | 无 | 不呈现个体安排 | 新复评dueAt晚于cutoff，仍open且不进到期分母 |

额外单元fixture独立覆盖月中退出、withdraw、未来到期、取消、迟到补录、边界日、自报修订、k=4/5以及零分母；不把互相冲突的负向状态都塞进默认现场演示。

## Task 0：关闭构建环境打包路径，恢复标准检查

**Files:** Create `scripts/build-worker-safe.ts`、`scripts/worker-build-policy.ts`；Modify `package.json`、`eslint.config.mjs`、`README.md`；Test `tests/unit/worker-build-policy.test.ts`。

**Interfaces:** `buildWorkerBundle({ sourceRoot, outputRoot, env }): Promise<{ environmentNames: string[]; artifactPaths: string[] }>`；构建子进程环境只允许运行工具必要变量和固定DEMO_FIXED_NOW，不继承模型密钥。

- [x] 先用临时fixture的`.env.local`和`.env.production.local`写非真实sentinel，验证现有compileEnvFiles能打包它；测试只断言包含布尔值，不输出值。
- [x] 实现隔离目录构建：复制明确源目录app/components/lib/data/public/scripts/cloudflare、docs/demo-script.md及package.json/package-lock.json/next.config.ts/open-next.config.ts/tsconfig.json/wrangler.jsonc/postcss.config.mjs/eslint.config.mjs；递归排除.env*、.dev.vars*、node_modules和生成包，next-env.d.ts在构建时生成。依赖在隔离目录安装或复用已确认依赖，构建脚本不能递归调用自身。源目录env文件不移动、不改写。
- [x] 子进程使用变量白名单；在Wrangler打包前检查所有模式的next-env.mjs只有允许的固定演示变量，发现未知变量停止构建。不能仅在生成后删掉模型密钥，因为Next编译阶段也可能读取env。
- [x] 将`build:worker`接入安全wrapper，`preview:worker/deploy:worker`继续依赖它；隔离产物`.open-next/`与`cloudflare/files.generated.mjs`同时复制到项目相应位置，Worker入口的两个import都必须可解析。Wrangler账户凭据只供后续已授权部署命令使用，不能传给构建子进程。
- [x] eslint忽略`.claude/**`等实际嵌套工作区；重新跑`npx vitest run tests/unit/worker-build-policy.test.ts`、`npm run lint`、`npx tsc --noEmit`。标准lint必须exit0，不能用诊断参数冒充已修复。
- [x] Review gate：sentinel不在任何输出文件中，原env文件字节未改变，默认mode仍deterministic；再运行`npm run build:worker`，不发布。

## Task 1：PSP类型、fixture与持久化恢复

**Files:** Create `lib/psp/{types,seed}.ts`、`lib/runtime/seedFiles.ts`、`data/seed/{psp,psp-manifest}.json`、`tests/helpers/psp.ts`；Modify `lib/state/{store,persistence}.ts`、`cloudflare/worker.mjs`、`scripts/{build-worker-files,seed-fingerprint}.ts`；Test `tests/unit/psp-seed.test.ts`、现有worker三组测试。

**Interfaces:** `loadPspSeed(patients: Map<string, Patient>): PspState`、`validatePspState(value: unknown): PspState`、`hydrateImmutableState(store: DemoStore): DemoStore`、`buildPspTestStore(): DemoStore`、`installPspTestStore(store: DemoStore): void`。测试helper返回隔离store、固定时钟、无历史日志版本，install只在测试中绑定该store到既有全局容器，afterEach恢复，不能复用测试间的变更。

- [x] 新测试断言名单、20/18/14、固定dueAt、当月初始完成0；邀请者无计划；fixture记录授权和教育批准时间均不晚于对应事实。
- [x] 按第4节写固定fixture；独立psp-v1 checksum由规范化内容SHA-256生成，临床manifest与generator不修改。
- [x] Store增`psp`，reset同时恢复临床与PSP。runtime统一清单含原四临床文件与两个PSP文件；demo-script入包但不入种子指纹。缺少必需PSP文件应明确构建失败，不能fallback成空项目。
- [x] payload升v2和`demo-v2-...`key；按Zod严格验证保存对象及账与成员的一致性，恢复patients Map并重新冻结研究快照和已批准教育内容；Task 7 又接入可选 PSP 服务快照的恢复校验与深冻结，报告实体仍待后续阶段。只有允许生命周期变化的metadata可更新，不能freeze整个活动状态。
- [x] 测试v2 roundtrip、旧v1不误读、损坏payload错误、PSP文件单独变化导致key变化、demo-script变化不失效、重置后全新PSP状态。明确升级会重新初始化共享演示，不做隐式v1迁移。
- [x] Run `npx vitest run tests/unit/psp-seed.test.ts tests/unit/worker-files.test.ts tests/unit/worker-persistence.test.ts tests/unit/worker-seed-fingerprint.test.ts tests/unit/generator.test.ts`；预期全部通过，临床checksum及五组人数不变。

## Task 2：原子命令、授权历史及两侧项目入口

**Files:** Create `lib/psp/{transaction,permissions,views,pharmaView}.ts`、`lib/client/usePspState.ts`、`app/api/psp/projects/[projectId]/route.ts`、`app/api/psp/patients/[patientId]/projects/route.ts`、`app/api/psp/enrollments/[enrollmentId]/{permissions,actions}/route.ts`、`app/api/pharma/projects/route.ts`、`app/api/pharma/projects/[projectId]/route.ts`、`app/pharma/layout.tsx`、`app/pharma/projects/{page.tsx,[projectId]/page.tsx}`、`app/clinic/projects/[projectId]/services/page.tsx`；Modify `app/page.tsx`、`components/{ViewSwitcher,ModeBadge}.tsx`、`lib/state/store.ts`；Test `tests/unit/psp-permissions.test.ts`、`psp-views.test.ts`、`psp-transaction.test.ts`、`psp-routes.test.ts`；浏览器 `psp-phase1.spec.ts`。

**Interfaces（第一阶段实际签名）:** `transact<T>(enrollmentId, normalizedBody, meta, roles, mutateDraft): CommandResult<T>`；`recordPermission(enrollmentId, scope, action, meta)`；`recordEnrollmentState(enrollmentId, { state, reason, eligibilityConfirmed? }, meta)`（发生/入账时间由服务端生成）；`getInternalProjectView(projectId, role, actorId)`、`getPatientProjectsView(patientId, role, actorId)`、`getPharmaProjectView(projectId)`。患者专用GET只返回该patientId的成员、授权、计划及消息引用；内部项目GET返回服务台DTO。药企view返回项目合同配置、保护后的批次指标、报告摘要和agentMode/seedVersion/gate，绝不返回ledger及成员ID。

- [x] 先测撤回后不能安排新服务、首次汇总授权不追溯、月中退出前责任保留；临床research同意不能使PSP变已授权。
- [x] 纳入/暂停/退出命令保留历史：doctor确认适用性，case_manager/project_manager记录合法状态变更，只有有效service授权和适用性确认齐全才可active；暂停/退出不取消独立医疗随访。默认fixture的18人包含明确的合成适用性确认。
- [x] grant service本身不替代医生确认；未满足条件保持invited，条件齐全由合法纳入动作激活。service撤回同一命令结束服务有效区间并将active成员转paused，停止新PSP安排，逾期前责任保留；aggregate授权仍独立，不因单独停止服务而自动撤销其已授权历史汇总。
- [x] 实现同步暂存/提交与幂等回执，失败保持原state字节等价。版本冲突返回409，提示刷新；同请求ID换body返回400。
- [x] 收紧serialize与serializeLite显式排除psp；PSP内部和患者信息只走专用投影。`/pharma`的ModeBadge走仅模式元数据或药企state，原research保持原hook。
- [x] 为药企新增项目入口，内部服务台呈现固定计划、授权范围和积压；患者授权卡允许“接受服务、不同意项目汇总”。任何模拟角色切换旁明确标识演示身份。
- [x] 本段药企页仅展示合同范围、允许汇总人数和暂无交付提示，不预造服务指标。Task 7 已有内部固定汇总快照及受保护预览，药企页尚不读取它；Task 10 后完整报告才取已交付版本，不按患者操作逐条实时推送差值。
- [x] 浏览器网络契约：打开`/pharma/projects`及概览，不请求`/api/state`、`/api/patients`或内部PSP接口；接口JSON递归检查无patientId/name/sourceRefs/备注或内部18。
- [x] Run `npx vitest run tests/unit/psp-permissions.test.ts tests/unit/psp-views.test.ts tests/unit/psp-transaction.test.ts tests/unit/client-regressions.test.ts`；预期通过。390和1440px手动看入口/授权卡，失败消息可读。

第一阶段补充决策：邀请成员在授权和医生确认齐全后，由合法内部身份激活。初次激活从项目固定 10–12 月日历选择各类型未来一期，不给新成员补发已逾期的 10 月计划；当前固定时钟下三项均为 11 月。既有 18 人计划、撤回/暂停/退出前的责任均保留。教育/联系合成背景只读，未开放任务执行接口。

## Task 3：把P-A现场问卷原子绑定固定计划

**Files:** Create `lib/psp/commands.ts`、`lib/pro/validation.ts`、`app/api/psp/assignments/[assignmentId]/pro/route.ts`；Modify `lib/pro/submit.ts`、`app/api/pro/route.ts`、`app/patient/{page,plan,pro}/page.tsx`；Test `tests/unit/psp-pro.test.ts`、`tests/unit/psp-pro-route.test.ts`。

**Interfaces:** `submitProjectPro({ assignmentId, patientId, scaleId, items, flags, revisionOf? }, meta): CommandResult<{ proId: string; alertIds: string[]; feedback: string }>`。从现有PRO route抽出同一题项/flag校验；临床提交函数支持传入暂存store/时间/ID工厂，旧API包装保持原行为。

- [x] 创建失败用例：缺题/错题、非本患者计划、无授权、旧seed/版本、普通重试与显式修订。问卷items使用完整`SCALE_SYMPTOMS.endocrine_monthly_v1`，不能用不全的示例绕过原校验。
- [x] 一个同步命令创建PRO、原规则预警/消息、计划关联、首次完成时间、最新有效答卷引用和幂等回执；任一步失败没有部分写入。
- [x] 已完成的普通重复提交返回既有有效结果；显式revisionOf创建新PRO及可适用的新告警，不重复计计划完成；相同修订请求不重生告警。
- [x] PSP回执按虚构自然小时目标呈现；原急症/off-hours提示保留。不能同时声称“1工作日”就是2小时联系合同。
- [x] 患者从固定计划进入表单，发送时绑定patientId/assignment/seed；切患者后旧成功或失败结果都不可覆盖新页面。
- [x] Run `npx vitest run tests/unit/psp-pro.test.ts tests/unit/psp-pro-route.test.ts tests/unit/pro-route.test.ts tests/unit/alerts.test.ts`；断言A在10:00完成、dueAt09:00迟交、完成数+1且按时数不增。

核心验收断言（Task 1 helper与本task接口）：

```ts
const store = buildPspTestStore();
installPspTestStore(store);
const input = {
  assignmentId: "PSP-BC-ENDO-001:ENR-01:PRO:2026-10", patientId: "P-A",
  scaleId: "endocrine_monthly_v1" as const,
  items: { "关节痛": 3, "潮热": 1, "情绪": 1, "睡眠": 1 },
  flags: { stopIntent: true, missedDoses14d: 4 }
};
const assignment = store.psp.assignments.find(a => a.id === input.assignmentId)!;
const meta: CommandMeta = {
  seedVersion: store.seedVersion, expectedVersion: assignment.version, // 问卷动作校验计划版本，不使用成员版本
  clientRequestId: "psp-pro-test-first", actorId: "P-A", role: "patient"
};
const first = submitProjectPro(input, meta);
const retry = submitProjectPro(input, meta);
expect(retry.data.proId).toBe(first.data.proId);
expect(retry).toEqual(first);
expect(Date.parse(getStore().psp.assignments.find(a => a.id === input.assignmentId)!.firstValidSubmittedAt!))
  .toBe(Date.parse("2026-10-13T10:00:00+08:00"));
```

## Task 4：联系事实、医生复核与教育反馈

**Files:** Create `lib/psp/{contact,education}.ts`、`components/psp/{ContactForm,EducationCard}.tsx`、`app/api/psp/projects/[projectId]/interactions/route.ts`、`app/api/psp/alerts/[alertId]/actions/route.ts`、`app/api/psp/education/[assignmentId]/route.ts`、`app/patient/education/[assignmentId]/page.tsx`；Modify `lib/clinic/actions.ts`、`app/clinic/patients/[id]/page.tsx`、`app/patient/messages/page.tsx`；Test `tests/unit/psp-service.test.ts`、`psp-education.test.ts`。

**Interfaces:** `recordInteraction({ enrollmentId, assignmentId?, alertIds, channel, outcome, occurredAt }, meta)`；`actOnProjectAlert(alertId, action: ProjectAlertAction, meta)`；`sendEducation(assignmentId, contentVersionId, meta)`；`recordEducationOpened(assignmentId, meta)`；`recordEducationFeedback(assignmentId, { understood, needsHelp }, meta)`。教育route的GET返回本患者固定内容版本及结果，POST的action为send/open/feedback：send仅case_manager，open/feedback仅对应患者，不因GET渲染即写打开事实。

```ts
type ProjectAlertAction =
  | { action: "accept" | "start" }
  | { action: "submit_review"; disposition: { category: string; summary: string; interactionIds: string[] } }
  | { action: "close"; note: string; followupTask: { type: string; dueAt: string; owner: string } };
```

`close`是医生确认动作，不增不存在的confirm状态。PSP保存精确dueAt，原FollowUpTask.due取其上海DateOnly并仍open；note/task按原route要求必填，dueAt必须晚于复核时间。本项目API不开放任意assign/escalate动作，系统继续原规则。

- [x] 先测一个interaction只能一个outcome，跨患者/项目alertIds拒绝；no_answer不算成功且不关闭预警；两预警一次电话只计一个interaction。
- [x] 既有alert状态机继续唯一执行者；start只记录开始，submit_review需结构化处置结果，医生close在一次命令中留复核证据并沿用原task/message。每个alert有复核引用，不靠联系记录猜已复核。
- [x] P-A既有常规contact计划可关联这次实际成功联系；同事实可覆盖两个alert，但不复制成三次联系或另造一个完成事件。
- [x] 教育发送只用approved固定内容版本；打开和反馈分开写；“仍需帮助”创建PSP跟进计划，不能自动改症状状态。重复打开可记录首次打开而不增加反馈完成，重试反馈幂等。
- [x] 将服务/教育卡接到姓名清晰的患者详情。未来复评dueAt由医生明确选择晚于cutoff，当前S6反馈不能把未来临床task完成。
- [x] Run `npx vitest run tests/unit/psp-service.test.ts tests/unit/psp-education.test.ts tests/unit/clinic-actions.test.ts tests/unit/clinic-timeline.test.ts`；预期接单、联系、处置、复核各有事实且旧流程不变。

## Task 5：自报值副本与补录核验

**Files:** 实际创建 `lib/psp/{selfReport,corrections,evidenceTypes,evidenceValidation,evidenceWindow,evidenceView}.ts`、`app/api/psp/enrollments/[id]/adherence/route.ts`、`app/api/psp/projects/[projectId]/corrections/route.ts`、`app/governance/projects/[projectId]/corrections/page.tsx`、`components/psp/{ProjectAdherence,CorrectionDesk}.tsx`；修改 `lib/adherence/checkin.ts`、`app/patient/adherence/page.tsx`、内部服务台及患者项目卡。原计划 `[enrollmentId]` slug 实际沿用 Next 已有父目录 `[id]`，其值仍为 enrollmentId，避免同级动态 slug 冲突。测试包含 `psp-selfreport`、`psp-corrections`、`psp-evidence-window/views/durable/ui` 及 `psp-adherence-page`。

**Interfaces:** `submitProjectAdherence({ enrollmentId, logDate?, due, taken, reason?, revisionOf? }, meta)`、`importLegacySelfReports(enrollmentId, meta)`；`proposeCorrection({ sourceRef, correctedValue, reason, occurredAt }, meta)`、`verifyCorrection(correctionId, meta)`。旧date-only导入创建固定sourceId/哈希/值副本，不能指向后续可覆盖数组。

首版现场打卡只支持上海今天、due=1、taken=0|1，与旧recordAdherence兼容；occurredAt/recordedAt由服务器now生成，拒绝客户端伪造。logDate若保留在body必须等于serverToday，不开放任意日临床剂次编辑；同日显式修订仍记新证据版本。历史 date-only 副本通过 CM 显式 POST `action=import_legacy` 导入，两个新 GET 仅查询 DTO，不导入或写入；corrections route POST action=propose/verify，补录历史服务的occurredAt可提供，但recordedAt只能服务端生成，已冻结副本不覆盖。

**Task 5 验收时状态：** 来源与补录保持不可变原值；日初用最终已知状态，严格日内按有效时间和 sequence 逐个检查中断，同刻撤回/暂停后恢复仍排除当天，晚入账及账版本限制保持。CM 联系提议为待核验，DR 核验后仅供未来新快照取源，不覆盖原联系/计划/医生事实。已核验记录的 fresh 请求仍检查当前/历史服务及来源，旧相同请求从原 receipt 重放。当时 586 项单测、lint/类型、Next/Workers 各 27 E2E、安全构建/dry-run、真实重启/15 原回执回放均通过；Task 6 的后续状态见下节。详见 [Task 5 报告](../sdd-ledger/2026-10-15-psp-task5-report.md)。

- [x] 先测taken不能超due、项目/授权不适用拒绝、临床打卡与PSP证据同成同败；再次修改同日创建revision而不改旧值。
- [x] 只纳入完整落在授权/服务/报告窗口内的历史日期；cutoff当日及跨时刻授权边界日排除，界面说明精度不足。精确新打卡按occurredAt/recordedAt处理。
- [x] 补录请求必须含修改值、发生时间、真实入账时间、原因、原来源；数据审核者核验才成为新快照可用来源。点击旧gap task done不能使PSP质量指标改善。
- [x] 已实现截止/账版本来源筛选：迟到记录、晚核验不被旧 cutoff/revision 选中，recordedAt 不倒写。Task 7 已接入重新冻结与内部来源查看；报告中列修订/迟到说明由 Task 8 的消费者实现。本项勾选仅指 Task 5 的固定来源与选择边界。
- [x] Run `npx vitest run tests/unit/psp-selfreport.test.ts tests/unit/psp-corrections.test.ts tests/unit/adherence-checkin.test.ts`；原date-only临床API继续兼容。

## Task 6：唯一指标计算与历史区间规则

**Files:** 实际创建 `lib/psp/{metrics,metricTypes,metricWindow,metricEvidenceTypes,metricEvidenceValidation,assignmentCancellation}.ts`，修改 PSP 命令、权限、服务计划、事务、类型与 `lib/state/persistence.ts`；测试为 `tests/unit/psp-{metrics,metric-window,metric-evidence,metrics-durable}.test.ts`。旧`lib/compute/adherence.ts`与alertMetrics研究含义不改。

**Interfaces:** `computePspMetrics(state: PspState, { projectId, periodStart, periodEnd, cutoffAt, scope: "internal" | "aggregate", ledgerRevision }): Metric[]`。返回有证据可证明的内部数值或明确的 `unknown`，均带适用说明与 sourceRefs；Task 7 已另行实现保护。

**当前实现状态：** `metricTypes.ts`、`metricWindow.ts`、`metrics.ts` 与聚焦测试已编写，最小 PRO/预警证据、动态计划创建序号、取消事件及持久化校验已接入；Task 6 的最终集成 gate 与独立复审均已通过，详见 Task 6 报告及代码复审记录。Task 7 页面现消费冻结的内部精确指标与受保护汇总预览；药企外部指标仍未接入。`Metric.unit` 的 `days` 仅用于有效日志覆盖日数，`sampleUnit` 保持 `people`；已知零分母返回 `null/no_applicable`，缺证返回 `null/unknown`。未知 cohort 的 `sampleN:null`，未知分子、分母和互补格省略。Task 8 起才处理报告。

- [x] 用第4节独立手算表先写失败测试；18/14必须来自区间+授权过滤，而非硬编码常量或snapshot806。
- [x] 指标 cohort 按对应锚点归属窗口：到期计划用 dueAt，本期新预警用 triggeredAt，联系次数/日志等发生量用各自 occurredAt；关联结果可跨月，但发生时须有历史资格、发生不晚于 cutoff、recordedAt≤cutoff、账序号≤冻结revision。提前完成按首次有效结果发生期单列；active截至人数另算。
- [x] 到期分母dueAt≤cutoff，取消仅在当时不适用且有合法取消证据时排除；逾期后退出/取消不删除已到期责任。迟交完成但不按时，修订不改firstValidSubmittedAt。
- [x] 到期服务任务首版明确为contact+education计划，不含问卷，标签说明范围；禁止把问卷完成数加进一个未受关联保护的总完成数。样本单位按下表，统计单位与k样本单位分开返回。
- [x] contact计划与预警联系分开；distinct interaction/alert/enrollment分别算次数/件数/人数。按时预警分母仅成熟deadline，未成熟pending单列；P50/P90用nearest-rank，零样本null并no_applicable。
- [x] 教育有效反馈计完成，打开不计；自报比为taken总剂次/due总剂次，stopIntent每计划最新有效答卷一次，不称客观服药率/实际停药。
- [x] 所有 PRO 指标共用每计划证据判定：旧链缺 typed 前缀时不猜中间修订；根答卷当时没有汇总授权，也不能证明后来获授权的缺失前缀内没有合法修订。已知到期 cohort 内可凭 scope 合法 typed 提交证明截至完成1及最新有效标记，按时若缺口可能含到期前合法提交则 `unknown`；首次完成归期、提前完成与 stopIntent cohort 不可证明时也为 `unknown`，不得把未知转为确定0或0/0。
- [x] Run `npx vitest run tests/unit/psp-metrics.test.ts`；覆盖跨月、cutoff等时、同刻账序号、迟到、退出、暂停、取消、日期精度、修订、零分母及一通电话两预警。

| 指标族 | sampleN / sampleUnit | 互补格/保护关系 |
|---|---|---|
| 成员数 | 适用去重enrollment数 / people | 无患者状态细分外发 |
| 问卷完成/按时 | 到期计划数 / forms | 完成/未完成、按时/未按时；同族保护 |
| contact/education/服务任务 | 对应到期计划数 / assignments | 成功/未成功、反馈/未反馈、完成/未完成 |
| 预警联系/时长/复核 | 适用预警件数 / alerts；时长仅有效已联系/接单样本 | 成功/未成功及成熟期限按时/未按时；同族时长与计数保护 |
| 联系尝试/成功次数 | 去重interaction数 / interactions | outcome细分整表保护 |
| 自报剂次比例 | 贡献有效日志的去重成员数 / people | taken/missed剂次互补格；dose分子分母单位不改成人数；覆盖人/天及原因表关联保护 |
| 停药念头 | 每计划最新有效答卷数 / forms | 有/无念头整项保护 |
| 缺失字段 | 应提供该字段的记录数 / records | 缺失/非缺失，字段细分整表保护 |

`unknown` 可在已知 due cohort 中保留可证明的 `sampleN`/denominator；cohort 本身未知时 `sampleN:null`，未知 numerator/denominator/complementCells 均不输出。旧链缺口也须进入数据质量来源说明；缺口可能包含合法旧答卷时，不把“当前可见答卷数”冒充实际完成数或把未见预警解释为已证明没有预警。

## Task 7：k保护、独立服务快照与来源追溯

**Files:** 已接入 `lib/psp/{protection,protectionTypes,snapshot,snapshotTypes,snapshotValidation,snapshotSourceGraph}.ts`、项目快照列表/冻结、快照详情、按指标来源三条 API、`components/psp/{SnapshotDesk,MetricEvidence}.tsx` 及内部页面；聚焦测试见同名 protection/snapshot/route/UI/durable 文件。同一冻结计算通过可选 cohort 元数据回调保存样本根及资格依据；原 Metric DTO/数值/direct refs 不变。以下 checkbox 已按最终 gate 验收。

**Interfaces:** `protectMetric(metric: Metric, k=5): ProtectedMetric`只做单项检查；`protectMetricGroups(metrics: Metric[], relations: MetricRelation[], k=5): ProtectedMetric[]`用于所有外部输出；`MetricRelation = { totalKey: string; componentKeys: string[] }`声明可由合计反推的关系。`freezePspSnapshot(projectId, window, meta): CommandResult<PspServiceSnapshot>`；`getMetricEvidence(snapshotId, metricKey, scope, role, actorId, seedVersion?)`仅内部使用。快照保存必要服务来源值及版本，不复制整个临床病历/store。

**当前验收状态：** 保护、独立快照与 staff 工作台已实现，最终独立复审 PASS / PASS，全部 Important 关闭。694 项单测、Next/Workers 各 31 E2E、安全构建/dry-run、两个快照及真实来源/保护投影的实际重启、37 份原回执回放均通过。PM/DR 冻结、MR 只读；503 原请求重试，409 核对账头；seed/身份/快照/scope 隔离迟到响应。真实教育三阶段、医生处置及联系、三种计划出生顺序、两 scope 零/部分 cohort、撤回前合法历史及旧缺证 unknown 均已验证。受保护汇总仍仅是内部预览，不是药企候选或已交付报告。见[Task 7 报告](../sdd-ledger/2026-10-15-psp-task7-report.md)和[代码复审](../sdd-ledger/2026-10-15-psp-task7-code-review.md)。

- [x] 先测 `unknown` 不输出精确值且不能伪装为0/0；再测sampleN4 suppressed、sampleN5可用、1/14完成整项suppressed、0/14可用、已知0/0 no_applicable、时长2件suppressed、细分类别小格整表抑制。
- [x] 同族多个敏感结果使用一致保护：完成1被抑制时按时0也不单独返回精确同族n/分母；多个比例、样本数、表格、解释句及导出共用组结果，不能从旁边另一指标读到本来隐藏的适用规模。
- [x] 保护原则先处理 `unknown`，不外发精确值或推定零；对可判定结果再按无适用→样本<k→任一互补非零格<k→细分表整体检查→允许字段投影。suppressed对象没有精确n/分子/分母/value/时长/sourceRefs键，不能仅置null并把精确值藏在其它字段。
- [x] 任何被抑制component使能反推它的total整项抑制，递归传播到上级合计；细分表与相关合计同一组处理。独立测试“PRO1+contact9+education9=总19”时PRO及总项均不外发，报告文字、图表和下载也不写19/42。首版服务总项只有contact+education，但组保护不能靠当前UI偶然未显示总项来成立。
- [x] 固定窗口/config/账版本/历史授权/计划/结果/教育/自报副本/算法psp-metrics-v1/保护psp-k5-v1；同一次冻结使用同一个暂存状态，不分多个GET拼接。
- [x] 内部显示精确数与来源；外部只能用快照的protected投影。冻结后修改现场源值不改变快照，hydrate后也不可变。
- [x] Run `npx vitest run tests/unit/psp-protection.test.ts tests/unit/psp-snapshot.test.ts tests/unit/snapshot.test.ts`；预期原研究snapshot仍独立有效。

本段勾选指保护/快照层、内部预览及其回归；报告正文、图表及下载消费者尚未实现，后续任务仍须统一采用保护投影。

规范保护断言：

```ts
expect(protectMetric({ key: "pro_completion", unit: "forms", sampleUnit: "forms", sampleN: 14,
  numerator: 1, denominator: 14, value: 1 / 14, sourceRefs: ["internal"],
  complementCells: [1, 13] })).toEqual({
  key: "pro_completion", unit: "forms", status: "suppressed", reason: "存在少于5的非零结果格"
});
```

## Task 8：固定报告草稿与结构化下一期安排

**Files:** Create `lib/psp/{reports,reportTemplate}.ts`、`app/api/psp/projects/[projectId]/reports/route.ts`、`app/api/psp/reports/[reportVersionId]/route.ts`；Test `tests/unit/psp-reports.test.ts`。

**Interfaces:** `createReportDraft(snapshotId, { parentVersionId?, nextActions }, meta): CommandResult<PspReportVersion>`；nextActions项为`{ category, responsibleRole, dueAt, status }`，不含patientId/姓名；`renderReportContent(snapshot, nextActions): ReportContent`固定正文与行动说明；`listInternalReports(projectId)`、`readInternalReport(versionId)`供列表/详情GET返回内部审核DTO。POST列表route创建草稿；详情不接受原地覆盖提交后的内容。

- [x] 草稿先由授权可用、受k保护的事实生成；保存snapshotId、revision/parent、contentDigest、模板版本psp-report-template-v1、采用factIDs和创建记录。
- [x] 七章节中审核/交付/验收区域为独立workflow metadata投影，后来的签署/回执不进入已提交正文digest。本阶段保存即固定正文、snapshot绑定和行动说明并生成摘要，workflow metadata追加不能偷偷改正文。提交锁定、双签和固定下载artifact/artifactDigest须由 Task 9–10 实现，当前没有签署或交付动作。
- [x] 编辑形成新revision，旧版保留；本阶段不提供内部自由备注；后续若加入，不可直接并入外部报告。外部行动说明使用结构化类别/角色/日期，不能填入病历或姓名。
- [x] 首版用确定性模板并标“模板草稿，待人工审核”，不调用临床chat provider、不新增在线报告能力。既有patient/doctor助手仍按原adapter运行；无key或在线助手失败不阻断报告。后续在线报告必须另有受控事实包/授权门控/输出验证后才开放，不能先挂通用chat。
- [x] 创建时缺硬必填字段/来源/有效授权阻止；空安排可先保存草稿并提示待补充。S8的“请补充下一期逾期事项的行动说明”业务退回在 Task 9 实现，不人为生成错误临床数字。
- [x] Run `npx vitest run tests/unit/psp-reports.test.ts tests/unit/agents.test.ts tests/unit/agent-provenance.test.ts`；报告无疗效、销售ROI、DOT提升或来源材料的宣传数字。

实现及本轮门禁见 [Task 8 报告](../sdd-ledger/2026-10-15-psp-task8-report.md)。新增最小内部草稿页仅支持创建、查看、修订和独立来源核对；Task 11 的完整工作台、签署时间线和药企报告页仍未实现。

## Task 9：报告状态机与双签绑定

**Files:** Create `lib/psp/review.ts`、`app/api/psp/reports/[reportVersionId]/actions/route.ts`；Test `tests/unit/psp-review.test.ts`、`psp-report-route.test.ts`。

**Interfaces:** `submitReport(versionId, meta)`、`reviewReport(versionId, { kind: "data" | "medical", decision: "approve" | "return", reason? }, meta)`、`reviseReport(versionId, nextActions, meta)`。

- [ ] 先测draft→in_review，data→medical和medical→data都approved；只有一签不能交付，同一审核角色重试不增加签署。
- [ ] 审批引用同version/snapshot/contentDigest/算法/保护版本；提交后锁定内容。任何审核者退回须理由，原版changes_requested，新版draft且无继承签署。
- [ ] 不增第三个PM批准状态；PM承担提交/修订/交付。错误角色/状态返回403/409，页面清楚展示缺哪一签。
- [ ] 测试同时批准同expectedVersion：第一动作成功，第二409后刷新再批准，最终两签绑定同对象；不能用覆盖数组丢失第一签。
- [ ] Run `npx vitest run tests/unit/psp-review.test.ts tests/unit/psp-report-route.test.ts`；digest不一致、旧seed、旧版本、退回后旧动作都拒绝。

## Task 10：交付验收、授权撤回与外部读取

**Files:** Create `lib/psp/delivery.ts`、`app/api/pharma/projects/[projectId]/reports/[reportVersionId]/{route.ts,download/route.ts,actions/route.ts}`；Modify `permissions.ts`、`pharmaView.ts`、`usePspState.ts`；Test `tests/unit/psp-delivery.test.ts`、`psp-gates.test.ts`、`psp-pharma-route.test.ts`、`psp-client.test.ts`。

**Interfaces:** `deliverReport(versionId, meta)`、`acceptReport(versionId, comment, meta)`、`requestClientChanges(versionId, reason, meta)`；`readPharmaReport(projectId, versionId)`返回受保护DTO或当前门控状态，不返回被阻止内容。

PM交付使用既有内部`POST /api/psp/reports/[reportVersionId]/actions`的`action=deliver`；药企报告actions接口只允许`action=accept/request_changes`，不得从外部接口触发PM交付。Task 9内部actions另有submit/review/revise，对应同名服务命令。

- [ ] 双签approved才deliver，deliver后才外部可读完整内容；客户accept单独记录；客户return→client_changes_requested→新draft完整重审。重复动作返回同回执，不双交付。
- [ ] withdrawal影响快照时只变gate/authorizationVersion；approved/delivered/accepted历史不改、内部内容不删。未交付blocked，已交付revoked。新版本重新选授权范围/冻结/双签。
- [ ] aggregate撤回影响使用该成员汇总来源的全部批次/快照/报告，不用内部18人集合误伤未贡献外部来源的人；服务授权单独撤回只停止新服务并保留合法历史，若aggregate未撤回且历史事实仍有效，不自动撤销报告。再次aggregate grant仅覆盖新的有效区间，旧blocked/revoked版不自动恢复，新版本排除此前已撤回的汇总来源；本版不支持回溯重授权。
- [ ] 每次概览、报告、下载、事实包和deliver都读当前门控；HTTP禁缓存，状态说明不带旧payload。HTML/文本下载使用同一白名单DTO生成，不能导出内部审核版。
- [ ] 客户端首次读及refresh带完整请求键；更换项目/报告/患者或reset清空旧内容，授权版本变化后丢弃迟到旧响应。测试先发旧请求、撤回、收到新gate、旧请求最后返回，页面仍只显示停止访问说明。
- [ ] Run `npx vitest run tests/unit/psp-delivery.test.ts tests/unit/psp-gates.test.ts tests/unit/psp-pharma-route.test.ts tests/unit/psp-client.test.ts`；撤回后无读/下载/模型事实旁路，不承诺回收已下载副本。

## Task 11：月报工作台、药企报告页与全线导航

**Files:** Create `app/governance/projects/[projectId]/reports/{page.tsx,[reportVersionId]/page.tsx}`、`app/pharma/projects/[projectId]/reports/[reportVersionId]/page.tsx`、`components/psp/{ReportPreview,ReportReviewPanel,ReportTimeline}.tsx`；Modify 项目概览、内部服务台及患者计划/消息；Test `tests/e2e/psp-story.spec.ts`、`psp-ux.spec.ts`。

**Interfaces:** 页面只消费Tasks2/7/8/9/10的DTO/命令，无本地重写统计、审批或交付逻辑。内部来源区与药企预览分开取数。

- [ ] 内部列表展示阶段窗口、snapshot、revision、status、两类签署、gate；操作随合法状态给出下一步，disabled有明确理由。
- [ ] 工作台可冻结→草稿→提交→医学退回→修订→双签→交付；药企页能看已交付版、反馈/验收和固定文本下载。时间线不出现患者身份。
- [ ] 患者计划/消息可回到同一assignment；医生详情能核对同一PRO/alert/service引用；研究入口保留为独立支线。
- [ ] S1–S11浏览器脚本真实填表和点击，不用测试直接注入report approved；页面报错、冲突后刷新、empty/suppressed/no_applicable/unknown都有文字。
- [ ] Run `npx playwright test tests/e2e/psp-story.spec.ts tests/e2e/psp-ux.spec.ts`（固定时钟且独立本地服务）；按8种宽度检查页面横向溢出/按钮/签署/来源区域，保存截图与trace。

## Task 12：Workers恢复/冲突与原功能完整回归

**Files:** Create `tests/e2e/psp-negative.spec.ts`、`tests/e2e/worker-state.spec.ts`、`playwright.worker.config.ts`；Modify `docs/demo-script.md`、`README.md`、`PRODUCT.md`、本计划及交接状态；记录`docs/superpowers/sdd-ledger/psp-implementation-report.md`。

- [ ] 全部unit/lint/types通过后再运行完整本地E2E，使用固定时钟的独立服务；不得复用时间未确认的3000端口，禁止把测试指向公共Workers网址。
- [ ] 安全build生成Workers包，本地Wrangler预览8787：完整新故事线、旧研究线、三次reset、窄窗口；报告freeze→双签→deliver之后停预览再重启，恢复同一snapshot/digest/receipt/gate/seedVersion。
- [ ] 独立集成环境注入handler异常/500、压缩失败/容量门槛、storage.put确定失败、存储写结果不确定及保存成功但响应丢失；按§3明确的durable提交点验证恢复：确定未保存则旧状态，实际已保存则新状态且可从回执重试，两者都没有半条业务。后续GET和重启一致，同clientRequestId重试不增加PRO/interaction/交付。不能用只测encode/decode替代DO集成。
- [ ] 两个浏览器上下文并发同版本/重置；共享演示按version冲突刷新，旧seed请求无回写。所有API经过DO但页面SSR不能自行写另一份业务状态。
- [ ] 新PSP seed单独变化后恢复新初始状态；文档变化保留状态；检查gzip保存量在2MiB门槛内并记录实际大小/快照数量。超限错误可恢复且不显示成功，报告不复制完整Patient队列以撑大状态。
- [ ] Run `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run e2e`、`npm run build:worker`、`npx playwright test --config playwright.worker.config.ts`；各命令记录exit/count。当前结果不能从本轮364测试基线继承。
- [ ] 更新真实实现/模拟/后续标识及10–12分钟脚本，记录实际模型模式和降级；公开发布、推送、PR以及真实发送遵循当次用户授权。本计划不是自动上线指令。

## 5 Review 与验收覆盖索引

| 规格场景 | 负责Tasks | 必要证据 |
|---|---|---|
| A01主线 | 2–4、7–12 | S1–S11浏览器trace；版本/项目一致 |
| A02问卷重试修订 | 3 | 同请求/不同body/新修订；真实PRO/预警与完成数 |
| A03接单非联系 | 4、6 | accepted增加但contact分子不变 |
| A04一电话多预警/失败重试 | 4、6 | interaction、alert、成员三套去重 |
| A05未来复评 | 4、6 | dueAt未来且open，不计到期完成 |
| A06教育 | 4、6 | 打开非反馈，needsHelp跟进，无改善声明 |
| A07授权人群 | 1–2、6–7 | 20/18/14手算，外部无18/差额/患者 |
| A08历史/时间/边界 | 2、5–6 | 独立负向fixture和来源精度说明 |
| A09冻结 | 7–8、12 | 源数据修改/重启后旧内容digest不变 |
| A10双审核 | 8–9 | 两种顺序、版本绑定、退回重签 |
| A11客户反馈/验收 | 10–11 | delivered与accepted分开、重复幂等 |
| A12撤回/迟到响应 | 2、10、12 | 所有外部读取与下载停止，旧payload不回显 |
| A13小样本 | 6–8、10 | n/比例/时长/表格/下载一致无旁路 |
| A14错误/冲突/重置 | 1–4、9–10、12 | 旧seed/CAS/请求身份绑定和恢复 |
| A15模型回退 | 0、8、12 | 无key全线；现有助手错误回模板，PSP报告不调用临床provider |
| A16窗口 | 2、4、11–12 | 八种宽度与可操作截图 |
| A17旧链/seed | 1、3–4、12 | 五组筛选、原E2E、原AI边界 |
| 新增构建/DO条件 | 0–1、12 | sentinel、重启、失败、共享访客、种子失效、实际包大小 |

## 6 当前交接状态

Task 0–7 已实现并有分阶段验收记录。Task 6 的唯一纯计算指标、历史资格与可选证据扩展已通过完整门禁及独立复审；本计划 Task 6 checkbox 已勾选。Task 7 的独立复审、全量运行及真实重启门禁已完成，Task 7 checkbox 已勾选；Task 8–12 尚未实施。药企页面目前不显示 Task 6/7 的精确或预览月报指标。

商业输入仍沿用虚构参数：真实采购/验收部门、SOW、专家内容、服务覆盖时段和授权文本没有被本计划认定已确认。它们不阻碍合成演示实施，但不能替换标签或用作实际项目承诺。
