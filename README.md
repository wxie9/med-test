# 乳腺癌全生命周期平台 · 全链路功能演示版

一个可本地一条命令启动、可反复演示的 Web 原型，展示"患者 → 医生 → 数据治理 → 药企研究 → 试验机会回到患者"的闭环。全部数据为合成数据，仅用于演示。

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
- 运行时状态（预警、任务、队列、快照、候选请求、补数任务、患者消息）保存在服务进程内存中；重启服务或点击一键重置即回到种子状态（一键重置同时清除浏览器里记住的演示患者、工作台身份与已读消息）。
- 种子数据：种子 20261013、生成器 gen-v4、数据截止日 2026-10-13、队列 checksum `cc3217fe1d251f10`；锚点 12 例 + 批量队列 2000 例（共 2012 例）+ 异常病例 20 例（只用于测试）。截止日之后不存在任何治疗、结局、问卷或打卡记录。详见 `docs/data-generation.md`。
- 更新生成器后，如本地已有旧的 `cohort.json`，先运行 `npm run seed` 重新生成数据，再重启演示服务器。

## 可选：模型配置

助手默认运行在 **本地演示模式**（确定性模板，数字由计算服务填充），无需任何密钥、断网也能完整演示。若要接入在线模型，复制 `.env.example` 为 `.env.local` 并填写：

| 变量 | 说明 |
|---|---|
| `DEMO_CLAUDE_API_KEY` | Anthropic API 密钥；填写后优先使用 Claude |
| `DEMO_OPENAI_API_KEY` | OpenAI 兼容接口密钥（未填 Claude 密钥时使用） |
| `DEMO_OPENAI_BASE_URL` | OpenAI 兼容接口地址，默认 `https://api.openai.com/v1` |
| `DEMO_OPENAI_MODEL` | OpenAI 兼容接口的模型名（使用兼容接口时必填） |
| `DEMO_FIXED_NOW` | 固定服务器时间，如 `2026-10-13T10:00:00+08:00`，保证演示话术与服务时段一致 |
| `DEMO_PERSIST` | 预留（落盘 SQLite），本版未实现 |

- 密钥只在服务端读取，浏览器不接触模型接口。修改 `.env.local` 后需重启 `npm run demo`。
- 无密钥、网络错误、401/403、429、超时（8 秒）或输出校验失败（含回复被 `max_tokens` 截断或被模型拒答）时，助手自动降级为本地演示模式，并在对话框顶部提示原因。右上角 ModeBadge 始终显示当前模式。
- 在线回复中的数字须复用服务端提供的带字段事实句（年龄、症状分级、随访日期、人数、比例分别校验），不能把年龄用于人数。指南引用须来自本轮检索；研究端只允许受控描述性事实，疗效/生存问题在所有模式下返回范围说明。未满足约束的措辞会降级为本地模板；患者/医生的非数字自由文本仍需专家审阅。
- OpenAI 兼容接口的 `finish_reason=length`、`content_filter` 或 `refusal` 也会降级。快照总人数、符合已知条件人数及明确的一线→二线、二线→三线统计在所有模式下都由服务端计算与呈现；其它线别或歧义问题返回范围说明。
- **演示前请用真实密钥试跑一次**：单元测试只用模拟的接口响应验证了 Claude / 兼容接口的调用流程，真实密钥下的模型名、配额与回复长度（`max_tokens` 1500）需要在演示日前用三个助手的快捷问题各试一遍。在线模式下每条回复只有两种结果：要么正文中的数字、引用与研究结论逐字复用服务端事实句，要么在对话框顶部显示带中文原因的降级提示（如「已切换至本地演示模式（输出未通过校验）」）并改用本地模板作答。两种结果都是预期行为，演示时按当时显示的模式讲解即可；若每个问题都降级，请先检查密钥、模型名与配额，再看降级提示中的原因。

## 测试

```bash
npm test                         # Vitest 单元测试
npx playwright install chromium  # 首次运行端到端测试前安装浏览器
npm run e2e                      # Playwright：完整故事线、三轮重置、390–1920px 研究页与患者身份
npm run lint                     # ESLint CLI
npx tsc --noEmit                 # 类型检查
```

- `npm run e2e` 会自动以 `DEMO_FIXED_NOW=2026-10-13T10:00:00+08:00` 启动 `npm run demo`；若 3000 端口已有服务则直接复用，因此请先停掉未设置 `DEMO_FIXED_NOW` 的服务，以免夜间运行时患者端反馈文案不同。
- 端到端测试共享同一个服务进程的内存状态，配置为单 worker 串行执行。

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
| 医生工作台 | `/clinic/alerts` | 预警队列与指标（开始处置 / 提交复核留处置记录）、患者列表与全程时间轴、医生助手（含建议草稿）、随访任务、队列圈选与导出 CSV、候选核查（可直接打开患者视图）；可切换个案管理师 / 医生身份 |
| 数据治理 | `/governance` | 候选队列质量指标与知情同意统计、研究快照（不可变）、补数任务、HIS 接口页 |
| 药企研究 | `/research` | 快照选择、概览、治疗模式、入组可行性漏斗、依从性与停药原因描述、研究助手、候选核查申请；只见去标识化统计 |

## 功能标记

- **[交互]** 本次真实实现、可操作、数据实时计算（绝大多数页面）。
- **[模拟]** 界面与固定流程已实现，后端为预设，例如 HIS 接口状态页、患者端"预约门诊"按钮。
- **[后续]** 仅以说明文字出现、不实现，例如研究门户的分析沙箱、医生工作台患者详情的"MDT 资料包"、患者端首页的"援助项目"。

## 相关文档

- `docs/demo-script.md`：12–15 分钟演示脚本（演示前检查、五段故事线含两个研究快照、统计一致口径、故障应对）
- `docs/data-generation.md`：合成数据生成说明与不支持的推断清单
- `docs/superpowers/specs/2026-10-13-breast-cancer-lifecycle-demo-design.md`：设计规格
- `docs/superpowers/sdd-ledger/2026-10-14-review-fix-report.md`：第一轮系统 Review 的修复、复审、验证记录与剩余依赖项

锚点病例与指南要点库均为演示转述，待专家审阅。

## Cloudflare Workers 部署

Git 构建已为 `med-test` 配置：构建命令 `npm run build:worker`，部署命令 `npx wrangler deploy`，项目根目录 `/`。推送到 `main` 后自动构建发布。采用 OpenNext 保留页面和 API，默认运行确定性助手，无需在线模型密钥。

```bash
npm ci
npm run build:worker       # 生成 gen-v4 数据并构建 Workers
npx wrangler dev           # 在 Workers 本地运行时预览
npx wrangler login         # 仅手动 CLI 发布时需要
npx wrangler deploy
```

运行时固定演示时间为 `2026-10-13T10:00:00+08:00`。仅将合成种子数据和公开演示脚本加入构建包；本地 `.env*`、`.dev.vars*`、生成包和账户凭据均不入库。静态资源由 Workers Assets 提供，未启用付费 R2 或在线模型。

本版状态仍为内存演示状态：同一 Worker isolate 内的访问共享状态；不同 isolate 的状态可能不同，服务实例回收和重新部署后可能恢复种子。它不是持久化数据库或独立的多用户会话。正式演示前重置并走完一次故事线；多人同时操作可能互相影响。若公网验证发现状态连续性问题，须先补状态协调，不应只凭首页能打开就认定部署可演示。
