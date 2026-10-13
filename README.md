# 乳腺癌全生命周期平台 · 全链路功能演示版

一个可本地一条命令启动、可反复演示的 Web 原型，展示"患者 → 医生 → 数据治理 → 药企研究 → 试验机会回到患者"的闭环。全部数据为合成数据，仅用于演示。

技术栈：Next.js 15（App Router）、React 19、TypeScript、Tailwind CSS 4、Recharts；单元测试 Vitest，端到端测试 Playwright。

## 环境要求

- Node.js 20 或更高版本（含 npm）
- 端到端测试需要 Playwright 的 Chromium（首次运行前安装一次）

## 安装与启动

```bash
npm install
npm run demo
```

- `npm run demo` 在 3000 端口启动开发服务器；首次启动若 `data/seed/cohort.json` 不存在，会先自动执行 `npm run seed` 生成种子数据。
- 打开 `http://127.0.0.1:3000/`。在 `localhost` 无法解析的机器上（例如 `/etc/hosts` 中没有 localhost 条目），请一律使用 `127.0.0.1`。
- 首页提供四个视角入口、**一键重置**（恢复到种子状态）、数据清单（种子、版本、checksum、截止日）与演示脚本链接（`/demo-script`，内容即 `docs/demo-script.md`）。
- 运行时状态（预警、任务、队列、快照、候选请求、补数任务、患者消息）保存在服务进程内存中；重启服务或点击一键重置即回到种子状态。

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
- 无密钥、网络错误、401/403、429、超时（8 秒）或输出校验失败时，助手自动降级为本地演示模式，并在对话框顶部提示原因。右上角 ModeBadge 始终显示当前模式。

## 测试

```bash
npm test                         # Vitest 单元测试
npx playwright install chromium  # 首次运行端到端测试前安装浏览器
npm run e2e                      # Playwright：完整故事线 + 三轮重置 + 1440×900 无横向滚动
npm run lint                     # ESLint（next lint）
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
| 医生工作台 | `/clinic/alerts` | 预警队列与指标、患者列表与全程时间轴、医生助手、随访任务、队列圈选、候选核查；可切换个案管理师 / 医生身份 |
| 数据治理 | `/governance` | 候选队列质量指标与知情同意统计、研究快照（不可变）、补数任务、HIS 接口页 |
| 药企研究 | `/research` | 快照选择、概览、治疗模式、入组可行性漏斗、依从性描述、研究助手、候选核查申请；只见去标识化统计 |

## 功能标记

- **[交互]** 本次真实实现、可操作、数据实时计算（绝大多数页面）。
- **[模拟]** 界面与固定流程已实现，后端为预设，例如 HIS 接口状态页、患者端"预约门诊"按钮。
- **[后续]** 仅以说明文字出现、不实现，例如研究门户的分析沙箱。

## 相关文档

- `docs/demo-script.md`：12–15 分钟演示脚本（演示前检查、五段故事线、故障应对）
- `docs/data-generation.md`：合成数据生成说明与不支持的推断清单
- `docs/superpowers/specs/2026-10-13-breast-cancer-lifecycle-demo-design.md`：设计规格

锚点病例与指南要点库均为演示转述，待专家审阅。
