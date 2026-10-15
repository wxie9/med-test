# PSP 药企阅读与验收体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让药企项目负责人从现有项目概览进入本版交付，先理解服务范围、阶段结果及限制，再核对依据并完成验收或请求修改。

**Architecture:** 复用两个现有页面、现有外部 DTO 和客户命令，仅增加药企端的展示组件与确定性阅读模型。`PharmaReport.tsx` 继续持有父子读取、授权失效通知、意见输入及原始操作请求，新增组件不获取内部数据、不保存业务状态。完整正文、公开时间线和既有固定下载作为可核对依据保留。

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind CSS 4；Vitest + Testing Library；Playwright 的隔离 Next 与本地 Workers 环境。不新增依赖。

## Global Constraints

- 设计依据：[第一批设计草案](../specs/2026-10-15-psp-client-experience-design.md)。制定计划时用户只授权编制计划；后续明确授权“开始实施 UX Task 1，验证通过后 commit”。Task 1、2 已按授权完成；用户随后明确授权“逐步编码，逐步commit，直到弄完task6”。本次串行实施 Task 3–6；各步骤按实际验证进度勾选。
- 代码基线：`1d5a67f754d6a2aee3da7fbbefff7cf35eab51d9`，现有 PSP Task 0–12 已完成。本计划另用 UX Task 1–6 编号，避免改写旧任务状态。
- 本文件中的接口、测试片段、命令与 commit 为实施说明；任务勾选只对应已完成的实际步骤。UX Task 1–6 均已完成；实际提交及证据见各任务执行记录、验收报告和 Git 日志。
- 仅调整 `/pharma/projects/[projectId]`、`/pharma/projects/[projectId]/reports/[reportVersionId]`；项目列表只做入口与文案衔接，不新增路由。
- 不增加实时绩效、在线 AI 总结、PDF、ZIP、独立封面或新签章；不增加 schema、种子、provider、依赖、服务端动作或持久化字段。
- `PharmaProjectView.metrics` 保持 `[]`；当前 `allowedMembers` 不作为报告统计分母；报告按现有外部投影顺序展示，不自动选“最新可用”或回退旧版。
- 阅读提要仅来自当前可读的本版外部报告；不调用内部指标、成员、临床记录、来源或其他报告补值。
- available / suppressed / unknown / no_applicable 分别显示；保护项不得通过数值、描述、颜色、标题、aria-label 或 tooltip 泄露；缺失或类型错误不补零。
- `content`、`contentDigest`、`artifact.text`、文件校验码、模板/指标/保护版本及既有文本/HTML下载不变。展示重排不生成新交付物。
- `nextActions` 最多12项，保留类别、负责角色、时间、planned/in_progress；验收不把计划改成实际完成。
- 不新增验收 checkbox、逐项阅读记录或“全部正确/目标达标”声明；验收意见仍可选，请求修改理由仍必填。
- 保持原有 503 原请求精确重试、409 刷新后人工核对，以及 seed / project / report / window / authorization 隔离。排版不能卸载同一 scope 的原命令 owner。
- 保留 `public-report-body`、`public-report-timeline`、`public-report-feedback`；点击、直达 hash、浏览器前进/后退都能到达并展开必要内容。
- 沿用白底、系统中文字体、洋红强调及现有控件；390px单列、755px换行、1440/1920px限制阅读行宽；不能仅靠颜色传达状态。
- 测试使用现有隔离运行器：Next 3112、本地 Worker 8787/9240；不复用3000，不重置用户当前已验收的演示，不部署。
- 内部例外队列、修订对比包、患者复评表达、真实 SOW/SLA 与采购口径均属后续批次，不混入本计划。

## 1. 交付顺序与评审点

| 顺序 | 独立交付 | 依赖 | 本步评审重点 |
|---|---|---|---|
| UX Task 1 | 外部事实的确定性展示契约 | 无 | 四类状态、缺失处理、无跨来源补值 |
| UX Task 2 | 项目概览与逐版交付入口 | 1 | 服务与交付解释、真实空态、逐版 gate |
| UX Task 3 | 分层报告阅读与原文核对 | 1、2 | 首屏顺序、40项可达、原文件不变、锚点 |
| UX Task 4 | 前置核对提示与状态化客户操作 | 3 | 核对依据、真实回执、原请求 owner 连续性 |
| UX Task 5 | 浏览器验收与安全边界回归 | 2–4 | 实际读取、下载字节、延迟响应、窄窗口 |
| UX Task 6 | 双运行时完整验收及演示交接 | 5 | 主线可走通、证据对应最终代码、文档可接手 |

推荐按表顺序逐项完成、验证、评审并提交。Task 3/4 都要改 `PharmaReport.tsx`，不并行编辑；实施采用当前 session 串行推进。Task 1 和 Task 2 快进 main 前分别按 `requesting-code-review` 技能安排了独立只读复核，未委派实现。每个任务失败先在本任务修复，不累积到末尾统一“调通”。

**2026-10-15 执行记录：** UX Task 1 已完成，提交 `8041006` 已快进至 main；该提交仅包含模型、测试夹具、模型测试三个文件。基线99文件/925测试通过；新增66项测试经历红绿验证，最终100文件/991测试、lint和TypeScript检查均exit0；独立只读复核无Critical/Important/Minor问题，独立重跑66项测试通过。本轮没有接入页面或改动演示状态；原有设计、评审和本计划文档仍为本地未提交文件，未计入该代码提交。

**2026-10-15 Task 2 执行记录：** 已完成，提交 `ed14db0` 已快进至 main。代码和测试共六个文件，未改服务端投影、请求 owner、固定报告、schema、种子或依赖。新增17项概览测试在旧界面上16失败/1通过，实现后17全部通过；相关集成64项通过，最终101文件/1008单测、TypeScript及lint均exit0。Next定向13项E2E全部通过，包含原S1–S11主线和390/755/1440/1920宽度的真实报告入口、键盘导航、0业务POST与账版本不变验证；四宽度截图均已人工检查。独立只读复核无Critical/Important/Minor问题，并独立重跑17项概览测试通过。Worker E2E及后续UX任务本轮未执行。设计、评审与计划文档继续保留为本地未提交文件。

## 2. 文件与职责地图

以下路径均相对于仓库根目录 `/Users/xue.w/Desktop/med_Test`。仅修改列出的职责范围；执行时若需要改变服务端投影或请求协议，先停止该扩展并重新确认设计。

| 文件 | 动作 | 单一职责 |
|---|---|---|
| `components/psp/pharmaReadingModel.ts` | 新建 | 外部报告类型守卫、四个提要指标选择、安全的事实文字呈现 |
| `components/psp/PharmaProjectOverview.tsx` | 新建 | 项目服务/周期/交付说明、逐版入口、当前汇总人数说明；无请求 |
| `components/psp/PharmaProjects.tsx` | 修改 | 保留列表/详情读取 owner，接入概览组件和轻量入口文案 |
| `components/psp/PharmaReportReading.tsx` | 新建 | 报告首部、提要、下一期安排、七章正文、原文生成记录和核对资料；只读展开状态 |
| `components/psp/PharmaDeliveryChecklist.tsx` | 新建 | 三行只读核对导航，不保存勾选或客户意见 |
| `components/psp/PharmaReport.tsx` | 修改 | 保留读取/命令/意见/冲突 owner，编排展示顺序和客户动作 |
| `tests/unit/helpers/pharmaReadingFixtures.ts` | 新建 | 仅测试使用的完整40项外部报告、项目概览 fixtures |
| `tests/unit/psp-pharma-reading-model.test.ts` | 新建 | 事实呈现与输入缺失/异常的行为测试 |
| `tests/unit/psp-pharma-overview.test.ts` | 新建 | 项目范围、入口、空态与报告相互隔离的组件测试 |
| `tests/unit/psp-pharma-reading-ui.test.ts` | 新建 | 阅读/折叠/原文/核对导航的组件行为测试 |
| `tests/unit/psp-pharma-ui.test.ts` | 修改 | 在原门控/命令集成用例上覆盖新增展示区域 |
| `tests/e2e/helpers/pharmaReading.ts` | 新建 | 显式打开完整报告的浏览器操作，无 API 写入 |
| `tests/e2e/helpers/pspStory.ts` | 修改 | 保留完整真实 UI 主线，适配交付入口文案与正文展开 |
| `tests/e2e/psp-client-experience.spec.ts` | 新建 | 新体验、只读无业务事件、文件不变、键盘/锚点证据 |
| `tests/e2e/psp-delivery.spec.ts` | 修改 | 既有交付/反馈/撤回/503用例覆盖新增区域与正文展开 |
| `tests/e2e/psp-negative.spec.ts` | 修改 | 既有 reset/迟到 GET 隔离覆盖新增区域 |
| `tests/e2e/psp-phase1.spec.ts` | 修改 | 仅为原有概览入口正向用例显式展开完整正文，保留原断言 |
| `tests/e2e/psp-ux.spec.ts` | 修改 | 保留八宽度检查，增加默认阅读层和展开阅读层断言 |
| `tests/e2e/worker-state.spec.ts` | 修改 | 仅适配正文展开，保留真实停启/回执/文件验证 |
| `docs/demo-script.md` | 修改 | 药企端概览—提要—核对—反馈的新讲解顺序 |
| `docs/superpowers/sdd-ledger/2026-10-15-psp-client-experience-report.md` | 实施验收后新建 | 最终差异、命令结果、截图/trace、限制与交接 |
| 本计划 | 实施时更新 | 任务状态与实际证据链接，不预先打勾 |

`lib/psp/pharmaView.ts`、`reportTemplate.ts`、`deliveryTypes.ts`、`lib/client/usePspState.ts`、`components/psp/ReportPreview.tsx`、`ReportTimeline.tsx`、各路由及运行器配置为本批**读取依赖**，不计划修改。特别避免改变院内共用的 `ReportBody` 和全局 `buttonClass` 来完成药企端排版。

## 3. 任务明细

### UX Task 1：建立安全的外部事实展示契约

**Files**

- Create: `components/psp/pharmaReadingModel.ts`
- Create: `tests/unit/helpers/pharmaReadingFixtures.ts`
- Test: `tests/unit/psp-pharma-reading-model.test.ts`
- Read: `lib/psp/pharmaView.ts`、`lib/psp/reportTypes.ts`、`lib/psp/reportTemplate.ts`、`components/psp/ReportPreview.tsx`

**Interfaces**

消费现有 `PharmaReportView`，不扩充接口；对后续组件输出如下契约。下列代码保留计划时的接口约定；实际实现与验证状态见各任务执行记录：

```ts
import type {PharmaReportView} from '@/lib/psp/pharmaView';

export type ReadablePharmaReport = Extract<PharmaReportView, {content: unknown}>;
export type PublicFact = ReadablePharmaReport['content']['chapters'][number]['facts'][number];
export const READING_METRIC_KEYS = [
  'questionnaire_completion', 'contact_completion',
  'education_completion', 'service_completion',
] as const;
export type ReadingMetricKey = typeof READING_METRIC_KEYS[number];
export type ReadingFact = {
  metricKey: string;
  label: string;
  definition: string | null;
  unitLabel: string | null;
  status: PublicFact['status'] | 'unreadable';
  result: string;
};
export function isReadablePharmaReport(report: PharmaReportView): report is ReadablePharmaReport;
export function presentPublicFact(input: unknown, metricKey: string): ReadingFact;
export function buildReadingSummary(content: ReadablePharmaReport['content']): ReadingFact[];
```

`ReadingFact` 不带原始 value/sampleN/numerator/denominator；保护项不会因组件误用这些字段而泄露。`presentPublicFact` 只负责显示，不重算、写账或获取其他来源。`buildReadingSummary` 总是按白名单返回四项，同 key 缺失或重复均显示 unreadable，不用 find 的第一项掩盖重复事实。

测试 fixture 接口固定为：

```ts
publicReportFixture(overrides?: Partial<ReadablePharmaReport>): ReadablePharmaReport;
publicProjectFixture(reports?: PharmaReportView[]): PharmaProjectView;
```

fixtures 仅在测试导入：以现有 `psp-pharma-ui.test.ts` 的项目/窗口/交付字段构造完整报告，根据 `REPORT_FACT_CATALOG` 的 chapter/key/label/unit/definition 生成七章40项；默认各事实 no_applicable，特定测试显式替换目标事实。项目 fixture 的 allowedMembers=14、reports 默认一份交付，参数 `[]` 必须保留为空。不要导入测试文件中的私有常量或用 `as never` 掩盖生产类型错误。

- [x] **1.1 写失败用例：状态与数字边界。** 在新模型单测中按以下示例覆盖 available 的 9/14、真实0、无分子分母的数值/单位，以及 suppressed/unknown/no_applicable 携带哨兵数999仍不泄露。再覆盖缺失、重复key、错误key、空label、未知unit/status、available缺value、非有限数和仅有分子或分母。

```ts
const fact = {
  metricKey: 'contact_completion', label: '到期计划联系成功率',
  definition: '本版独立定义', unit: 'assignments', status: 'available',
  value: 9 / 14, numerator: 9, denominator: 14, sampleN: 14,
};
expect(presentPublicFact(fact, fact.metricKey).result).toContain('9 / 14');
expect(presentPublicFact({...fact, value: 0, numerator: 0}, fact.metricKey).status)
  .toBe('available');
const protectedFact = presentPublicFact({...fact, status: 'suppressed', value: 999,
  numerator: 999, denominator: 999, sampleN: 999}, fact.metricKey);
expect(protectedFact.result).toBe('已保护 · 本项不展示精确结果');
expect(JSON.stringify(protectedFact)).not.toContain('999');
expect(presentPublicFact(undefined, fact.metricKey).status).toBe('unreadable');
```

- [x] **1.2 运行红灯。** `npx vitest run tests/unit/psp-pharma-reading-model.test.ts`；预期因模块尚不存在而失败，后续细分断言必须针对值和状态，不能只测导出存在。
- [x] **1.3 实现守卫和呈现函数。** 守卫沿用 gate=available 且 content存在的现有语义；公共字段类型检查失败返回“暂不能读取本项，请刷新重试。”，不显示输入中未知文本。状态文案使用设计第4.1节原文；非 available 在任何数值格式化之前分支并丢弃数字。available 保留原比例或原值、原样本量，数值格式沿用现有最多两位小数的格式，不生成额外百分比或互补值。单位用固定中文映射；没有分子/分母时显示原值和单位；有比例时在口径资料保留单位。对 available 的可选数字字段检查有限性与样本量整数非负，分子分母必须同时存在或同时缺省，不另加业务达标规则。
- [x] **1.4 实现白名单选择并补充不变性用例。** 四项按固定顺序取自传入 content；不接受 overview/内部 DTO 参数，不缓存。用两个数值不同的报告证明第二份不会沿用第一份；用 `structuredClone` 前后深等证明原 content 不被修改。缺失或重复项均有显式 unreadable 结果；`period_members` 不加入四项列表。
- [x] **1.5 运行绿灯和类型检查。** `npx vitest run tests/unit/psp-pharma-reading-model.test.ts`、`npx tsc --noEmit`，预期全部通过、exit0。
- [x] **1.6 评审并提交本任务。** 检查 diff 没有服务端或模板变化，仅 stage 本任务三个文件；计划 commit（实际提交见执行记录）：`feat(psp): add safe public report reading model`。

**验收标准：** 四种事实状态与 unreadable 不混同；0不是缺失；隐藏数字不进入展示模型；四项只读本版原事实，输入保持不变。该任务本身不改变页面。

### UX Task 2：重排项目概览，建立明确的逐版入口

**Files**

- Create: `components/psp/PharmaProjectOverview.tsx`
- Modify: `components/psp/PharmaProjects.tsx` 的详情分支与报告入口
- Modify: `tests/e2e/helpers/pspStory.ts` 的交付入口选择器和空态文案断言
- Modify: `tests/unit/psp-ui-boundaries.test.ts` 的空态文案断言
- Modify: `tests/e2e/psp-phase1.spec.ts` 的空态文案断言，并补四宽度只读入口验证
- Test: `tests/unit/psp-pharma-overview.test.ts`
- Consume: Task 1 的守卫和 fixtures；现有 `PharmaProjectView`、`Common.formatPspTime`

**Interfaces**

```ts
export function PharmaProjectOverview(
  props: {view: PharmaProjectView}
): React.JSX.Element;
```

无 fetch、无命令、无选中报告缓存。`PharmaProjects` 原读取与错误清空逻辑继续拥有请求；仅在当前 data 为项目详情时传入完整的当前 view。

- [x] **2.1 写失败组件测试。** 使用 `publicProjectFixture([])` 断言设计中的真实空态；使用 delivered/accepted/client_changes_requested 报告分别断言“查看本次交付 · 修订 1”“查看验收记录 · 修订 1”“查看修改请求 · 修订 1”及相同报告ID的 href；blocked/revoked 只出现 reason 和“查看访问状态”，不出现窗口、内容title、签署或digest。用三个报告混排证明顺序不变且不跨版本补值。

```tsx
render(createElement(PharmaProjectOverview, {view: publicProjectFixture([])}));
expect(screen.getByText('本阶段尚无已交付报告。完成双审核并由项目经理交付后可在此查看。'))
  .toBeTruthy();
expect(screen.queryByRole('link', {name: /查看本次交付/})).toBeNull();
expect(screen.getByText(/当前汇总授权人数不等于本版报告的统计分母/)).toBeTruthy();
```

- [x] **2.2 运行红灯。** `npx vitest run tests/unit/psp-pharma-overview.test.ts`，预期缺组件或新文案断言失败。
- [x] **2.3 实现概览顺序。** 名称/合成标识/资助方/人群 → 演示支持的四类服务 → 服务周期、阶段截止与演示联系目标 → 交付构成说明 → 逐版报告 → 当前汇总人数说明及次级院内演示入口。复用现有 project 字段和时间格式，不新增合同、频次、预算或机构。报告卡片不抽取任何指标；blocked项不能以 `'revision' in report` 代替真正的 gate 守卫。
- [x] **2.4 接回原详情分支并覆盖人数三态。** 列表维持原请求和链接，详情使用新组件。available 展示当前人数及非分母说明；suppressed/no_applicable 仅展示各自 reason。测试 fixture 故意让当前人数14、冻结 period_members=12，确认概览不拼接报告数字、报告不覆盖当前人数；测试不出现内部总数/差额。
- [x] **2.5 验证并同步既有主线入口选择器。** 将 `tests/e2e/helpers/pspStory.ts` 的“查看交付报告 · 修订 2”改为本版 delivered 入口新名，保留 report ID/修订/响应捕获全部断言；同时同步该 helper、`tests/unit/psp-ui-boundaries.test.ts` 和 `tests/e2e/psp-phase1.spec.ts` 的旧空态文案断言，保留所有原检查；后一个文件增加四宽度概览/键盘入口与只读无写入验证。这是核对现有测试后必要的兼容范围调整，不扩展业务。运行 `npx vitest run tests/unit/psp-pharma-overview.test.ts tests/unit/psp-pharma-ui.test.ts tests/unit/psp-navigation.test.ts` 和 `npx tsc --noEmit`，预期exit0。
- [x] **2.6 评审并提交。** 确认空态未增加未交付候选、没有报告排序或回退逻辑；stage 本任务六个文件。计划 commit（实际提交见执行记录）：`feat(psp): clarify pharma project scope and delivery entry`。

**验收标准：** 客户从概览可以说清服务、阶段和交付构成；每个报告只按自己的 gate/状态提供入口；当前人数与冻结分母明确区分。

### UX Task 3：实现分层报告阅读，保留完整依据

执行完成：`11ffdd7`。新增分层阅读、稳定的 aria-controls 目标、原 hash 定位及各项独立口径；原命令 owner 与共用正文组件保持不变。定向模型/界面/原报告回归、TypeScript、lint 及 7 项 Next 交付/完整主线回归通过。独立只读评审无待处理问题。最终全量结果见 [本批验收报告](../sdd-ledger/2026-10-15-psp-client-experience-report.md)。

**Files**

- Create: `components/psp/PharmaReportReading.tsx`
- Modify: `components/psp/PharmaReport.tsx` 的展示编排，不变更请求 owner
- Create: `tests/unit/psp-pharma-reading-ui.test.ts`
- Create: `tests/e2e/helpers/pharmaReading.ts`
- Modify: `tests/unit/psp-pharma-ui.test.ts` 中新文案、正文展开和新增区域隔离断言
- Modify: `tests/e2e/helpers/pspStory.ts`、`tests/e2e/psp-delivery.spec.ts`、`tests/e2e/psp-negative.spec.ts`、`tests/e2e/psp-ux.spec.ts`、`tests/e2e/worker-state.spec.ts` 中完整正文的显式展开

**Interfaces**

```ts
type ReadingHeaderProps = {report: ReadablePharmaReport; onRefresh: () => void};
type ReadingEvidenceProps = ReadingHeaderProps & {
  downloadLinks: {text: string; html: string};
};
export function PharmaReportReadingHeader(props: ReadingHeaderProps): React.JSX.Element;
export function PharmaReportEvidence(props: ReadingEvidenceProps): React.JSX.Element;
```

两者消费 Task 1 的当前可读报告和 `presentPublicFact`；不独立 fetch，不保存上一份 report，不拿项目当前人数补事实。`PharmaReport.tsx` 继续构造带原 query 的下载地址。Header 输出当前状态、窗口、提要和安排；Evidence 输出完整正文、公开时间线、下载、生成记录与核对资料。`PublicReportTimeline` 原样复用。

新测试标识：`psp-pharma-reading-summary`、`psp-pharma-next-actions`、`psp-pharma-reading-evidence`、`psp-pharma-delivery-checklist`；后一个由 Task 4 添加。原 `psp-pharma-report-content` 只用于完整正文；原 `psp-report-fact-${metricKey}` 只用于完整指标，避免提要重复同一个 testid。

浏览器 helper 契约：

```ts
export async function openPublicReportBody(page: Page): Promise<void> {
  const section = page.locator('#public-report-body');
  const toggle = section.getByRole('button', {name: /^(展开|收起)完整报告$/});
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await expect(page.getByTestId('psp-pharma-report-content')).toBeVisible();
}
```

采用受控 button + `aria-expanded` + `aria-controls="public-report-body-content"`，按钮文案随状态为“展开完整报告”或“收起完整报告”；不要让 helper 依赖 details 元素在不同浏览器中的隐式角色。该 helper 只读 DOM/点击展开，不做 API setup。

- [x] **3.1 写失败测试：当前状态与阅读事实。** fixture=accepted时，首部显示“客户已验收”，不将模板notice显示为当前状态；四项数据与 helper输出一致；非available哨兵数字不在文本或属性中；0正常显示；缺失项出现重新核对入口。nextActions 分别验证0项、1项、12项及 planned/in_progress，类别/角色使用现有固定映射，时间为上海时间；不生成“已完成”。

```tsx
const report = publicReportFixture({status: 'accepted', nextActions: []});
const refresh = vi.fn();
render(createElement(PharmaReportReadingHeader, {report, onRefresh: refresh}));
expect(screen.getByRole('heading', {name: /客户已验收/})).toBeTruthy();
expect(screen.getByTestId('psp-pharma-next-actions').textContent)
  .toContain('本版未列下一期服务安排');
expect(screen.queryByText('模板草稿，待人工审核')).toBeNull();
```

- [x] **3.2 运行红灯。** `npx vitest run tests/unit/psp-pharma-reading-ui.test.ts`，预期组件/新行为不存在导致失败。
- [x] **3.3 实现首部与提要。** 首部为状态、修订、periodStart至cutoff、交付时间和“上海时间”；完整 periodEnd及“结束边界不含”在完整数据说明保留。四项使用原fact标签/结果，逐项口径可展开。可选的冻结成员说明只能取本版 `period_members`；本批选择不在提要增加这第五项，完整指标仍保留。提要默认展开，下期安排紧随其后；不以整段hash或演示切换占据首屏。
- [x] **3.4 实现完整依据区。** 七章原顺序、原段落和40项事实全部保留，完整正文总开关默认收起；打开后七章初始展开，每章有独立的展开按钮和aria状态，允许按业务章节收起。指标使用同一安全呈现函数。每项“查看口径”显示自己的原始 definition；本批先不跨指标合并定义，避免丢失特有说明。将 `content.notice` 放入独立默认收起的“原文生成记录”，标明“以下是生成时原始文字，当前状态以本页交付记录为准”；不要改正文对象或下载字节。原文下一期说明仍在其原章节中可找到，并标明这是固定正文中的生成时说明。
- [x] **3.5 实现公开时间线、下载和核对资料。** 时间线沿用原组件及仅公开角色；固定文本/HTML链接使用传入地址不改query；完整hash更名为“内容校验码”“文件校验码”，连同模板/算法/保护版本收进“核对资料”。下载与技术资料均为次级操作。不可读时整个组件不挂载，不渲染scope/安排/签署/hash/旧下载。
- [x] **3.6 实现锚点与键盘行为。** `public-report-body` 位于完整正文可展开容器，`public-report-timeline` 对应时间线，`public-report-feedback` 仍由父组件拥有；新增 `public-report-next-actions`。局部只读 effect 处理初始hash与hashchange/popstate，命中body时打开正文、定位并聚焦目标标题（`tabIndex=-1`），不在轮询时反复抢焦点；页内导航点击同一hash也可重新展开。收起项不留可Tab进入的隐藏子元素；标题级别连续、焦点环可见。组件测试通过模拟hashchange与点击验证展开，真实前进/后退交给 Task 5。
- [x] **3.7 接入原门控后的展示分支。** Header置于前部，客户反馈区域暂保持原逻辑，Evidence置于其后；`DeliveredContent` 的 state/comment/ack、原key、父子 `onInvalidation`、early returns均保留。不得因展开/收起、状态文案、反馈锁定或显示feedback而重建操作owner。原“刷新当前报告内容”“刷新交付报告”职责和名称保留。
- [x] **3.8 适配既有测试而不削弱断言。** 新建 helper；列出的原 E2E 在需要检查完整正文之前显式调用 `openPublicReportBody`，同时先断言提要默认可见。保留所有内部ID排除、下载内容、双签、回执、重启、宽度和时间线断言；撤回后的 `toHaveCount(0)` 断言不改成“折叠不可见”。原单测需要使用展开按钮并按新四态文案断言，不能删除保护测试。
- [x] **3.9 运行绿灯及定向浏览器回归。** `npx vitest run tests/unit/psp-pharma-reading-model.test.ts tests/unit/psp-pharma-reading-ui.test.ts tests/unit/psp-pharma-ui.test.ts tests/unit/psp-report-ui.test.ts`；`npx tsc --noEmit`；`npx playwright test tests/e2e/psp-story.spec.ts tests/e2e/psp-delivery.spec.ts`。预期全部通过，院内正文行为不变。
- [x] **3.10 评审并提交。** 审核40项/定义仍可到达、原锚点有效、没有改服务端或共用ReportBody。计划 commit（实际提交见执行记录）：`feat(psp): layer public report reading and evidence`。

**验收标准：** 当前状态清楚；业务提要与安排在前，完整依据按需展开；历史notice可找但不冒充当前状态；同一报告固定内容和命令 owner 保持不变。

### UX Task 4：前置交付核对提示，明确验收与修改状态

执行完成：`250d56a`。三行只读导航与状态化客户动作已接入同一请求 owner。定向 73 项单测、6 项 Next 交付回归、TypeScript 和 lint 通过。独立评审发现测试清理中的 window 名称遮蔽，已改用 globalThis.window 并重验；无生产代码待处理问题。

**Files**

- Create: `components/psp/PharmaDeliveryChecklist.tsx`
- Modify: `components/psp/PharmaReport.tsx` 的反馈区位置、文案、主次动作
- Test: `tests/unit/psp-pharma-reading-ui.test.ts`
- Test: `tests/unit/psp-pharma-ui.test.ts`

**Interfaces**

```ts
export function PharmaDeliveryChecklist(): React.JSX.Element;
```

组件不消费客户表单或命令，只输出三行导航：范围与阶段→`#public-report-body`；本版签署与固定文件→`#public-report-timeline`（同区有明确下载入口）；服务记录限制及下一期安排→`#public-report-next-actions`（提要保留四态解释）。核对提示不得呈现已读/已完成图标、勾选或计数。客户反馈命令仍由 `DeliveredContent` 原 command闭包调用，无新命令接口。

- [x] **4.1 写失败用例：只读核对与三种业务状态。** 核对提示恰有三个有意义链接、0个checkbox，点击不POST。delivered 主导航“核对本次交付”到feedback，feedback内保留唯一主要提交“验收此版本”；请求修改为次级。accepted 主导航“查看验收记录”，client_changes_requested 主导航“查看修改请求”；后两者不可再执行验收/修改。blocked/读失败不出现核对提示或操作。

```tsx
render(createElement(PharmaDeliveryChecklist));
expect(screen.getAllByRole('link')).toHaveLength(3);
expect(screen.queryByRole('checkbox')).toBeNull();
expect(screen.getByRole('link', {name: '范围与阶段'}).getAttribute('href'))
  .toBe('#public-report-body');
```

- [x] **4.2 运行红灯。** `npx vitest run tests/unit/psp-pharma-reading-ui.test.ts tests/unit/psp-pharma-ui.test.ts`，预期新提示/状态文案断言失败。
- [x] **4.3 在提要与安排之后接入核对/反馈区。** 保留父组件原textarea、comment/ack状态、Feedback、fieldset禁用、精确重试与409人工确认按钮。只能移动原节点和调整主次样式，不把表单搬到会按状态切换key的新owner。验收前使用“验收确认本次交付范围；意见单独记录，固定交付内容保持原版本。”；验收后使用“本版本已验收。下期安排继续按实际进度执行，验收不代表安排已完成。”；请求修改后沿用设计的等待新修订文案。签署/验收意见显示原公开DTO内容与时间。
- [x] **4.4 补强原命令集成测试。** 空意见可验收；空白理由不能修改；503后原输入禁用、原POST字符串逐字相等、展开/收起不会丢失pending请求；409首次刷新未完成时不能ack，完成后须人工确认，下一次409仍需重新确认。新增区域必须跟随撤回、详情读失败、父读失败、reset、换项目/报告一起清空，不能只有旧正文消失。重用原fetch/deferred测试，不模拟命令已成功而绕过真实回执处理。
- [x] **4.5 运行绿灯与客户动作回归。** `npx vitest run tests/unit/psp-pharma-reading-ui.test.ts tests/unit/psp-pharma-ui.test.ts tests/unit/psp-ui-hook.test.ts tests/unit/psp-client.test.ts tests/unit/psp-ui-boundaries.test.ts`；`npx playwright test tests/e2e/psp-delivery.spec.ts`；`npx tsc --noEmit`。预期exit0，原请求身份/版本/query不变。
- [x] **4.6 评审并提交。** diff中不应出现新持久化记录、必填验收意见或请求owner迁移。计划 commit（实际提交见执行记录）：`feat(psp): clarify delivery checks and customer acceptance`。

**验收标准：** 客户知道核对什么、从哪里核对、当前能做什么；保存的是原有验收/修改命令，提示不冒充新增审阅证据。

### UX Task 5：建立可复验的浏览器体验与保护回归证据

执行完成：`e5282c4`。定向 Next 18 项通过，Worker 真实停启用例 1 项通过；新增组件全组不可评价状态单测通过，TypeScript/lint 通过。独立评审要求的真实 Tab、展开属性、键盘全程 0 POST 和窗口三日期 exact 比对已补齐。还适配了 Worker 原摘要断言：先展开“核对资料”，再执行原断言，保留所有持久化/回执/字节核验。两次中断运行和最终环境记录在 [验收报告](../sdd-ledger/2026-10-15-psp-client-experience-report.md)，不以中断轮冒充通过。

**Files**

- Create: `tests/e2e/psp-client-experience.spec.ts`
- Modify: `tests/e2e/psp-delivery.spec.ts`、`tests/e2e/psp-negative.spec.ts`、`tests/e2e/psp-ux.spec.ts`
- Consume: `AcceptanceApi`、`connectedStory(page, request)`、`openPublicReportBody(page)` 和现有运行器

**Interfaces**

复用 `AcceptanceApi.reset()/delivered()/external(report)/internal()/state()` 建立受控测试状态；真实患者到验收流程仍由 `connectedStory` 驱动 UI，不把 API fixture冒充全链路演示。测试通过现有fixture和前端交互提供证据，不增加测试专用产品API。

新增用例按以下六组分开，以便明确失败责任：

| 组 | 准备与操作 | 必须断言 |
|---|---|---|
| A 范围与空态 | reset；概览；再仅生成草稿/双签但不交付 | 空态真实，无可读交付入口；服务范围/交付构成存在；未交付候选不出现 |
| B 阅读与可达性 | 创建实际交付；读取外部DTO；展开正文/口径/原文资料 | 提要四项与当前DTO逐项对应；七章40个唯一metricKey与各definition全部可找；完整窗口/结束边界可核对 |
| C 原文与文件稳定 | 在同一测试中捕获交付后、只读浏览后、客户反馈后的内容与两种下载 | content/contentDigest/artifact.text/artifact.digest逐一不变；固定文本和HTML前后Buffer完全相等；历史notice仍在原文与文件中 |
| D 读操作无业务写入 | 取报告列表ledger与本版workflow.history/timeline基线；只浏览/刷新/折叠/下载；再读取基线 | 0个业务POST；ledgerRevision及本版历史不变；后续验收POST单独验证真实版本回执，不混进只读区间 |
| E gate与异步隔离 | 继承现有撤回、旧GET延迟、503、409、reset与换scope用例 | 新提要/安排/核对/全文/签署/hash/下载一起失效；迟到旧响应实际消费后仍不能回显 |
| F 布局、键盘与hash | 指定视口、Tab/Enter展开、点击锚点、直达hash、前进后退 | 无横向溢出、可见焦点和状态文字；默认阅读层与展开层分别可用；原锚点全部有效 |

- [x] **5.1 新增 A/B 行为测试并运行。** 用例名前缀分别为 `scope:`、`reading:`，执行 `npx playwright test tests/e2e/psp-client-experience.spec.ts --grep 'scope:|reading:'`。每个用例独立reset隔离测试后端，预期实际服务端投影与页面相符。正文内容以该次 external DTO比对，不把9/14等值写成任意测试报告的常量；完整真实主线中的特定演示报告可记录实际9/14、9/14、18/28。
- [x] **5.2 新增 C/D 固定文件与只读测试。** 文本下载既与原artifact.text逐字比较又核验SHA-256；HTML前后直接比Buffer，不将HTML的hash误当文本artifact.digest。accept与request_changes使用两份独立交付/测试，比较各自反馈前后的原件。用现有 `api.reports()` 的ledgerRevision和 `api.detail(report)` 的workflow.history/timeline作只读基线；`api.internal()` 没有ledgerRevision，`/api/state` 不返回psp，不能引用不存在的字段或为此新增接口。所有原事务推进账版本，因此账版本不变与本版历史不变、0业务POST共同验证只读区间；客户动作回执另由现有集成测试核对。

```ts
const before = await api.external(report);
if (!('artifact' in before)) throw new Error('Expected readable delivery');
const ledgerBefore = (await api.reports()).ledgerRevision;
const detailBefore = await api.detail(report);
await page.goto(`/pharma/projects/${PROJECT}/reports/${encodeURIComponent(report.id)}`);
await openPublicReportBody(page);
const after = await api.external(report);
if (!('artifact' in after)) throw new Error('Expected readable delivery');
expect(after.content).toEqual(before.content);
expect(after.contentDigest).toBe(before.contentDigest);
expect(after.artifact).toEqual(before.artifact);
expect((await api.reports()).ledgerRevision).toBe(ledgerBefore);
const detailAfter = await api.detail(report);
expect(detailAfter.workflow.history).toEqual(detailBefore.workflow.history);
expect(detailAfter.timeline).toEqual(detailBefore.timeline);
```

- [x] **5.3 扩展 E 的负向证据。** 原 `psp-negative.spec.ts` 已有 `Response.finished()`、浏览器 requestfinished/JSON消费确认及双requestAnimationFrame；保留这套同步条件，再断言所有新增testid为0、原正文为0且旧下载链接不存在。不能用固定sleep或仅等网络响应头代替消费。详情读失败、父读失败、换scope、四态全部不可评价、多报告一版被阻止等确定性组合优先在单测覆盖；浏览器保留真实撤回/reset/旧GET和503/409关键路径。门控改变必须来自原服务端状态或原有故障拦截机制。
- [x] **5.4 增加 F 的首屏和响应式断言。** 1280×720与1440×900初始scrollY=0：当前状态、阶段和阅读提要标题/首项位于视口内，全文/hash默认收起；不要求所有业务内容同时放进屏高。390px检查同一DOM优先顺序、单列和可用控件；755/1440/1920px检查默认与展开状态 `scrollWidth <= clientWidth`，长意见和64位校验码也不撑宽。保留现有390/640/755/800/1024/1280/1440/1920八宽度回归。
- [x] **5.5 验证键盘和真实导航。** Tab至展开按钮、Enter展开、再次Enter收起，aria-expanded/controls匹配；各“查看口径”内容可达。分别 `page.goto(reportPath + '#public-report-body')` 和点击同hash重新展开；通过真实hash历史前进/后退核对body/timeline/feedback焦点与可见性。用Playwright可访问角色/属性断言，不新增可访问性库；键盘动作不产生业务POST。
- [x] **5.6 保存可评审证据。** 至少留1280×720初始阅读、1440×900初始阅读、390/755/1440/1920默认与展开、验收后、撤回并消费旧响应后的截图和trace；截图用 `testInfo.outputPath()`，不提交生成目录。截图人工检查段落行宽、主次动作、换行、焦点和实际遮挡，不能只凭滚动宽度断言宣称体验通过。每组实际结果关联测试名称与运行时。
- [x] **5.7 运行定向浏览器集。** `npx playwright test tests/e2e/psp-client-experience.spec.ts tests/e2e/psp-delivery.spec.ts tests/e2e/psp-negative.spec.ts tests/e2e/psp-ux.spec.ts`。先修失败；所有原有保护断言保留，预期exit0。
- [x] **5.8 评审并提交。** 确认新增测试观察业务结果、真实DOM和字节，而非仅比较新组件实现细节。计划 commit（实际提交见执行记录）：`test(psp): cover client reading and acceptance boundaries`。

**验收标准：** 新阅读层有独立证据；固定内容/文件未改；只读不写业务事件；隐藏后的旧内容不会因响应晚到重新显示；用户能用键盘与窄窗口完成核对。

### UX Task 6：完成双运行时验收和演示交接

2026-10-16 执行记录：最终应用/测试为 `e5282c4`；102 文件/1032 单测、lint、TypeScript、Next 完整 64 通过+1 项既有 Worker 专属跳过、安全 Worker 构建、dry-run、Worker 完整 65 通过，均 exit0。保留真实停启和原回执/文件重验，两个运行时的 S1–S11 冻结结果一致。演示脚本、内部阅读走查、全部14项覆盖和休眠/原生运行时中断记录见 [验收报告](../sdd-ledger/2026-10-15-psp-client-experience-report.md)。最终代码与文档独立复核通过，无待修问题；本任务仅提交交接文档，不改业务、阈值或运行器。

**Files**

- Modify: `docs/demo-script.md` 的药企阶段讲解与入口
- Create: `docs/superpowers/sdd-ledger/2026-10-15-psp-client-experience-report.md`
- Modify: 本计划的执行状态与验收链接
- Test: 全量单测、Next E2E、本地 Worker E2E；不新增生产接口

**Interfaces**

消费 Task 1–5 的最终代码、现有 `playwright.config.ts`、`playwright.worker.config.ts`、`scripts/e2e-runtime.mjs` 和安全构建脚本。产出可按文件/测试名复核的验收报告与更新后的演示脚本，不产出新业务状态或外部发布。

- [x] **6.1 运行最终静态与单元门禁。** 顺序执行 `npm test`、`npm run lint`、`npx tsc --noEmit`；记录最终代码对应的用例数、失败/跳过、exit。Task 12历史925项仅作基线信息，不能拿旧结果宣称本批已通过。若单纯文档修改发生在门禁后，无须无理由重复全部测试。
- [x] **6.2 运行完整 Next E2E。** `npm run e2e`；使用独立3112和固定时钟，保留完整S1–S11患者问卷—联系—医生—教育—冻结—退回修订—新双签—交付—客户验收，以及其他既有回归。只允许配置中已有的Worker专属用例在Next跳过，不新增skip/retry掩盖失败。
- [x] **6.3 构建并本地检查 Worker。** `npm run build:worker` 后执行 `npx wrangler deploy --dry-run --outdir /tmp/med-psp-client-experience-worker-dry-run`；预期exit0且无真实部署。安全构建保持源环境文件不变、不捆绑密钥；只记录必要诊断，不打印密钥或整份环境。
- [x] **6.4 运行完整本地 Worker E2E。** `npx playwright test --config playwright.worker.config.ts`；预期exit0，保留现有真实Worker停启、原回执回放和固定文件核验。不为本批UI重排再次另建持久化故障矩阵；若实际改动超出本计划涉及存储/事务，再单独补其必要验证并说明范围变化。
- [x] **6.5 更新演示脚本。** 原医患主线保留；药企段改为：项目服务/阶段/交付说明 → 本次交付 → 状态与四项提要及保护解释 → 本版下一期安排 → 三项核对导航 → 查看完整口径与签署/下载 → 验收或带理由请求修改 → 当前反馈记录。明确“已验收”不代表下期安排完成；不把当前授权人数与冻结分母混讲。
- [x] **6.6 做一次非开发者阅读检查。** 用干净的隔离测试场景，从概览开始，读者能回答“演示提供什么服务、截止到何时、哪些结果可评价/不可评价、本版有哪些安排、如何核对并反馈”。若没有真实客户参与，报告注明为内部走查，不声称已完成药企用户测试；未拿到真实SOW不补造交付承诺。
- [x] **6.7 填写验收报告并自审。** 记录基线/最终代码、实际修改文件、设计14项对应证据、完整命令与退出状态、截图/trace路径、两种文件字节比较、无业务写入结果、未覆盖或失败项及原因。最终判定只有“通过/未通过”；未执行的项目明确写未执行，不能引用历史通过代替。确认没有改用户3000端口的演示进度或提交运行时数据。
- [x] **6.8 评审并提交交接文档。** `git diff --check`；只stage本任务文档，保留无关用户文件，不使用 `git add .`。计划 commit（实际提交见执行记录）：`docs(psp): record client experience acceptance and walkthrough`。Task 1–5代码若因验收修复而变化，重跑受影响门禁，并把最终证据对应到修复后的代码。

**验收标准：** 最终代码在Next/Worker均有本轮证据；完整主线通过；新演示脚本与页面一致；未执行/待确认事项明确，后续session可从报告继续。

## 4. 设计验收条款覆盖表

编号沿用设计草案第8节。这里是计划覆盖映射，**不是已通过的测试结果**。

| 设计条款 | 实施任务 | 验证方式与通过条件 |
|---|---|---|
| 1 服务范围、阶段、交付、下一步及人数含义 | 2、6 | 概览组件测试 + 内部阅读检查；能复述五项且不混分母 |
| 2 空态与未交付候选隔离 | 2、5A | 无报告组件测试；真实草稿/approved不出现在交付列表 |
| 3 桌面首屏顺序与窄窗优先级 | 3、5F | 1280×720、1440×900位置断言/截图；390同顺序 |
| 4 示例保护与实际9/14、9/14、18/28 | 1、3、5B、6 | 当前DTO逐项比对；完整固定主线记录实际值，不硬编码组件 |
| 5 四态、隐藏值与缺失项 | 1、3 | 模型/组件哨兵测试；无额外数字、达标色彩、互补推断 |
| 6 40项、独立定义、完整统计窗 | 3、5B | 40唯一key与每项原definition比对，结束边界不含可找到 |
| 7 当前状态与生成notice分离 | 3、5B | accepted首部无草稿主状态；原文生成记录展开可读 |
| 8 内容/文件不变，阅读不写事件 | 1、5C/D | 输入不变；同一报告两格式Buffer前后相等，账版本/本版历史不变且0业务POST |
| 9 只读提示不冒充审阅记录 | 4、5D | 0 checkbox/0新增写入；实际客户POST与回执独立核对 |
| 10 意见可选、理由必填及状态动作 | 4、5C/E | delivered/accepted/修改请求三态；空意见成功、空理由阻止 |
| 11 503/409/reset/旧响应隔离 | 3、4、5E | 原POST字节相等、人工ack、迟到响应消费后仍隐藏 |
| 12 blocked/revoked新增区域不回显 | 2、3、4、5E | 新旧受控区域均不存在，旧下载不可点击，不用旧版补齐 |
| 13 响应式、键盘及原锚点 | 3、5F | 默认/展开各宽度；键盘、直达hash和前进后退均可到达 |
| 14 完整医患至客户验收主线 | 5、6 | 现有connectedStory与全量Next/Worker实际通过 |

## 5. 评审与恢复约定

每任务均在已获用户实施授权且相应验证通过后提交。独立评审关注三件事：是否超出本批范围、是否绕开现有保护与命令隔离、是否减少原有可核对证据。需要回退时以任务提交为单位回退展示变化；不修改已经交付/验收的报告记录来适配界面。

制定计划时的自审已逐项对照设计第1–9节：两页面三个区域、三种客户业务状态及两种不可读gate、四态事实与缺失、全部指标/原文、固定文件、三行导航、原请求/授权隔离、布局与锚点、后续批次边界均有任务与验收位置。制定计划本身未执行实现、测试、重置、部署或commit；后续实际实施状态见各任务勾选及上方执行记录。
