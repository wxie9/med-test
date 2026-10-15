# 乳腺癌全生命周期平台 · 全链路功能演示版

一个可本地启动、可反复演示的 Web 原型，主线为“药企支持项目 → 患者反馈 → 医护服务 → 固定阶段报告 → 双审核 → 交付与客户验收”。原患者预警、研究快照、候选核查及研究机会回到患者的支线保留。全部数据为合成数据，身份和渠道均为模拟。

PSP Task 0–12 已完成既定功能与本轮执行验收；Task 12 状态：`已完成（最终代码、执行验收及独立复核均通过）`。本轮最终单测 `925 项 / 99 文件（61.86s，4 worker）`、Next E2E `57 passed + 1 explicit Worker-only skip`、Worker E2E `58 passed`、实际 DO gzip `395995` 字节，命令退出码、故障注入、重启/回执、原研究回归和独立审查以 [Task 12 最终报告](docs/superpowers/sdd-ledger/psp-implementation-report.md) 的当轮证据为准。Task 11 及更早数字保留为[历史验收](docs/superpowers/sdd-ledger/2026-10-15-psp-task11-report.md)，不代替 Task 12 重跑。

技术栈：Next.js 15（App Router）、React 19、TypeScript、Tailwind CSS 4、Recharts；单元测试 Vitest，端到端测试 Playwright。

## 环境要求

- Node.js 22.13+（含 npm；依赖声明的引擎范围为 `^20.19.0 || ^22.13.0 || >=24`，22.12 及更早的 22.x 不满足）
- 端到端测试需要 Playwright 的 Chromium（首次运行前安装一次）

## 安装与启动

```bash
npm install
npm run demo
```

- `npm run demo` 在 3000 端口启动开发服务器；首次启动若 `data/seed/cohort.json` 不存在，会先自动执行 `npm run seed` 生成种子数据。
- 打开 `http://127.0.0.1:3000/`。在 `localhost` 无法解析的机器上（例如 `/etc/hosts` 中没有 localhost 条目），请一律使用 `127.0.0.1`。
- 首页提供四个视角入口、**一键重置**（恢复到种子状态）、数据清单（种子、版本、checksum、截止日）与演示脚本链接（`/demo-script`，内容即 `docs/demo-script.md`）。
- 本地 Next 的临床与 PSP 运行状态保存在进程内存中，重启回种子；Worker 使用共享 Durable Object，停止后用同一持久化目录重启恢复原状态。两者点击一键重置均回种子，并清除浏览器记住的演示患者、工作台身份与已读消息。Worker 重置会影响同环境所有访客。
- 种子数据：种子 20261013、生成器 gen-v4、数据截止日 2026-10-13、队列 checksum `cc3217fe1d251f10`；锚点 12 例 + 批量队列 2000 例（共 2012 例）+ 异常病例 20 例（只用于测试）。截止日之后不存在任何治疗、结局、问卷或打卡记录。详见 `docs/data-generation.md`。
- 更新生成器后，如本地已有旧的 `cohort.json`，先运行 `npm run seed` 重新生成数据，再重启演示服务器。

## 可选：模型配置

无密钥时，临床/患者/研究助手直接使用确定性模板，数字由工具与计算服务填充；依赖安装完成且本机服务运行时，无需外网即可演示。托管 Worker 仍需网络访问。PSP 报告始终采用 `psp-report-template-v1`，不调用在线报告模型。

本地可选配置沿用服务端环境变量；不要提交密钥或在日志/浏览器打印环境值：

| 变量 | 说明 |
|---|---|
| `DEMO_CLAUDE_API_KEY` | 配置后优先使用 Claude；当前适配器固定模型 `claude-sonnet-5-5` |
| `DEMO_OPENAI_API_KEY` | 未配置 Claude 时使用 OpenAI 兼容接口 |
| `DEMO_OPENAI_BASE_URL` | 默认 `https://api.openai.com/v1`，适配器调用 `/chat/completions` |
| `DEMO_OPENAI_MODEL` | 使用兼容接口时必填 |
| `DEMO_FIXED_NOW` | 固定服务器时间；演示与验收使用 `2026-10-13T10:00:00+08:00` |
| `DEMO_PERSIST` | 本地 Next 落盘的预留变量，未实现；Worker 持久化另见下文 |

模型配置变化后需重启本地服务。ModeBadge 显示 store 的配置模式，不能证明本条回复调用过在线模型：患者安全问题和受控研究定量/范围问题可直接由服务器模板回答；在线请求失败则本条回复显示中文降级提示并返回本地模板。provider 总预算 7.5 秒，max_tokens 为 1500；网络、401/403、429、配置缺失、超时、输出校验失败、截断/拒答/过滤均会回退。未配置密钥直接运行本地模板，不出现故障降级提示。

在线数字须逐字使用带字段的服务端事实，指南引用须来自本轮检索，研究端仅允许受控描述性事实。药物调整、急症提示及研究疗效/生存边界在各模式保持；医生草稿仍需人工确认，指南与非数字自由文本仍待专家审阅。固定数值与审批/交付不依赖模型完成。

Task 12 实际测试模式/降级为 `Next/Worker 实际响应 mode=deterministic，guarded/degraded/detail 均缺失；provider 失败降级由最终单测中的 mock 响应验证，不是真实在线失败`；真实 provider 调用验证范围为 `未使用真实在线 provider/密钥；不验证线上模型可用性、配额或真实网络故障`。模拟响应测试不代表真实模型、配额或密钥可用。需要线上试用时另行记录真实结果；无需为了完整 PSP 演示配置密钥。

## 测试

先通过 unit/lint/types，再运行完整独立服务 E2E。默认 Task 12 Next 地址为 `http://127.0.0.1:3112`，Worker 本地预览为 `http://127.0.0.1:8787`，统一固定时钟，单 worker 串行执行。最终配置与命令实现：`playwright.config.ts / playwright.worker.config.ts + scripts/e2e-runtime.mjs：Next3112、Worker8787/9240、固定时钟、单 worker/retries0、拒绝旧端口复用；独立 DO8798/9241，最终报告记录实际执行`；不复用旧配置的 3000 服务。

```bash
npm test -- --maxWorkers=4
npm run lint
npx tsc --noEmit
npx playwright install chromium  # 首次准备浏览器
npm run e2e
npm run build:worker
node --import tsx --test tests/integration/worker-state/assert-dto.regression.mjs
npm run test:worker-state
npx playwright test --config playwright.worker.config.ts
```

独立 DO 集成还需 Python 3 标准库 sqlite3 读取已停止的本机数据库，使用端口 8798 / 9241；不增加 npm 依赖。接口断言检查为 3 个正例与 30 个反例，故障集成另外运行 27 个操作故障与 1 个种子生命周期场景。

E2E 会更改共享演示状态，不能指向公共 Worker，也不复用时间未确认的旧 Next 服务。Worker 使用独立持久化目录；恢复测试须停止后在同目录重启。当前代码的全部命令退出码、数量、失败修复与证据链接以最终报告为准，不能引用旧任务数字作为本轮通过。

本轮最终 Next 开发运行确实复现 Socket listener 警告；定向分配栈定位到 Next15.5.27 静态路径 worker 的 stdout/stderr pipe（127–128行），未测 listener 寿命或生产影响，未隐藏警告或修改依赖。完整证据与限制见 [Task 12 最终报告](docs/superpowers/sdd-ledger/psp-implementation-report.md)。

## 目录结构

```text
app/                 页面与 API 路由（/patient、/clinic、/governance、/research、/demo-script、/api/*）
components/          共享组件（预警队列、助手面板、漏斗图、手机外框等）与各视角子组件
lib/domain/          实体类型（zod）、HER2 派生、治疗线推断 lines-v1、日期工具
lib/compute/         队列筛选、漏斗、治疗模式、依从性、质量指标
lib/alerts/          预警规则与状态机
lib/agents/          助手适配层（Claude / OpenAI 兼容 / 本地模板）、工具与模板
lib/state/           内存状态容器、重置、服务器时钟
lib/seed/            合成数据生成器、硬约束校验、种子加载
lib/docs/            演示脚本页使用的极简 Markdown 解析
lib/{clinic,patient,governance,research,pro,plan,adherence,client}/  各视角业务逻辑与客户端钩子
data/seed/           锚点病例、清单、预期人数、指南要点库（cohort/edge-cases 为生成文件，不入库）
scripts/             种子生成脚本
tests/unit/          Vitest 单元测试
tests/e2e/           Playwright 端到端测试
docs/                演示脚本、数据生成说明、设计规格与方案
```

## 四个演示视角

| 视角 | 入口 | 内容 |
|---|---|---|
| 患者端 | `/patient` | 手机外框；首页、症状问卷、随访计划、服药打卡、消息、研究机会、患者管家；可切换患者 A / B（`?patient=<ID>` 可切到任一患者） |
| 医生工作台 | `/clinic/alerts` | 预警队列与指标（开始处置 / 提交复核留处置记录）、患者列表与全程时间轴、医生助手（含建议草稿）、随访任务、队列圈选与导出 CSV、候选核查（可直接打开患者视图）、PSP 服务台；可切换个案管理师 / 医生身份 |
| 数据治理 | `/governance` | 候选队列质量指标与知情同意统计、研究快照（不可变）、补数任务、HIS 接口页 |
| 药企研究 | `/research` | 快照选择、概览、治疗模式、入组可行性漏斗、依从性与停药原因描述、研究助手、候选核查申请；只见去标识化统计 |

首页与顶栏的“药企项目”入口现在指向 `/pharma/projects`，研究演示仍可从药企导航进入 `/research`。

## PSP 演示与报告边界

按[10–12 分钟脚本](docs/demo-script.md)完成 S1–S11。入口 `/pharma/projects` 展示项目范围、受保护的当前允许汇总人数与曾交付版本；初始无报告。院内服务台 `/clinic/projects/PSP-BC-ENDO-001/services` 展示成员与固定计划，P-A 从自己的计划填写项目问卷，小陈记录一次实际联系并关联两条预警，医生确认处置并安排未来复评，患者确认教育阅读及帮助需求。未来临床复评和教育帮助联系仍待办，不计作本次完成或改善。

项目服务授权与汇总授权独立；临床科研同意不覆盖 PSP。原 20/18/14 人群来自独立 `psp-v1` fixture，gen-v4 原临床 seed 保持。邀请者授权后还需医生适用性确认和 CM 激活；新成员只领取固定项目日历中的下一次未到期计划，不补造加入前逾期责任。

项目问卷需从固定计划进入，普通 `/patient/pro` 不完成项目计划。首次合法提交原子保存 PRO/预警与完成事实，迟交保留固定截止；显式修订保留首次完成时间。项目今日服药自报保存不可变值副本，历史日期副本显式导入；联系补录先提议后核验，不覆盖原事实或旧快照。查看页面/GET 不自动导入或核验。

服务台进入 `/governance/projects/PSP-BC-ENDO-001/snapshots`，项目经理或项目数据审核者冻结期间、cutoff、源账、计算/保护版本及必要来源；医学审核者只读。内部精确指标、来源与受保护预览分别展示，药企不读取内部来源。小样本及互补小格按演示 k=5 联动保护；已保护、未知、无适用项均不解释为零，也不代表法律上的匿名化证明。

从当前快照进入 `/governance/projects/PSP-BC-ENDO-001/reports` 生成七章确定性模板；下一期安排只含类别、负责角色、上海时间与计划状态。报告修订显式选择最新父版本，原版正文与摘要保留。项目经理提交，数据/医学审核者分别签署，顺序任意；一签不能交付，退回须理由，新版不继承旧签署。项目经理交付最新合格双签版，药企才可从列表进入实际报告链接预览/下载固定文本或 HTML、请求修改或验收。客户修改后须重新修订双审；验收与交付是不同动作，不表示所有指标达标或疗效/ROI 成立。

报告正文摘要与独立工作流记录分开；交付文件 UTF-8 字节及 SHA-256 固定，客户意见/验收不修改文件。授权来源门控与报告生命周期分开：来源撤回阻止新外部读取/下载及交付，保留内部历史，重授权不恢复旧来源，也不能收回已下载副本。药企只见白名单保护投影，内部 patientId、联系备注、来源引用和退回自由文本不外发。

503/响应丢失使用原请求精确重试；409 刷新并核对最新版本后继续，身份、患者、seed/auth 变更会隔离旧响应。患者计划、教育、服务消息与医生处置保持同一实际 patient/assignment/PRO/alert/interaction 引用；缺引用显示不可用，不猜最近记录。

当前 Task 12 状态：`已完成（最终代码、执行验收及独立复核均通过）`；最终本地/Worker 故事、原研究支线、八宽度、三次 reset、恢复/冲突与故障证据见[最终报告](docs/superpowers/sdd-ledger/psp-implementation-report.md)。分阶段证据从 [Task 11 报告](docs/superpowers/sdd-ledger/2026-10-15-psp-task11-report.md)及其引用查阅；历史数字不代替本轮检查。

## 功能标记

- **[交互]** 本次真实实现、可操作、数据实时计算（绝大多数页面）。
- **[模拟]** 界面与固定流程已实现，后端为预设，例如 HIS 接口状态页、患者端"预约门诊"按钮。
- **[后续]** 仅以说明文字出现、不实现，例如研究分析沙箱、患者详情“MDT 资料包”、首页慈善赠药“援助项目”。慈善援助与已实现的 PSP 支持项目不同。身份、患者、电话记录及交付渠道仍为合成/模拟，软件交互实现不代表真实服务已经执行。

## 相关文档

- [演示脚本](docs/demo-script.md)：10–12 分钟 PSP S1–S11 主线，原临床/研究闭环为可选附录，含预检、口径与故障应对
- [Task 12 最终报告](docs/superpowers/sdd-ledger/psp-implementation-report.md)：本轮命令、负向/恢复及原功能验收证据
- `docs/data-generation.md`：合成数据生成说明与不支持的推断清单
- `docs/superpowers/specs/2026-10-13-breast-cancer-lifecycle-demo-design.md`：设计规格
- `docs/superpowers/sdd-ledger/2026-10-14-review-fix-report.md`：第一轮系统 Review 的修复、复审、验证记录与剩余依赖项

锚点病例与指南要点库均为演示转述，待专家审阅。

## Cloudflare Workers 部署

Git 构建已为 `med-test` 配置：构建命令 `npm run build:worker`，部署命令 `npx wrangler deploy`，项目根目录 `/`。推送到 `main` 后自动构建发布。采用 OpenNext 保留页面和 API，默认运行确定性助手，无需在线模型密钥。

```bash
npm ci
npm run build:worker       # 在隔离目录生成 gen-v4 数据并构建 Workers
npx wrangler dev           # 在 Workers 本地运行时预览
npx wrangler login         # 仅手动 CLI 发布时需要
npx wrangler deploy
```

运行时固定演示时间为 `2026-10-13T10:00:00+08:00`。仅将合成种子数据和公开演示脚本加入构建包；本地 `.env*`、`.dev.vars*`、生成包和账户凭据均不入库。静态资源由 Workers Assets 提供，未启用付费 R2 或在线模型。

`build:worker` 将源文件和已安装依赖复制到临时目录，递归排除 `.env*` / `.dev.vars*`、本地构建缓存及工作区；构建子进程仅继承必要系统变量，并使用固定演示时间。它拒绝外部源链接/依赖链接，不读取或移动原环境文件，也不替换本地 `.next`。构建后检查 OpenNext 三种模式的环境模块均为空、产物无 dotenv 文件，才更新 `.open-next` 和 `cloudflare/files.generated.mjs`；更新失败回滚两份产物，失败不触发后续部署。复制依赖需要额外临时磁盘空间，临时目录在成功或失败后清理；若输出备份恢复也失败，保留备份并报告恢复路径。

Workers 构建统一使用 `npm run build:worker`；`preview:worker` 和 `deploy:worker` 也调用这一入口。直接运行 OpenNext 构建不会经过隔离校验。需要验证部署打包而不发布时，可在安全构建成功后运行 `npx wrangler deploy --dry-run`。本地 `npm run demo` 的模型配置方式保持原样。

本次构建隔离与 lint 修复的验证记录见 [Worker 构建修复报告](docs/superpowers/sdd-ledger/2026-10-14-worker-build-env-fix.md)。

Workers 的 `/api/*` 统一经过一个 SQLite-backed Durable Object：跨实例访问使用同一份演示状态，并在请求结束前保存压缩快照；实例回收后恢复患者、预警、任务、研究快照和重置版本。静态页面及资源继续在边缘提供。它仍是**所有访问者共享的演示环境**，不是独立的多用户会话。首页“一键重置”会同时重置所有访问者的演示状态；勿在他人演示中操作。

Durable Object 使用 Free 支持的 SQLite 后端，未升级付费套餐。存储按 gen-v4 与全部种子文件的 SHA-256 分开；将来改变业务状态结构须迁移版本，不能直接复用旧快照。压缩存储值在 2 MiB 内预留 1024 字节，实际保存上限为 2096128 字节，超限保存必须失败且可恢复，不显示成功或暴露 tentative 状态；后续 GET/重启以实际 durable 保存结果为准。先核对原请求回执与错误，再决定是否明确重置共享演示。Task 12 实际 gzip/快照数量为 `395995` 字节 / `1` 份，详见本轮报告。

PSP 第一阶段的持久化 payload 为 schema v2，存储键为 `demo-v2-<临床版本>-<全部种子指纹>`，PSP fixture 和 manifest 均参与打包与指纹。旧 v1 共享演示进度会在升级后重新初始化，不进行隐式迁移；Durable Object 类和迁移标签保持原配置。恢复会严格校验临床及 PSP 状态，并重新冻结研究快照和已批准教育内容。接口在持久化成功后才返回成功；写入失败会重读持久化结果，恢复无法确认时返回 503 并阻止后续操作，直到恢复完成。同一次失败操作可用原请求编号重试。
