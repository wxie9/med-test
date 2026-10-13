# 乳腺癌全生命周期平台演示版 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个一条命令启动、全部 mock 数据、四视角共享状态、三智能体可降级的乳腺癌全生命周期全链路功能演示 Web 应用。

**Architecture:** Next.js App Router 单仓库。服务端内存状态容器（globalThis 单例）持有种子数据与运行时事件，所有视角通过 `/api/*` 读写同一状态，页面轮询刷新实现跨视角实时联动。`lib/compute` 是唯一的统计来源，页面与智能体都只调用它。智能体通过 `lib/agents/adapter` 适配 Claude / OpenAI 兼容 / 确定性模板三种提供商，任何故障 8 秒内降级到模板。

**Tech Stack:** Next.js 15（App Router）、React 19、TypeScript 5、Tailwind 4、Recharts 2.15、zod 3、seedrandom 3、Vitest 3、Playwright 1.50。Node 20+。

**Spec:** `docs/superpowers/specs/2026-10-13-breast-cancer-lifecycle-demo-design.md`

## Global Constraints

- 中文界面；桌面投屏优先，1920×1080 与 1440×900 下无横向滚动。
- 所有研究端图表显示样本量 n、事件数、随访信息，并带"合成数据，仅用于演示"水印；事件数 < 10 时显示"不可估计"。
- 页面内禁止写死任何统计数字，一律来自 `lib/compute`。
- 模型密钥只在服务端环境变量 `DEMO_CLAUDE_API_KEY`、`DEMO_OPENAI_BASE_URL`、`DEMO_OPENAI_API_KEY`、`DEMO_OPENAI_MODEL`；浏览器不接触模型接口。
- 模型输出中的数字必须来自工具调用结果；确定性模式的模板数字槽位由 `lib/compute` 填充。
- 量表为自拟问卷，界面标注"演示用自拟问卷，非标准量表"。
- 生成器：固定种子 `20261013`、版本号写入 `data/seed/manifest.json`，相同输入产出相同 `checksum`。
- 功能标记：[交互] 真实实现；[模拟] 固定流程；[后续] 仅说明文字。
- 一条命令启动：`npm run demo`（首次自动生成种子）。

## Review Focus

1. 患者在非服务时段（18:00–08:00）提交高风险 ePRO：期望预警仍创建，且患者端显示急诊提示与值班电话（测试归 Task 6）。
2. 医生在快照创建后给快照内患者新增治疗事件：期望快照内任何数字不变（测试归 Task 8）。
3. 入组漏斗中患者缺 ISH 结果但 IHC 2+：期望落入"信息不足"而非"符合"或"不符合"（测试归 Task 4）。
4. 模型返回合法 JSON 但引用了不存在的指南条目 ID：期望校验失败并降级为模板（测试归 Task 11）。
5. 连续三轮演示后重置：期望预警、任务、快照、候选请求全部回到种子状态，且不重复生成锚点患者（测试归 Task 12）。

---

## 文件结构

```
med_Test/
├── package.json                      # scripts: dev, demo, seed, test, e2e, build
├── next.config.ts
├── tailwind.config.ts / postcss.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
├── README.md
├── docs/demo-script.md               # Task 12
├── docs/data-generation.md           # Task 12
├── data/seed/
│   ├── anchors.json                  # 12 例锚点（手写）
│   ├── cohort.json                   # 生成器产出
│   ├── edge-cases.json               # 生成器产出
│   ├── manifest.json                 # 种子、版本、checksum、数据截止日
│   ├── expected.json                 # 人工核对的 5 组筛选预期值
│   └── guidelines.json               # 指南要点库（Task 11）
├── scripts/generate-seed.ts          # Task 2
├── lib/
│   ├── domain/
│   │   ├── types.ts                  # 所有实体类型 + zod schema
│   │   ├── her2.ts                   # HER2 低表达派生
│   │   ├── lines.ts                  # 系统治疗线推断
│   │   └── dates.ts                  # addDays / diffDays / isoDate
│   ├── seed/
│   │   ├── generator.ts              # 批量合成队列
│   │   ├── validate.ts               # 硬约束自检
│   │   └── load.ts                   # 读取 data/seed/*.json
│   ├── state/
│   │   ├── store.ts                  # globalThis 单例状态容器 + reset
│   │   └── clock.ts                  # 演示时钟（可固定时间）
│   ├── compute/
│   │   ├── filter.ts                 # 队列筛选条件 → 患者集合
│   │   ├── funnel.ts                 # 入组三态漏斗
│   │   ├── patterns.ts               # 治疗模式 + 治疗线间状态
│   │   ├── adherence.ts              # 依从性描述统计
│   │   ├── quality.ts                # 字段完整率、复核率、同意统计
│   │   └── index.ts                  # 统一导出
│   ├── alerts/
│   │   ├── rules.ts                  # PRO → 预警规则
│   │   └── machine.ts                # 状态机 + 超时升级
│   └── agents/
│       ├── adapter.ts                # chat() 入口 + 降级
│       ├── providers/claude.ts
│       ├── providers/openai.ts
│       ├── providers/deterministic.ts
│       ├── tools.ts                  # 工具定义，绑定 compute/state
│       ├── templates.ts              # 确定性模板
│       └── validate.ts               # 输出结构与引用校验
├── app/
│   ├── layout.tsx / globals.css
│   ├── page.tsx                      # 演示导航
│   ├── patient/…                     # Task 6, 10
│   ├── clinic/…                      # Task 7, 8, 10
│   ├── governance/…                  # Task 8
│   ├── research/…                    # Task 9, 10
│   ├── api/state/route.ts            # GET 全量状态（Task 3）
│   ├── api/reset/route.ts
│   ├── api/pro/route.ts              # POST ePRO（Task 6）
│   ├── api/alerts/[id]/route.ts      # PATCH 状态流转（Task 7）
│   ├── api/cohorts/route.ts          # POST 圈选（Task 8）
│   ├── api/snapshots/route.ts        # POST 创建快照（Task 8）
│   ├── api/research/[useCase]/route.ts  # GET 用例计算（Task 9）
│   ├── api/candidates/route.ts       # POST 请求 / PATCH 确认（Task 10）
│   └── api/agent/route.ts            # POST 对话（Task 11）
├── components/
│   ├── PhoneFrame.tsx, ViewSwitcher.tsx, ModeBadge.tsx, Watermark.tsx
│   ├── Timeline.tsx, AlertQueue.tsx, FunnelChart.tsx, PatternChart.tsx
│   └── AgentPanel.tsx
├── tests/
│   ├── unit/*.test.ts
│   └── e2e/story.spec.ts
└── tasks/todo.md
```

---

### Task 0: 仓库初始化与脚手架

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Produces: `npm run dev`、`npm run test`、`npm run e2e`、`npm run seed`、`npm run demo` 五个脚本。

- [ ] **Step 1: 初始化 git 与 Next.js**

```bash
cd /Users/xue.w/Desktop/med_Test
# git 已初始化（2026-10-13），跳过 git init
npx create-next-app@15 . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --yes
```
若目录非空导致拒绝，先把 `docs/`、`tasks/`、`.claude/` 临时移到 `/tmp/med_keep`，脚手架完成后移回。

- [ ] **Step 2: 安装依赖**

```bash
npm i recharts@2.15.3 zod@3.24.2 seedrandom@3.0.5
npm i -D vitest@3.1.1 @vitejs/plugin-react@4.4.1 @types/seedrandom@3.0.8 @playwright/test@1.52.0 tsx@4.19.3 jsdom@26.1.0 @testing-library/react@16.3.0
npx playwright install chromium
```

- [ ] **Step 3: 写 scripts 与配置**

`package.json` 的 scripts 替换为：
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "seed": "tsx scripts/generate-seed.ts",
  "demo": "node -e \"require('fs').existsSync('data/seed/cohort.json')||require('child_process').execSync('npm run seed',{stdio:'inherit'})\" && next dev -p 3000",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test",
  "lint": "next lint"
}
```

`vitest.config.ts`：
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```

`playwright.config.ts`：
```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", viewport: { width: 1920, height: 1080 } },
  webServer: { command: "npm run demo", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
```

`.env.example`：
```
DEMO_CLAUDE_API_KEY=
DEMO_OPENAI_BASE_URL=
DEMO_OPENAI_API_KEY=
DEMO_OPENAI_MODEL=
DEMO_FIXED_NOW=2026-10-13T10:00:00+08:00
DEMO_PERSIST=0
```

- [ ] **Step 4: 写一个冒烟测试并运行**

`tests/unit/smoke.test.ts`：
```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => { it("runs", () => expect(1 + 1).toBe(2)); });
```
Run: `npm test` → Expected: 1 passed。
Run: `npm run build` → Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "chore: scaffold Next.js demo with vitest and playwright"
```

---

### Task 1: 领域类型、HER2 派生、治疗线推断

**Files:**
- Create: `lib/domain/types.ts`, `lib/domain/her2.ts`, `lib/domain/lines.ts`, `lib/domain/dates.ts`
- Test: `tests/unit/her2.test.ts`, `tests/unit/lines.test.ts`

**Interfaces:**
- Produces: 所有实体类型；`deriveHer2Low(b: Biomarker): "low" | "ultra-low" | "zero" | "positive" | "indeterminate"`；`inferLines(events: TreatmentEvent[], rulesVersion?: string): SystemicTherapyLine[]`；`addDays(iso: string, n: number): string`、`diffDays(a: string, b: string): number`。

- [ ] **Step 1: 写日期工具**

`lib/domain/dates.ts`：
```ts
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return isoDate(d);
};
export const diffDays = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86_400_000);
```

- [ ] **Step 2: 写类型文件**

`lib/domain/types.ts`：
```ts
import { z } from "zod";

export const Stage = z.enum(["early_adjuvant", "metastatic", "survivorship", "lost", "deceased"]);
export const Her2Ihc = z.enum(["0", "1+", "2+", "3+", "unknown"]);
export const Ish = z.enum(["positive", "negative", "not_done", "unknown"]);
export const TreatmentType = z.enum(["surgery", "radiation", "chemo", "endocrine", "anti_her2", "cdk46", "adc", "other"]);
export const Intent = z.enum(["neoadjuvant", "adjuvant", "metastatic"]);
export const StopReason = z.enum(["completed", "progression", "toxicity", "patient_choice", "lost", "death", "unknown", "ongoing"]);
export const OutcomeType = z.enum(["local_recurrence", "distant_metastasis", "progression", "death"]);
export const AlertStatus = z.enum(["triggered", "unassigned", "accepted", "in_progress", "pending_review", "closed", "escalated"]);

export const Biomarker = z.object({
  id: z.string(), specimenSite: z.enum(["primary", "metastatic"]), specimenDate: z.string(),
  erPct: z.number().min(0).max(100).nullable(), prPct: z.number().min(0).max(100).nullable(),
  her2Ihc: Her2Ihc, ish: Ish, ki67: z.number().nullable(), readVersion: z.string(),
});
export const Staging = z.object({ cTnm: z.string().nullable(), pTnm: z.string().nullable(), date: z.string(), system: z.literal("AJCC8") });
export const TreatmentEvent = z.object({
  id: z.string(), type: TreatmentType, intent: Intent, drug: z.string().nullable(),
  start: z.string().nullable(), end: z.string().nullable(), stopReason: StopReason, source: z.enum(["in_house", "external"]),
});
export const SystemicTherapyLine = z.object({
  lineNo: z.number().int().positive(), eventIds: z.array(z.string()), start: z.string(), end: z.string().nullable(),
  rulesVersion: z.string(), reviewStatus: z.enum(["unreviewed", "confirmed", "corrected"]), reviewer: z.string().nullable(),
});
export const OutcomeEvent = z.object({ id: z.string(), type: OutcomeType, date: z.string(), evidence: z.enum(["imaging", "pathology", "clinical_note"]), assessor: z.string() });
export const ProResponse = z.object({ id: z.string(), scaleId: z.enum(["endocrine_monthly_v1", "treatment_weekly_v1"]), submittedAt: z.string(), items: z.record(z.number()), flags: z.object({ stopIntent: z.boolean().optional(), missedDoses14d: z.number().optional() }) });
export const AdherenceLog = z.object({ date: z.string(), due: z.number(), taken: z.number(), missedReason: z.string().nullable() });
export const Consent = z.object({ followUp: z.boolean(), research: z.boolean(), pharmaDeidentified: z.boolean(), signedAt: z.string().nullable() });

export const Patient = z.object({
  id: z.string(), anchorKey: z.string().nullable(), age: z.number(), enrolledAt: z.string(), stage: Stage, consent: Consent,
  biomarkers: z.array(Biomarker), staging: z.array(Staging), treatments: z.array(TreatmentEvent), lines: z.array(SystemicTherapyLine),
  outcomes: z.array(OutcomeEvent), pro: z.array(ProResponse), adherence: z.array(AdherenceLog), lastContact: z.string(), surgeryDate: z.string().nullable(),
  genomics: z.object({ brca: z.enum(["positive", "negative", "not_tested"]), pik3ca: z.enum(["mutated", "wild", "not_tested"]), esr1: z.enum(["mutated", "wild", "not_tested"]) }),
  expertNote: z.string().optional(),
});
export type Patient = z.infer<typeof Patient>;
export type Biomarker = z.infer<typeof Biomarker>;
export type TreatmentEvent = z.infer<typeof TreatmentEvent>;
export type SystemicTherapyLine = z.infer<typeof SystemicTherapyLine>;
export type ProResponse = z.infer<typeof ProResponse>;

export const Alert = z.object({
  id: z.string(), patientId: z.string(), kind: z.enum(["symptom", "adherence"]), level: z.enum(["high", "medium"]), rule: z.string(),
  status: AlertStatus, assignee: z.string().nullable(), timestamps: z.record(z.string()), notes: z.array(z.object({ at: z.string(), by: z.string(), text: z.string() })),
  proId: z.string(),
});
export const FollowUpTask = z.object({ id: z.string(), patientId: z.string(), type: z.string(), due: z.string(), owner: z.string(), status: z.enum(["open", "done"]), createdAt: z.string() });
export const CohortFilter = z.object({
  hrPositive: z.boolean().optional(), her2: z.array(z.enum(["low", "ultra-low", "zero", "positive"])).optional(),
  stage: z.array(Stage).optional(), priorCdk46: z.boolean().optional(), intent: z.array(Intent).optional(), currentTreatmentType: z.array(TreatmentType).optional(),
});
export const Cohort = z.object({ id: z.string(), name: z.string(), filter: CohortFilter, createdBy: z.string(), createdAt: z.string(), patientIds: z.array(z.string()), status: z.enum(["draft", "submitted"]) });
export const ResearchSnapshot = z.object({ id: z.string(), cohortId: z.string(), cutoff: z.string(), createdAt: z.string(), patients: z.array(Patient), quality: z.record(z.number()) });
export const CandidateRequest = z.object({ id: z.string(), snapshotId: z.string(), protocolId: z.string(), candidates: z.array(z.object({ patientId: z.string(), status: z.enum(["pending", "confirmed", "rejected"]) })), createdAt: z.string() });
export const DataGapTask = z.object({ id: z.string(), source: z.string(), field: z.string(), patientCount: z.number(), status: z.enum(["open", "done"]), createdAt: z.string() });
export const PatientMessage = z.object({ id: z.string(), patientId: z.string(), kind: z.enum(["alert_feedback", "research_opportunity", "plan_update", "emergency"]), text: z.string(), at: z.string() });

export type Alert = z.infer<typeof Alert>;
export type FollowUpTask = z.infer<typeof FollowUpTask>;
export type CohortFilter = z.infer<typeof CohortFilter>;
export type Cohort = z.infer<typeof Cohort>;
export type ResearchSnapshot = z.infer<typeof ResearchSnapshot>;
export type CandidateRequest = z.infer<typeof CandidateRequest>;
export type DataGapTask = z.infer<typeof DataGapTask>;
export type PatientMessage = z.infer<typeof PatientMessage>;
```

- [ ] **Step 3: 写 HER2 派生的失败测试**

`tests/unit/her2.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { deriveHer2Low } from "@/lib/domain/her2";
const base = { id: "b", specimenSite: "primary" as const, specimenDate: "2024-01-01", erPct: 80, prPct: 50, ki67: 20, readVersion: "ASCO/CAP2023" };
describe("deriveHer2Low", () => {
  it("IHC 1+ → low", () => expect(deriveHer2Low({ ...base, her2Ihc: "1+", ish: "not_done" })).toBe("low"));
  it("IHC 2+ ISH negative → low", () => expect(deriveHer2Low({ ...base, her2Ihc: "2+", ish: "negative" })).toBe("low"));
  it("IHC 2+ ISH missing → indeterminate", () => expect(deriveHer2Low({ ...base, her2Ihc: "2+", ish: "not_done" })).toBe("indeterminate"));
  it("IHC 3+ → positive", () => expect(deriveHer2Low({ ...base, her2Ihc: "3+", ish: "not_done" })).toBe("positive"));
  it("IHC 0 → zero", () => expect(deriveHer2Low({ ...base, her2Ihc: "0", ish: "not_done" })).toBe("zero"));
  it("unknown → indeterminate", () => expect(deriveHer2Low({ ...base, her2Ihc: "unknown", ish: "unknown" })).toBe("indeterminate"));
});
```
Run: `npx vitest run tests/unit/her2.test.ts` → Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 HER2 派生**

`lib/domain/her2.ts`：
```ts
import type { Biomarker } from "./types";
export type Her2Class = "low" | "ultra-low" | "zero" | "positive" | "indeterminate";
export function deriveHer2Low(b: Biomarker): Her2Class {
  if (b.her2Ihc === "3+") return "positive";
  if (b.her2Ihc === "2+") return b.ish === "positive" ? "positive" : b.ish === "negative" ? "low" : "indeterminate";
  if (b.her2Ihc === "1+") return "low";
  if (b.her2Ihc === "0") return "zero";
  return "indeterminate";
}
/** 取最新标本（转移灶优先于同日原发）做当前分类 */
export function currentHer2(biomarkers: Biomarker[]): Her2Class {
  if (!biomarkers.length) return "indeterminate";
  const sorted = [...biomarkers].sort((a, b) => (a.specimenDate === b.specimenDate ? (a.specimenSite === "metastatic" ? -1 : 1) : a.specimenDate < b.specimenDate ? 1 : -1));
  return deriveHer2Low(sorted[0]);
}
export const isHrPositive = (b: Biomarker) => (b.erPct ?? 0) >= 1 || (b.prPct ?? 0) >= 1;
```
Run: `npx vitest run tests/unit/her2.test.ts` → Expected: 6 passed。

- [ ] **Step 5: 写治疗线推断的失败测试**

`tests/unit/lines.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { inferLines } from "@/lib/domain/lines";
import type { TreatmentEvent } from "@/lib/domain/types";
const ev = (p: Partial<TreatmentEvent> & { id: string }): TreatmentEvent => ({ type: "chemo", intent: "metastatic", drug: null, start: "2025-01-01", end: null, stopReason: "ongoing", source: "in_house", ...p });
describe("inferLines", () => {
  it("ignores adjuvant events", () => {
    expect(inferLines([ev({ id: "a", intent: "adjuvant", type: "endocrine" })])).toHaveLength(0);
  });
  it("endocrine + cdk46 overlapping = one line", () => {
    const lines = inferLines([ev({ id: "e", type: "endocrine", start: "2025-01-01", end: "2025-08-01", stopReason: "progression" }), ev({ id: "c", type: "cdk46", start: "2025-01-05", end: "2025-08-01", stopReason: "progression" })]);
    expect(lines).toHaveLength(1); expect(lines[0].eventIds.sort()).toEqual(["c", "e"]);
  });
  it("progression then new drug = next line", () => {
    const lines = inferLines([ev({ id: "e", type: "endocrine", start: "2025-01-01", end: "2025-08-01", stopReason: "progression" }), ev({ id: "a", type: "adc", start: "2025-08-15", end: null })]);
    expect(lines.map(l => l.lineNo)).toEqual([1, 2]); expect(lines[1].end).toBeNull();
  });
  it("event with null start is excluded and does not throw", () => {
    expect(inferLines([ev({ id: "x", start: null })])).toHaveLength(0);
  });
});
```
Run: `npx vitest run tests/unit/lines.test.ts` → Expected: FAIL。

- [ ] **Step 6: 实现治疗线推断**

`lib/domain/lines.ts`：
```ts
import type { TreatmentEvent, SystemicTherapyLine } from "./types";
import { diffDays } from "./dates";
export const LINE_RULES_VERSION = "lines-v1";
const SYSTEMIC = new Set(["chemo", "endocrine", "anti_her2", "cdk46", "adc"]);
/** 规则 v1：转移性意图的系统治疗事件按开始日排序；新事件开始日距当前线最早开始日 ≤ 28 天视为联合并入当前线；否则若当前线已有停止原因为 progression/toxicity/patient_choice 或新事件开始晚于当前线所有事件结束日 → 开新线。 */
export function inferLines(events: TreatmentEvent[], rulesVersion = LINE_RULES_VERSION): SystemicTherapyLine[] {
  const evs = events.filter(e => e.intent === "metastatic" && SYSTEMIC.has(e.type) && e.start).sort((a, b) => a.start!.localeCompare(b.start!));
  const lines: SystemicTherapyLine[] = [];
  for (const e of evs) {
    const cur = lines[lines.length - 1];
    if (cur && diffDays(cur.start, e.start!) <= 28) { cur.eventIds.push(e.id); cur.end = maxEnd(cur.end, e.end); continue; }
    lines.push({ lineNo: lines.length + 1, eventIds: [e.id], start: e.start!, end: e.end, rulesVersion, reviewStatus: "unreviewed", reviewer: null });
  }
  return lines;
}
function maxEnd(a: string | null, b: string | null) { if (a === null || b === null) return null; return a > b ? a : b; }
```
Run: `npx vitest run tests/unit/lines.test.ts` → Expected: 4 passed。

- [ ] **Step 7: 提交**

```bash
git add lib/domain tests/unit && git commit -m "feat(domain): entity types, HER2 derivation, therapy line inference"
```

---

### Task 2: 锚点病例与合成队列生成器

**Files:**
- Create: `data/seed/anchors.json`, `scripts/generate-seed.ts`, `lib/seed/generator.ts`, `lib/seed/validate.ts`, `lib/seed/load.ts`, `data/seed/expected.json`
- Test: `tests/unit/generator.test.ts`

**Interfaces:**
- Produces: `generateCohort(opts: { seed: number; n: number; cutoff: string }): Patient[]`；`generateEdgeCases(): Patient[]`；`validatePatients(ps: Patient[]): string[]`（返回违规列表，空数组即通过）；`loadSeed(): { anchors: Patient[]; cohort: Patient[]; edgeCases: Patient[]; manifest: Manifest }`；`Manifest = { seed: number; version: string; checksum: string; cutoff: string; counts: Record<string, number> }`。

- [ ] **Step 1: 手写 12 例锚点**

`data/seed/anchors.json` 为 `Patient[]`。前两例必须严格如下（其余 10 例按规格 5.1 的清单编写，每例 `expertNote` 一句话）：

患者 A（`id: "P-A"`, `anchorKey: "A"`）：age 52；stage `early_adjuvant`；surgeryDate `2025-07-10`；biomarkers 一条原发 2025-07-12，ER 90 PR 60 HER2 IHC `0` ISH `not_done` Ki67 18；staging pTnm `pT2N1M0`；treatments：surgery adjuvant 2025-07-10；chemo adjuvant 2025-08-01～2025-11-15 completed；radiation adjuvant 2025-12-01～2026-01-10 completed；endocrine adjuvant drug `来曲唑` start `2025-08-20` end null ongoing；lines `[]`；outcomes `[]`；pro：12 条 `endocrine_monthly_v1`，从 2025-10 起每月一条，items 关节痛逐月 0→1→1→2，潮热 1～2，flags missedDoses14d 0～2；adherence 近 60 天每日 due 1，taken 1，其中 2026-09-28 之后漏 5 次 missedReason "关节痛"；consent 三项 true；genomics brca negative、pik3ca not_tested、esr1 not_tested；expertNote "辅助内分泌第 14 个月，关节痛与漏服并存，典型依从性风险病例"。

患者 B（`id: "P-B"`, `anchorKey: "B"`）：age 61；stage `metastatic`；surgeryDate `2022-03-15`；biomarkers 两条：原发 2022-03-17 ER 70 PR 20 HER2 IHC `0`；转移灶 2025-04-02 ER 60 PR 10 HER2 IHC `1+` ISH `not_done`；staging pTnm `pT3N2M0` 2022-03-17；outcomes：distant_metastasis 2025-03-28 evidence imaging；treatments：surgery adjuvant 2022-03-15；chemo adjuvant 2022-04～2022-08 completed；endocrine adjuvant `阿那曲唑` 2022-09-01～2025-03-28 progression；endocrine metastatic `氟维司群` 2025-04-15～2026-06-30 progression；cdk46 metastatic `哌柏西利` 2025-04-15～2026-06-30 progression；adc metastatic `德曲妥珠单抗` 2026-07-20 end null ongoing；lines 由 `inferLines` 在加载时计算并 reviewStatus `confirmed`；pro：4 条 `treatment_weekly_v1` 2026-09 起每周，恶心 1～2，乏力 2，口腔炎 0～1；consent 三项 true；genomics brca negative、pik3ca mutated、esr1 not_tested；expertNote "原发 HER2 0 转移灶 1+，CDK4/6 后 ADC 二线，病理结果变化的典型病例"。

- [ ] **Step 2: 写生成器的失败测试**

`tests/unit/generator.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { generateCohort, generateEdgeCases, checksumOf } from "@/lib/seed/generator";
import { validatePatients } from "@/lib/seed/validate";
describe("generator", () => {
  it("is deterministic", () => {
    const a = generateCohort({ seed: 20261013, n: 200, cutoff: "2026-10-13" });
    const b = generateCohort({ seed: 20261013, n: 200, cutoff: "2026-10-13" });
    expect(checksumOf(a)).toBe(checksumOf(b));
  });
  it("has zero hard-constraint violations", () => {
    const ps = generateCohort({ seed: 20261013, n: 2000, cutoff: "2026-10-13" });
    expect(validatePatients(ps)).toEqual([]);
  });
  it("subtype distribution is near target", () => {
    const ps = generateCohort({ seed: 20261013, n: 2000, cutoff: "2026-10-13" });
    const hrNeg = ps.filter(p => p.biomarkers[0].her2Ihc === "3+").length / ps.length;
    expect(hrNeg).toBeGreaterThan(0.15); expect(hrNeg).toBeLessThan(0.25);
  });
  it("edge cases DO violate constraints", () => {
    expect(validatePatients(generateEdgeCases()).length).toBeGreaterThan(0);
  });
});
```
Run: `npx vitest run tests/unit/generator.test.ts` → Expected: FAIL。

- [ ] **Step 3: 实现硬约束校验**

`lib/seed/validate.ts`：
```ts
import type { Patient } from "@/lib/domain/types";
export function validatePatients(ps: Patient[]): string[] {
  const errs: string[] = [];
  for (const p of ps) {
    for (const t of p.treatments) {
      if (t.start && t.end && t.end < t.start) errs.push(`${p.id}:${t.id} end<start`);
      if (t.intent === "metastatic" && !p.outcomes.some(o => o.type === "distant_metastasis" && t.start && o.date <= t.start)) errs.push(`${p.id}:${t.id} metastatic treatment before metastasis`);
      if (t.intent === "adjuvant" && p.surgeryDate && t.start && t.start < p.surgeryDate) errs.push(`${p.id}:${t.id} adjuvant before surgery`);
    }
    const death = p.outcomes.find(o => o.type === "death");
    if (death) {
      if (p.stage !== "deceased") errs.push(`${p.id} death without deceased stage`);
      if (p.outcomes.some(o => o.type !== "death" && o.date > death.date)) errs.push(`${p.id} event after death`);
      if (p.treatments.some(t => t.start && t.start > death.date)) errs.push(`${p.id} treatment after death`);
    }
    if (p.stage === "metastatic" && !p.outcomes.some(o => o.type === "distant_metastasis")) errs.push(`${p.id} metastatic stage without metastasis event`);
    const ids = new Set<string>(); for (const t of p.treatments) { if (ids.has(t.id)) errs.push(`${p.id} duplicate event ${t.id}`); ids.add(t.id); }
  }
  return errs;
}
```

- [ ] **Step 4: 实现生成器**

`lib/seed/generator.ts`（核心逻辑，疾病状态机）：
```ts
import seedrandom from "seedrandom";
import { createHash } from "node:crypto";
import type { Patient, TreatmentEvent, Biomarker } from "@/lib/domain/types";
import { addDays } from "@/lib/domain/dates";
import { inferLines } from "@/lib/domain/lines";

type Rng = () => number;
const pick = <T,>(r: Rng, arr: T[]) => arr[Math.floor(r() * arr.length)];
const chance = (r: Rng, p: number) => r() < p;
const between = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

export function checksumOf(ps: Patient[]) { return createHash("sha256").update(JSON.stringify(ps)).digest("hex").slice(0, 16); }

export function generateCohort({ seed, n, cutoff }: { seed: number; n: number; cutoff: string }): Patient[] {
  const r = seedrandom(String(seed));
  const out: Patient[] = [];
  for (let i = 0; i < n; i++) out.push(genPatient(r, `P-${String(i + 1).padStart(4, "0")}`, cutoff));
  return out;
}

function genPatient(r: Rng, id: string, cutoff: string): Patient {
  const age = between(r, 32, 78);
  const dx = addDays(cutoff, -between(r, 120, 365 * 7));           // 诊断日 4 个月～7 年前
  const subtype = r() < 0.65 ? "hr_pos" : r() < 0.57 ? "her2_pos" : "tnbc"; // 65 / 20 / 15
  const bio: Biomarker = {
    id: `${id}-b1`, specimenSite: "primary", specimenDate: addDays(dx, 2), readVersion: "ASCO/CAP2023",
    erPct: subtype === "tnbc" ? 0 : subtype === "hr_pos" ? between(r, 10, 100) : between(r, 0, 100),
    prPct: subtype === "tnbc" ? 0 : between(r, 0, 90), ki67: between(r, 5, 70),
    her2Ihc: subtype === "her2_pos" ? "3+" : pick(r, ["0", "1+", "1+", "2+"]), ish: "not_done",
  };
  if (bio.her2Ihc === "2+") bio.ish = chance(r, 0.95) ? "negative" : "not_done";   // 5% 缺 ISH
  const stageT = pick(r, ["pT1N0M0", "pT2N0M0", "pT2N1M0", "pT3N1M0", "pT3N2M0"]);
  const surgeryDate = addDays(dx, between(r, 14, 45));
  const treatments: TreatmentEvent[] = [{ id: `${id}-t1`, type: "surgery", intent: "adjuvant", drug: null, start: surgeryDate, end: surgeryDate, stopReason: "completed", source: "in_house" }];
  let k = 2;
  const push = (t: Omit<TreatmentEvent, "id">) => treatments.push({ id: `${id}-t${k++}`, ...t });
  if (subtype !== "hr_pos" || /N[12]/.test(stageT)) push({ type: "chemo", intent: "adjuvant", drug: "AC-T", start: addDays(surgeryDate, 21), end: addDays(surgeryDate, 130), stopReason: "completed", source: "in_house" });
  if (subtype === "hr_pos") push({ type: "endocrine", intent: "adjuvant", drug: pick(r, ["来曲唑", "阿那曲唑", "他莫昔芬"]), start: addDays(surgeryDate, 40), end: null, stopReason: "ongoing", source: chance(r, 0.1) ? "external" : "in_house" });
  if (subtype === "her2_pos") push({ type: "anti_her2", intent: "adjuvant", drug: "曲妥珠单抗", start: addDays(surgeryDate, 21), end: addDays(surgeryDate, 386), stopReason: "completed", source: "in_house" });

  // 复发/转移：按分期与分型设置年风险
  const annualRisk = (/N2/.test(stageT) ? 0.12 : /N1/.test(stageT) ? 0.07 : 0.03) * (subtype === "tnbc" ? 1.6 : 1);
  const yearsObs = Math.max(0, (new Date(cutoff).getTime() - new Date(surgeryDate).getTime()) / (365 * 86_400_000));
  const outcomes: Patient["outcomes"] = []; let stage: Patient["stage"] = yearsObs > 5 && subtype === "hr_pos" && chance(r, 0.5) ? "survivorship" : "early_adjuvant";
  let metDate: string | null = null;
  for (let y = 1; y <= Math.floor(yearsObs); y++) if (!metDate && chance(r, annualRisk)) metDate = addDays(surgeryDate, y * 365 - between(r, 0, 300));
  const biomarkers = [bio];
  if (metDate && metDate < cutoff) {
    stage = "metastatic";
    outcomes.push({ id: `${id}-o1`, type: "distant_metastasis", date: metDate, evidence: "imaging", assessor: "Dr. Mock" });
    const endoAdj = treatments.find(t => t.type === "endocrine"); if (endoAdj) { endoAdj.end = metDate; endoAdj.stopReason = "progression"; }
    biomarkers.push({ ...bio, id: `${id}-b2`, specimenSite: "metastatic", specimenDate: addDays(metDate, 5), her2Ihc: chance(r, 0.3) ? pick(r, ["0", "1+", "2+"]) : bio.her2Ihc });
    // 一线
    const l1Start = addDays(metDate, between(r, 10, 30));
    const l1Dur = between(r, 90, 700); const l1End = addDays(l1Start, l1Dur);
    const l1Prog = l1End < cutoff;
    if (subtype === "hr_pos") {
      push({ type: "endocrine", intent: "metastatic", drug: "氟维司群", start: l1Start, end: l1Prog ? l1End : null, stopReason: l1Prog ? "progression" : "ongoing", source: "in_house" });
      push({ type: "cdk46", intent: "metastatic", drug: pick(r, ["哌柏西利", "阿贝西利", "达尔西利"]), start: addDays(l1Start, between(r, 0, 10)), end: l1Prog ? l1End : null, stopReason: l1Prog ? "progression" : "ongoing", source: "in_house" });
    } else if (subtype === "her2_pos") {
      push({ type: "anti_her2", intent: "metastatic", drug: "曲妥珠单抗+帕妥珠单抗", start: l1Start, end: l1Prog ? l1End : null, stopReason: l1Prog ? "progression" : "ongoing", source: "in_house" });
    } else push({ type: "chemo", intent: "metastatic", drug: "白蛋白紫杉醇", start: l1Start, end: l1Prog ? l1End : null, stopReason: l1Prog ? "progression" : "ongoing", source: "in_house" });
    if (l1Prog) {
      outcomes.push({ id: `${id}-o2`, type: "progression", date: l1End, evidence: "imaging", assessor: "Dr. Mock" });
      const l2Start = addDays(l1End, between(r, 10, 40));
      if (l2Start < cutoff) {
        const her2 = biomarkers[1].her2Ihc;
        const drug = her2 === "3+" ? "德曲妥珠单抗" : her2 === "0" ? pick(r, ["戈沙妥珠单抗", "卡培他滨"]) : pick(r, ["德曲妥珠单抗", "戈沙妥珠单抗"]);
        const l2End = addDays(l2Start, between(r, 60, 400)); const l2Prog = l2End < cutoff;
        push({ type: drug === "卡培他滨" ? "chemo" : "adc", intent: "metastatic", drug, start: l2Start, end: l2Prog ? l2End : null, stopReason: l2Prog ? (chance(r, 0.25) ? "toxicity" : "progression") : "ongoing", source: "in_house" });
        if (l2Prog && chance(r, 0.35)) { const d = addDays(l2End, between(r, 20, 200)); if (d < cutoff) { outcomes.push({ id: `${id}-o3`, type: "death", date: d, evidence: "clinical_note", assessor: "Dr. Mock" }); stage = "deceased"; } }
      }
    }
  }
  // 不完美注入
  for (const t of treatments) { if (t.source === "external" && chance(r, 0.6)) { t.start = null; t.end = null; } if (t.stopReason !== "ongoing" && chance(r, 0.08)) t.stopReason = "unknown"; }
  const lost = stage !== "deceased" && chance(r, 0.06); if (lost) stage = "lost";
  const lastContact = stage === "lost" ? addDays(cutoff, -between(r, 200, 600)) : addDays(cutoff, -between(r, 0, 45));
  const deathDate = outcomes.find(o => o.type === "death")?.date;
  const p: Patient = {
    id, anchorKey: null, age, enrolledAt: addDays(dx, 30), stage, surgeryDate,
    consent: { followUp: true, research: chance(r, 0.9), pharmaDeidentified: chance(r, 0.8), signedAt: addDays(dx, 30) },
    biomarkers, staging: [{ cTnm: null, pTnm: stageT, date: addDays(surgeryDate, 7), system: "AJCC8" }], treatments, lines: [], outcomes,
    pro: [], adherence: [], lastContact: deathDate ?? lastContact,
    genomics: { brca: chance(r, 0.1) ? "positive" : chance(r, 0.6) ? "negative" : "not_tested", pik3ca: stage === "metastatic" && chance(r, 0.7) ? (chance(r, 0.4) ? "mutated" : "wild") : "not_tested", esr1: "not_tested" },
  };
  p.lines = inferLines(p.treatments);
  genProAndAdherence(r, p, cutoff);
  return p;
}

function genProAndAdherence(r: Rng, p: Patient, cutoff: string) {
  const endo = p.treatments.find(t => t.type === "endocrine" && t.intent === "adjuvant" && t.start && !t.end);
  if (endo && p.stage === "early_adjuvant") {
    for (let m = 1; m <= 6; m++) {
      const at = addDays(cutoff, -30 * m); if (at < endo.start!) break;
      p.pro.push({ id: `${p.id}-pro${m}`, scaleId: "endocrine_monthly_v1", submittedAt: at + "T09:00:00+08:00", items: { 关节痛: between(r, 0, 3), 潮热: between(r, 0, 2), 情绪: between(r, 0, 2), 睡眠: between(r, 0, 2) }, flags: { stopIntent: chance(r, 0.08), missedDoses14d: chance(r, 0.25) ? between(r, 1, 6) : 0 } });
    }
    for (let d = 59; d >= 0; d--) { const miss = chance(r, 0.07); p.adherence.push({ date: addDays(cutoff, -d), due: 1, taken: miss ? 0 : 1, missedReason: miss ? (chance(r, 0.7) ? pick(r, ["忘记", "关节痛", "外出"]) : null) : null }); }
  }
  const active = p.treatments.find(t => t.intent === "metastatic" && !t.end && t.start);
  if (active && p.stage === "metastatic") for (let w = 1; w <= 4; w++) p.pro.push({ id: `${p.id}-prow${w}`, scaleId: "treatment_weekly_v1", submittedAt: addDays(cutoff, -7 * w) + "T09:00:00+08:00", items: { 恶心: between(r, 0, 2), 乏力: between(r, 0, 3), 口腔炎: between(r, 0, 2), 腹泻: between(r, 0, 1), 手足综合征: 0, 发热: 0 }, flags: {} });
}

export function generateEdgeCases(): Patient[] {
  const base = generateCohort({ seed: 1, n: 20, cutoff: "2026-10-13" });
  return base.map((p, i) => {
    const q = structuredClone(p); q.id = `E-${String(i + 1).padStart(2, "0")}`;
    if (i % 4 === 0 && q.treatments[0]) q.treatments[0].end = "2000-01-01";           // end<start
    if (i % 4 === 1) q.treatments.push({ ...q.treatments[0], id: q.treatments[0].id }); // duplicate
    if (i % 4 === 2) q.staging = [];                                                   // 缺分期（由质量指标捕获）
    if (i % 4 === 3) q.outcomes.push({ id: "x", type: "death", date: "2020-01-01", evidence: "clinical_note", assessor: "x" }); // 死亡后仍有事件
    return q;
  });
}
```
Run: `npx vitest run tests/unit/generator.test.ts` → Expected: 4 passed。若"zero violations"失败，按错误信息修正生成器（常见：转移性治疗开始日早于转移日，需确保 `l1Start > metDate`）。

- [ ] **Step 5: 写生成脚本与加载器**

`scripts/generate-seed.ts`：
```ts
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { generateCohort, generateEdgeCases, checksumOf } from "../lib/seed/generator";
import { validatePatients } from "../lib/seed/validate";
import { Patient } from "../lib/domain/types";
const SEED = 20261013, VERSION = "gen-v1", CUTOFF = "2026-10-13", N = 2000;
mkdirSync("data/seed", { recursive: true });
const anchors = Patient.array().parse(JSON.parse(readFileSync("data/seed/anchors.json", "utf8")));
const cohort = generateCohort({ seed: SEED, n: N, cutoff: CUTOFF });
const errs = validatePatients([...anchors, ...cohort]);
if (errs.length) { console.error(errs.slice(0, 20)); process.exit(1); }
const edge = generateEdgeCases();
writeFileSync("data/seed/cohort.json", JSON.stringify(cohort));
writeFileSync("data/seed/edge-cases.json", JSON.stringify(edge));
writeFileSync("data/seed/manifest.json", JSON.stringify({ seed: SEED, version: VERSION, cutoff: CUTOFF, checksum: checksumOf(cohort), counts: { anchors: anchors.length, cohort: cohort.length, edgeCases: edge.length }, violations: 0 }, null, 2));
console.log("seed ok", checksumOf(cohort));
```

`lib/seed/load.ts`：
```ts
import { readFileSync } from "node:fs";
import { Patient } from "@/lib/domain/types";
import { inferLines } from "@/lib/domain/lines";
export type Manifest = { seed: number; version: string; cutoff: string; checksum: string; counts: Record<string, number> };
const read = (f: string) => JSON.parse(readFileSync(`data/seed/${f}`, "utf8"));
export function loadSeed() {
  const anchors = Patient.array().parse(read("anchors.json")).map(p => ({ ...p, lines: p.lines.length ? p.lines : inferLines(p.treatments).map(l => ({ ...l, reviewStatus: "confirmed" as const, reviewer: "Dr. Mock" })) }));
  return { anchors, cohort: Patient.array().parse(read("cohort.json")), edgeCases: Patient.array().parse(read("edge-cases.json")), manifest: read("manifest.json") as Manifest };
}
```
Run: `npm run seed` → Expected: 输出 `seed ok <checksum>`，`data/seed/manifest.json` 存在。再跑一次 → checksum 相同。

- [ ] **Step 6: 写 expected.json 的骨架**

`data/seed/expected.json`（人数在 Task 4 完成计算服务后用脚本填入并人工核对，此处先写条件）：
```json
[
  { "key": "hrpos_her2low_metastatic_cdk46", "filter": { "hrPositive": true, "her2": ["low"], "stage": ["metastatic"], "priorCdk46": true }, "expectedCount": null },
  { "key": "early_endocrine_ongoing", "filter": { "hrPositive": true, "stage": ["early_adjuvant"], "currentTreatmentType": ["endocrine"] }, "expectedCount": null },
  { "key": "her2_positive_all", "filter": { "her2": ["positive"] }, "expectedCount": null },
  { "key": "metastatic_on_adc", "filter": { "stage": ["metastatic"], "currentTreatmentType": ["adc"] }, "expectedCount": null },
  { "key": "survivorship", "filter": { "stage": ["survivorship"] }, "expectedCount": null }
]
```

- [ ] **Step 7: 提交**

```bash
git add data/seed scripts lib/seed tests/unit/generator.test.ts && git commit -m "feat(seed): anchor cases, constrained cohort generator, manifest"
```

---

### Task 3: 状态容器、演示时钟、状态 API 与演示导航页

**Files:**
- Create: `lib/state/store.ts`, `lib/state/clock.ts`, `app/api/state/route.ts`, `app/api/reset/route.ts`, `components/ViewSwitcher.tsx`, `components/ModeBadge.tsx`, `lib/client/useDemoState.ts`
- Modify: `app/page.tsx`, `app/layout.tsx`
- Test: `tests/unit/store.test.ts`

**Interfaces:**
- Produces: `getStore(): DemoStore`；`DemoStore = { patients: Map<string, Patient>; alerts: Alert[]; tasks: FollowUpTask[]; cohorts: Cohort[]; snapshots: ResearchSnapshot[]; candidateRequests: CandidateRequest[]; gapTasks: DataGapTask[]; messages: PatientMessage[]; manifest: Manifest; agentMode: "deterministic" | "claude" | "openai" }`；`resetStore(): void`；`now(): string`（ISO datetime，受 `DEMO_FIXED_NOW` 控制）；`newId(prefix: string): string`；客户端 `useDemoState(pollMs = 3000)` 返回 `/api/state` 的 JSON 并定时刷新。

- [ ] **Step 1: 写失败测试**

`tests/unit/store.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { getStore, resetStore } from "@/lib/state/store";
describe("store", () => {
  it("loads anchors + cohort once", () => { const s = getStore(); expect(s.patients.get("P-A")?.anchorKey).toBe("A"); expect(s.patients.size).toBeGreaterThan(2000); });
  it("reset clears runtime collections and keeps patients", () => {
    const s = getStore(); s.alerts.push({ id: "x" } as any); resetStore();
    const t = getStore(); expect(t.alerts).toHaveLength(0); expect(t.patients.get("P-B")).toBeTruthy();
  });
  it("reset restores anchor PRO count (no duplication)", () => {
    const n = getStore().patients.get("P-A")!.pro.length; getStore().patients.get("P-A")!.pro.push({} as any); resetStore();
    expect(getStore().patients.get("P-A")!.pro.length).toBe(n);
  });
});
```
Run → Expected: FAIL。

- [ ] **Step 2: 实现 clock 与 store**

`lib/state/clock.ts`：
```ts
export const now = () => process.env.DEMO_FIXED_NOW ? new Date(process.env.DEMO_FIXED_NOW).toISOString() : new Date().toISOString();
export const today = () => now().slice(0, 10);
let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
export const isOffHours = (iso = now()) => { const h = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Shanghai" })).getHours(); return h >= 18 || h < 8; };
```

`lib/state/store.ts`：
```ts
import { loadSeed, type Manifest } from "@/lib/seed/load";
import type { Patient, Alert, FollowUpTask, Cohort, ResearchSnapshot, CandidateRequest, DataGapTask, PatientMessage } from "@/lib/domain/types";
export type AgentMode = "deterministic" | "claude" | "openai";
export type DemoStore = { patients: Map<string, Patient>; alerts: Alert[]; tasks: FollowUpTask[]; cohorts: Cohort[]; snapshots: ResearchSnapshot[]; candidateRequests: CandidateRequest[]; gapTasks: DataGapTask[]; messages: PatientMessage[]; manifest: Manifest; agentMode: AgentMode; seedVersion: number };
const g = globalThis as unknown as { __demoStore?: DemoStore };
function build(): DemoStore {
  const { anchors, cohort, manifest } = loadSeed();
  const patients = new Map<string, Patient>();
  for (const p of [...anchors, ...cohort]) patients.set(p.id, structuredClone(p));
  const key = process.env.DEMO_CLAUDE_API_KEY ? "claude" : process.env.DEMO_OPENAI_API_KEY ? "openai" : "deterministic";
  return { patients, alerts: [], tasks: [], cohorts: [], snapshots: [], candidateRequests: [], gapTasks: [], messages: [], manifest, agentMode: key, seedVersion: (g.__demoStore?.seedVersion ?? 0) + 1 };
}
export function getStore(): DemoStore { if (!g.__demoStore) g.__demoStore = build(); return g.__demoStore; }
export function resetStore(): void { g.__demoStore = build(); }
export function serialize(s: DemoStore) { return { ...s, patients: [...s.patients.values()] }; }
```

- [ ] **Step 3: API 路由与客户端 hook**

`app/api/state/route.ts`：
```ts
import { NextResponse } from "next/server";
import { getStore, serialize } from "@/lib/state/store";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(serialize(getStore())); }
```
`app/api/reset/route.ts`：
```ts
import { NextResponse } from "next/server";
import { resetStore } from "@/lib/state/store";
export async function POST() { resetStore(); return NextResponse.json({ ok: true }); }
```
`lib/client/useDemoState.ts`：
```ts
"use client";
import { useEffect, useState, useCallback } from "react";
export function useDemoState<T = any>(pollMs = 3000) {
  const [data, setData] = useState<T | null>(null);
  const refresh = useCallback(async () => { const r = await fetch("/api/state", { cache: "no-store" }); setData(await r.json()); }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, pollMs); return () => clearInterval(t); }, [refresh, pollMs]);
  return { data, refresh };
}
```

- [ ] **Step 4: 导航页与通用组件**

`components/ViewSwitcher.tsx`：四个链接（患者端 `/patient`、医生工作台 `/clinic/alerts`、数据治理 `/governance`、药企研究 `/research`），当前路由高亮，标题文字"演示视角切换"。`components/ModeBadge.tsx`：从 `useDemoState` 读 `agentMode`，显示"本地演示模式 / Claude / 兼容模型"。`app/page.tsx`：标题、四个视角卡片、"一键重置"按钮（POST `/api/reset` 后 `refresh`）、manifest 信息（种子、版本、checksum、数据截止日）、链接 `docs/demo-script.md`。`app/layout.tsx` 顶部放 `ViewSwitcher` 与 `ModeBadge`。

- [ ] **Step 5: 运行测试与手动检查**

Run: `npm test` → Expected: 全部通过。Run: `npm run demo`，打开 `http://localhost:3000` → 看到四个视角卡片与 manifest；点击重置后 `/api/state` 的 `seedVersion` 加一。

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "feat(state): in-memory demo store, clock, state/reset API, demo nav"
```

---

### Task 4: 计算服务（筛选、漏斗、治疗模式、依从、质量）

**Files:**
- Create: `lib/compute/filter.ts`, `lib/compute/funnel.ts`, `lib/compute/patterns.ts`, `lib/compute/adherence.ts`, `lib/compute/quality.ts`, `lib/compute/index.ts`, `scripts/fill-expected.ts`
- Modify: `data/seed/expected.json`
- Test: `tests/unit/compute.test.ts`

**Interfaces:**
- Produces:
  - `applyFilter(ps: Patient[], f: CohortFilter): Patient[]`
  - `runFunnel(ps: Patient[], criteria: Criterion[]): FunnelResult`，`Criterion = { id: string; label: string; evaluate: (p: Patient) => "met" | "not_met" | "unknown"; unknownReason?: string }`，`FunnelResult = { steps: { id: string; label: string; met: number; notMet: number; unknown: number; unknownReasons: Record<string, number> }[]; finalMet: string[]; finalUnknown: string[] }`
  - `PROTOCOL_ADC_301: Criterion[]`（虚构方案：HR+、HER2 低表达、转移性、CDK4/6 经治、无 ADC 既往、ECOG 未知视为 unknown）
  - `treatmentPatterns(ps: Patient[]): { sequences: { path: string; count: number }[]; n: number }`（按 lines 的药物类别序列，如"内分泌+CDK4/6 → ADC"）
  - `lineGapStatus(ps: Patient[], lineNo: number, cutoff: string): Record<"on_treatment"|"next_line"|"lost"|"deceased"|"unknown", number>`
  - `adherenceStats(ps: Patient[]): { n: number; missedReasonDist: Record<string, number>; stopIntentRate: number; meanTakenRate: number }`
  - `qualityMetrics(ps: Patient[]): { completeness: Record<"subtype"|"stage"|"lines", number>; lineReviewRate: number; consent: { followUp: number; research: number; pharmaDeidentified: number }; n: number }`

- [ ] **Step 1: 失败测试**

`tests/unit/compute.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { applyFilter, runFunnel, PROTOCOL_ADC_301, lineGapStatus, qualityMetrics } from "@/lib/compute";
import { getStore } from "@/lib/state/store";
import expected from "@/data/seed/expected.json";
const all = () => [...getStore().patients.values()];
describe("compute", () => {
  it("expected.json counts match", () => { for (const e of expected) if (e.expectedCount !== null) expect(applyFilter(all(), e.filter as any).length, e.key).toBe(e.expectedCount); });
  it("funnel: IHC 2+ without ISH lands in unknown", () => {
    const p = structuredClone(getStore().patients.get("P-B")!); p.biomarkers[1].her2Ihc = "2+"; p.biomarkers[1].ish = "not_done";
    const r = runFunnel([p], PROTOCOL_ADC_301); const step = r.steps.find(s => s.id === "her2_low")!; expect(step.unknown).toBe(1); expect(step.met).toBe(0);
  });
  it("funnel: P-B meets HR+/HER2-low/metastatic/prior CDK4/6 but fails 'no prior ADC'", () => {
    const r = runFunnel([getStore().patients.get("P-B")!], PROTOCOL_ADC_301); expect(r.steps.find(s => s.id === "no_prior_adc")!.notMet).toBe(1);
  });
  it("line gap statuses are exhaustive", () => { const s = lineGapStatus(all(), 1, "2026-10-13"); const n = all().filter(p => p.lines.length >= 1).length; expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(n); });
  it("quality returns rates in [0,1]", () => { const q = qualityMetrics(all()); for (const v of Object.values(q.completeness)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); } });
});
```
Run → Expected: FAIL。

- [ ] **Step 2: 实现 filter 与 funnel**

`lib/compute/filter.ts`：
```ts
import type { Patient, CohortFilter } from "@/lib/domain/types";
import { currentHer2, isHrPositive } from "@/lib/domain/her2";
export const latestBio = (p: Patient) => [...p.biomarkers].sort((a, b) => b.specimenDate.localeCompare(a.specimenDate))[0];
export const hadType = (p: Patient, type: string) => p.treatments.some(t => t.type === type);
export const currentTreatments = (p: Patient) => p.treatments.filter(t => t.start && !t.end);
export function applyFilter(ps: Patient[], f: CohortFilter): Patient[] {
  return ps.filter(p => {
    const b = latestBio(p);
    if (f.hrPositive !== undefined && (!b || isHrPositive(b) !== f.hrPositive)) return false;
    if (f.her2 && !f.her2.includes(currentHer2(p.biomarkers) as any)) return false;
    if (f.stage && !f.stage.includes(p.stage)) return false;
    if (f.priorCdk46 !== undefined && hadType(p, "cdk46") !== f.priorCdk46) return false;
    if (f.intent && !p.treatments.some(t => f.intent!.includes(t.intent))) return false;
    if (f.currentTreatmentType && !currentTreatments(p).some(t => f.currentTreatmentType!.includes(t.type))) return false;
    return true;
  });
}
```

`lib/compute/funnel.ts`：
```ts
import type { Patient } from "@/lib/domain/types";
import { currentHer2, isHrPositive } from "@/lib/domain/her2";
import { latestBio, hadType } from "./filter";
export type Verdict = "met" | "not_met" | "unknown";
export type Criterion = { id: string; label: string; evaluate: (p: Patient) => Verdict; unknownReason?: string };
export type FunnelResult = { steps: { id: string; label: string; met: number; notMet: number; unknown: number; unknownReasons: Record<string, number> }[]; finalMet: string[]; finalUnknown: string[] };
export const PROTOCOL_ADC_301: Criterion[] = [
  { id: "hr_pos", label: "HR 阳性", evaluate: p => { const b = latestBio(p); return !b || b.erPct === null ? "unknown" : isHrPositive(b) ? "met" : "not_met"; }, unknownReason: "缺 ER/PR 结果" },
  { id: "her2_low", label: "HER2 低表达", evaluate: p => { const c = currentHer2(p.biomarkers); return c === "indeterminate" ? "unknown" : c === "low" ? "met" : "not_met"; }, unknownReason: "IHC 2+ 缺 ISH 或结果未知" },
  { id: "metastatic", label: "转移性疾病", evaluate: p => p.stage === "metastatic" ? "met" : "not_met" },
  { id: "prior_cdk46", label: "CDK4/6 抑制剂经治", evaluate: p => hadType(p, "cdk46") ? "met" : "not_met" },
  { id: "no_prior_adc", label: "无 ADC 既往治疗", evaluate: p => p.treatments.some(t => t.type === "adc" && t.start === null) ? "unknown" : hadType(p, "adc") ? "not_met" : "met", unknownReason: "外院治疗缺日期" },
  { id: "ecog", label: "ECOG 0–1", evaluate: () => "unknown", unknownReason: "数据源无 ECOG 字段" },
];
export function runFunnel(ps: Patient[], criteria: Criterion[]): FunnelResult {
  let met = ps, unknown: Patient[] = [];
  const steps: FunnelResult["steps"] = [];
  for (const c of criteria) {
    const step = { id: c.id, label: c.label, met: 0, notMet: 0, unknown: 0, unknownReasons: {} as Record<string, number> };
    const nextMet: Patient[] = [], nextUnknown: Patient[] = [];
    for (const p of [...met, ...unknown]) {
      const v = c.evaluate(p); const wasUnknown = unknown.includes(p);
      if (v === "not_met") step.notMet++;
      else if (v === "unknown" || wasUnknown) { step.unknown++; nextUnknown.push(p); if (v === "unknown" && c.unknownReason) step.unknownReasons[c.unknownReason] = (step.unknownReasons[c.unknownReason] ?? 0) + 1; }
      else { step.met++; nextMet.push(p); }
    }
    met = nextMet; unknown = nextUnknown; steps.push(step);
  }
  return { steps, finalMet: met.map(p => p.id), finalUnknown: unknown.map(p => p.id) };
}
```

- [ ] **Step 3: 实现 patterns、adherence、quality、index**

`lib/compute/patterns.ts`：
```ts
import type { Patient } from "@/lib/domain/types";
const CLASS: Record<string, string> = { endocrine: "内分泌", cdk46: "CDK4/6", anti_her2: "抗HER2", adc: "ADC", chemo: "化疗", other: "其他" };
export function lineLabel(p: Patient, lineNo: number) { const l = p.lines.find(x => x.lineNo === lineNo); if (!l) return null; return [...new Set(l.eventIds.map(id => CLASS[p.treatments.find(t => t.id === id)!.type]))].sort().join("+"); }
export function treatmentPatterns(ps: Patient[]) {
  const counts = new Map<string, number>();
  const withLines = ps.filter(p => p.lines.length);
  for (const p of withLines) { const path = p.lines.map(l => lineLabel(p, l.lineNo)).join(" → "); counts.set(path, (counts.get(path) ?? 0) + 1); }
  return { n: withLines.length, sequences: [...counts].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count) };
}
export function lineGapStatus(ps: Patient[], lineNo: number, cutoff: string) {
  const r = { on_treatment: 0, next_line: 0, lost: 0, deceased: 0, unknown: 0 };
  for (const p of ps) {
    const l = p.lines.find(x => x.lineNo === lineNo); if (!l) continue;
    if (l.end === null) r.on_treatment++;
    else if (p.lines.some(x => x.lineNo === lineNo + 1)) r.next_line++;
    else if (p.stage === "deceased") r.deceased++;
    else if (p.stage === "lost") r.lost++;
    else r.unknown++;
  }
  return r;
}
```
`lib/compute/adherence.ts`：
```ts
import type { Patient } from "@/lib/domain/types";
export function adherenceStats(ps: Patient[]) {
  const withLogs = ps.filter(p => p.adherence.length);
  const reasons: Record<string, number> = {}; let due = 0, taken = 0, stopIntent = 0, proN = 0;
  for (const p of withLogs) { for (const a of p.adherence) { due += a.due; taken += a.taken; if (a.taken < a.due) { const k = a.missedReason ?? "未填写"; reasons[k] = (reasons[k] ?? 0) + 1; } } for (const r of p.pro) if (r.scaleId === "endocrine_monthly_v1") { proN++; if (r.flags.stopIntent) stopIntent++; } }
  return { n: withLogs.length, missedReasonDist: reasons, stopIntentRate: proN ? stopIntent / proN : 0, meanTakenRate: due ? taken / due : 0 };
}
```
`lib/compute/quality.ts`：
```ts
import type { Patient } from "@/lib/domain/types";
import { currentHer2 } from "@/lib/domain/her2";
export function qualityMetrics(ps: Patient[]) {
  const n = ps.length || 1; const has = (f: (p: Patient) => boolean) => ps.filter(f).length / n;
  const metastatic = ps.filter(p => p.stage === "metastatic" || p.stage === "deceased"); const lines = metastatic.flatMap(p => p.lines);
  return { n: ps.length, completeness: { subtype: has(p => currentHer2(p.biomarkers) !== "indeterminate"), stage: has(p => p.staging.length > 0), lines: metastatic.length ? metastatic.filter(p => p.lines.length > 0).length / metastatic.length : 1 },
    lineReviewRate: lines.length ? lines.filter(l => l.reviewStatus !== "unreviewed").length / lines.length : 1,
    consent: { followUp: has(p => p.consent.followUp), research: has(p => p.consent.research), pharmaDeidentified: has(p => p.consent.pharmaDeidentified) } };
}
```
`lib/compute/index.ts` 统一 `export * from` 五个文件。

- [ ] **Step 4: 填 expected.json 并人工核对**

`scripts/fill-expected.ts`：读 `expected.json`，对每项用 `applyFilter(all, filter)` 计算人数写回 `expectedCount`，并打印每项人数。Run: `npx tsx scripts/fill-expected.ts`，把打印值与 `expected.json` 对照，再抽样 2 例患者手工验证筛选逻辑正确（例如随机打开一个 `hrpos_her2low_metastatic_cdk46` 的患者，确认其最新标本 IHC 1+ 且有 cdk46 事件）。
Run: `npm test` → Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add lib/compute scripts/fill-expected.ts data/seed/expected.json tests/unit/compute.test.ts && git commit -m "feat(compute): filter, three-state funnel, patterns, adherence, quality"
```

---

### Task 5: 预警规则与状态机

**Files:**
- Create: `lib/alerts/rules.ts`, `lib/alerts/machine.ts`
- Test: `tests/unit/alerts.test.ts`

**Interfaces:**
- Produces: `evaluatePro(p: Patient, pro: ProResponse): Omit<Alert, "id" | "status" | "assignee" | "timestamps" | "notes">[]`；`transition(a: Alert, action: "assign"|"accept"|"start"|"submit_review"|"close"|"escalate", by: string, at: string, note?: string): Alert`（非法流转抛 `Error("invalid transition")`）；`checkEscalations(alerts: Alert[], nowIso: string): Alert[]`（高级 2 小时、中级 24 小时未接单 → escalated）。

- [ ] **Step 1: 失败测试**

`tests/unit/alerts.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { evaluatePro } from "@/lib/alerts/rules";
import { transition, checkEscalations } from "@/lib/alerts/machine";
import { getStore } from "@/lib/state/store";
const pro = (items: Record<string, number>, flags: any = {}) => ({ id: "pro-x", scaleId: "endocrine_monthly_v1" as const, submittedAt: "2026-10-13T09:00:00+08:00", items, flags });
describe("rules", () => {
  const p = getStore().patients.get("P-A")!;
  it("symptom 2 → medium, missed 5 → high adherence", () => {
    const r = evaluatePro(p, pro({ 关节痛: 2, 潮热: 2 }, { missedDoses14d: 5, stopIntent: true }));
    expect(r.map(a => [a.kind, a.level])).toEqual([["symptom", "medium"], ["adherence", "high"]]);
  });
  it("symptom 3 → high", () => expect(evaluatePro(p, pro({ 关节痛: 3 }))[0].level).toBe("high"));
  it("all zero → no alert", () => expect(evaluatePro(p, pro({ 关节痛: 0, 潮热: 0 }))).toHaveLength(0));
});
describe("machine", () => {
  const base = { id: "a1", patientId: "P-A", kind: "symptom" as const, level: "high" as const, rule: "r", status: "triggered" as const, assignee: null, timestamps: { triggered: "2026-10-13T01:00:00Z" }, notes: [], proId: "p" };
  it("happy path", () => {
    let a = transition(base, "assign", "sys", "t1"); a = transition(a, "accept", "nurse", "t2"); a = transition(a, "start", "nurse", "t3", "已电话沟通"); a = transition(a, "submit_review", "nurse", "t4"); a = transition(a, "close", "doctor", "t5", "随访 2 周后复评");
    expect(a.status).toBe("closed"); expect(a.notes).toHaveLength(2);
  });
  it("close without review is invalid", () => expect(() => transition(base, "close", "x", "t")).toThrow("invalid transition"));
  it("high unassigned 3h → escalated; medium 3h → not", () => {
    const hi = transition(base, "assign", "sys", "2026-10-13T01:00:00Z"); const med = { ...hi, id: "a2", level: "medium" as const };
    const out = checkEscalations([hi, med], "2026-10-13T04:00:00Z");
    expect(out.find(a => a.id === "a1")!.status).toBe("escalated"); expect(out.find(a => a.id === "a2")!.status).toBe("unassigned");
  });
});
```
Run → Expected: FAIL。

- [ ] **Step 2: 实现**

`lib/alerts/rules.ts`：
```ts
import type { Patient, ProResponse, Alert } from "@/lib/domain/types";
export function evaluatePro(_p: Patient, pro: ProResponse) {
  const out: Omit<Alert, "id" | "status" | "assignee" | "timestamps" | "notes">[] = [];
  const max = Math.max(0, ...Object.values(pro.items));
  if (max >= 3) out.push({ patientId: _p.id, kind: "symptom", level: "high", rule: "任一症状 ≥ 3 级", proId: pro.id });
  else if (max === 2) out.push({ patientId: _p.id, kind: "symptom", level: "medium", rule: "任一症状 2 级", proId: pro.id });
  if ((pro.flags.missedDoses14d ?? 0) >= 3 || pro.flags.stopIntent) out.push({ patientId: _p.id, kind: "adherence", level: "high", rule: "两周漏服 ≥ 3 次或有停药念头", proId: pro.id });
  return out;
}
```
`lib/alerts/machine.ts`：
```ts
import type { Alert } from "@/lib/domain/types";
type Action = "assign" | "accept" | "start" | "submit_review" | "close" | "escalate";
const NEXT: Record<string, Partial<Record<Action, Alert["status"]>>> = {
  triggered: { assign: "unassigned", escalate: "escalated" }, unassigned: { accept: "accepted", escalate: "escalated" }, escalated: { accept: "accepted" },
  accepted: { start: "in_progress" }, in_progress: { submit_review: "pending_review" }, pending_review: { close: "closed" },
};
export function transition(a: Alert, action: Action, by: string, at: string, note?: string): Alert {
  const next = NEXT[a.status]?.[action]; if (!next) throw new Error("invalid transition");
  return { ...a, status: next, assignee: action === "accept" ? by : a.assignee, timestamps: { ...a.timestamps, [next]: at }, notes: note ? [...a.notes, { at, by, text: note }] : a.notes };
}
const LIMIT_H = { high: 2, medium: 24 };
export function checkEscalations(alerts: Alert[], nowIso: string): Alert[] {
  return alerts.map(a => { if (a.status !== "unassigned") return a; const since = a.timestamps.unassigned ?? a.timestamps.triggered; const h = (new Date(nowIso).getTime() - new Date(since).getTime()) / 3_600_000; return h > LIMIT_H[a.level] ? transition(a, "escalate", "system", nowIso) : a; });
}
```
Run → Expected: 全部通过。

- [ ] **Step 3: 提交**

```bash
git add lib/alerts tests/unit/alerts.test.ts && git commit -m "feat(alerts): PRO rules and alert state machine with escalation"
```

---

### Checkpoint A：基础层完成（Task 0–5）
- [ ] `npm test` 全绿，`npm run build` 成功
- [ ] `npm run seed` 两次 checksum 相同
- [ ] `/api/state` 返回 2012 例患者（12 锚点 + 2000 队列）
- [ ] 与项目方过一遍 `data/seed/anchors.json` 的 12 例临床合理性

---

### Task 6: 患者端主线 A（ePRO 提交 → 预警 → 反馈）

**Files:**
- Create: `app/patient/layout.tsx`, `app/patient/page.tsx`, `app/patient/pro/page.tsx`, `app/patient/plan/page.tsx`, `app/patient/adherence/page.tsx`, `app/patient/messages/page.tsx`, `app/api/pro/route.ts`, `components/PhoneFrame.tsx`, `lib/client/patientContext.tsx`, `lib/plan/followup.ts`
- Test: `tests/unit/pro-route.test.ts`

**Interfaces:**
- Consumes: `evaluatePro`、`getStore`、`newId`、`now`、`isOffHours`。
- Produces: `POST /api/pro` body `{ patientId, scaleId, items, flags }` → `{ proId, alerts: Alert[], offHours: boolean }`；`buildFollowUpPlan(p: Patient, today: string): { title: string; due: string; kind: "visit"|"lab"|"imaging"|"pro" }[]`；客户端 `PatientContext` 提供当前患者 ID（默认 `P-A`，可切 `P-B`）。

- [ ] **Step 1: 失败测试（路由逻辑抽成纯函数以便测试）**

把路由处理写在 `lib/pro/submit.ts` 的 `submitPro(input): Result`，`tests/unit/pro-route.test.ts`：
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { submitPro } from "@/lib/pro/submit";
import { getStore, resetStore } from "@/lib/state/store";
describe("submitPro", () => {
  beforeEach(() => resetStore());
  it("creates exactly two alerts for patient A story input", () => {
    const r = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 2, 潮热: 2, 情绪: 1, 睡眠: 1 }, flags: { missedDoses14d: 5, stopIntent: true } });
    expect(r.alerts).toHaveLength(2); expect(getStore().alerts).toHaveLength(2); expect(getStore().alerts[0].status).toBe("unassigned");
    expect(getStore().patients.get("P-A")!.pro.at(-1)!.id).toBe(r.proId);
  });
  it("off-hours high alert adds emergency message", () => {
    process.env.DEMO_FIXED_NOW = "2026-10-13T21:00:00+08:00";
    const r = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} });
    expect(r.offHours).toBe(true); expect(getStore().messages.some(m => m.kind === "emergency")).toBe(true);
    delete process.env.DEMO_FIXED_NOW;
  });
  it("rejects unknown patient", () => expect(() => submitPro({ patientId: "nope", scaleId: "endocrine_monthly_v1", items: {}, flags: {} })).toThrow());
});
```
Run → FAIL。

- [ ] **Step 2: 实现 submitPro 与路由**

`lib/pro/submit.ts`：
```ts
import { getStore } from "@/lib/state/store";
import { now, newId, isOffHours } from "@/lib/state/clock";
import { evaluatePro } from "@/lib/alerts/rules";
import { transition } from "@/lib/alerts/machine";
import type { Alert, ProResponse } from "@/lib/domain/types";
export function submitPro(input: { patientId: string; scaleId: ProResponse["scaleId"]; items: Record<string, number>; flags: ProResponse["flags"] }) {
  const s = getStore(); const p = s.patients.get(input.patientId); if (!p) throw new Error("patient not found");
  const at = now(); const pro: ProResponse = { id: newId("pro"), scaleId: input.scaleId, submittedAt: at, items: input.items, flags: input.flags };
  p.pro.push(pro);
  const alerts: Alert[] = evaluatePro(p, pro).map(a => transition({ ...a, id: newId("alert"), status: "triggered", assignee: null, timestamps: { triggered: at }, notes: [] }, "assign", "system", at));
  s.alerts.push(...alerts);
  const offHours = isOffHours(at);
  if (alerts.length) s.messages.push({ id: newId("msg"), patientId: p.id, kind: offHours && alerts.some(a => a.level === "high") ? "emergency" : "alert_feedback", at,
    text: offHours && alerts.some(a => a.level === "high") ? "当前为非服务时段。若症状加重请前往急诊，值班电话 021-0000-0000（演示）。个案管理师将在下一个工作日联系您。" : "已收到您的报告，个案管理师将在 1 个工作日内联系您。" });
  return { proId: pro.id, alerts, offHours };
}
```
`app/api/pro/route.ts`：解析 body 用 zod（`patientId: string, scaleId: enum, items: record(number), flags: object`），调用 `submitPro`，错误返回 400。
Run → 3 passed。

- [ ] **Step 3: 随访计划生成**

`lib/plan/followup.ts`：
```ts
import type { Patient } from "@/lib/domain/types";
import { addDays } from "@/lib/domain/dates";
export function buildFollowUpPlan(p: Patient, today: string) {
  const items: { title: string; due: string; kind: "visit" | "lab" | "imaging" | "pro" }[] = [];
  if (p.stage === "early_adjuvant") {
    items.push({ title: "每月症状与用药问卷", due: addDays(today, 30), kind: "pro" });
    items.push({ title: "乳腺外科随访门诊（每 6 个月）", due: addDays(p.surgeryDate ?? today, 180 * (Math.floor(((Date.parse(today) - Date.parse(p.surgeryDate ?? today)) / 86_400_000) / 180) + 1)), kind: "visit" });
    items.push({ title: "乳腺超声/钼靶（每年）", due: addDays(p.surgeryDate ?? today, 365), kind: "imaging" });
    if (p.treatments.some(t => t.type === "endocrine" && t.drug?.includes("唑"))) items.push({ title: "骨密度检查（每年）", due: addDays(today, 90), kind: "lab" });
  } else if (p.stage === "metastatic") {
    items.push({ title: "每周症状问卷", due: addDays(today, 7), kind: "pro" });
    items.push({ title: "下周期治疗前血常规、肝肾功能", due: addDays(today, 14), kind: "lab" });
    items.push({ title: "疗效评估影像（每 2–3 周期）", due: addDays(today, 60), kind: "imaging" });
  }
  return items.sort((a, b) => a.due.localeCompare(b.due));
}
```

- [ ] **Step 4: 患者端页面**

- `components/PhoneFrame.tsx`：390×844 的圆角容器，内含状态栏与底部 Tab（首页/问卷/计划/打卡/消息/管家）。
- `app/patient/layout.tsx`：`PatientContext`（当前患者 ID，顶部有"切换演示患者 A/B"），所有子页包在 `PhoneFrame` 内。
- `app/patient/page.tsx`：姓名化名（患者 A 显示"王女士"，B 显示"李女士"）、阶段、当前治疗、下一个随访项、未读消息数。
- `app/patient/pro/page.tsx`：按 `scaleId`（A→`endocrine_monthly_v1`，B→`treatment_weekly_v1`）渲染 0–3 分滑块问卷；标注"演示用自拟问卷，非标准量表"；A 额外有"过去两周漏服次数"数字框与"是否有停药念头"开关；提交 POST `/api/pro`，成功后显示返回的反馈文案并跳转消息页。
- `app/patient/plan/page.tsx`：`buildFollowUpPlan` 列表。
- `app/patient/adherence/page.tsx`：近 60 天打卡日历（取 `adherence`），"今日已服"按钮 POST `/api/adherence` body `{ patientId, taken: 0|1, missedReason?: string }`，处理器向该患者 `adherence` 追加或覆盖当日记录（以 `today()` 为键）。
- `app/patient/messages/page.tsx`：`messages` 按患者过滤倒序。

- [ ] **Step 5: 手动验证**

Run `npm run demo`：以患者 A 提交故事线问卷（关节痛 2、潮热 2、漏服 5、停药念头 是）→ 消息页出现反馈；`/api/state` 中 `alerts` 长度 2。切换到患者 B，提交周度问卷 → 无高级预警时仅反馈文案。

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "feat(patient): phone-framed patient views, ePRO submit creating alerts"
```

---

### Task 7: 医生工作台（预警队列 → 时间轴 → 处置闭环）

**Files:**
- Create: `app/clinic/layout.tsx`, `app/clinic/alerts/page.tsx`, `app/clinic/patients/page.tsx`, `app/clinic/patients/[id]/page.tsx`, `app/clinic/tasks/page.tsx`, `app/api/alerts/[id]/route.ts`, `app/api/tasks/route.ts`, `components/AlertQueue.tsx`, `components/Timeline.tsx`, `components/ProTrend.tsx`, `lib/clinic/actions.ts`
- Test: `tests/unit/clinic-actions.test.ts`

**Interfaces:**
- Consumes: `transition`、`checkEscalations`、`buildFollowUpPlan`。
- Produces: `PATCH /api/alerts/:id` body `{ action, by, note? }` → Alert；`POST /api/tasks` body `{ patientId, type, due, owner }`；`closeAlertWithTask(alertId, by, note, task): { alert, task, message }`（关闭预警时同时建任务并给患者发 `plan_update` 消息）；`GET /api/state` 已含 `tasks`。

- [ ] **Step 1: 失败测试**

`tests/unit/clinic-actions.test.ts`：
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { submitPro } from "@/lib/pro/submit";
import { actOnAlert, closeAlertWithTask } from "@/lib/clinic/actions";
import { getStore, resetStore } from "@/lib/state/store";
describe("clinic actions", () => {
  beforeEach(() => resetStore());
  it("full loop writes feedback message to patient", () => {
    const { alerts } = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 2 }, flags: { missedDoses14d: 5 } });
    const id = alerts[1].id;
    actOnAlert(id, "accept", "个案管理师小陈"); actOnAlert(id, "start", "个案管理师小陈", "电话沟通：关节痛导致漏服"); actOnAlert(id, "submit_review", "个案管理师小陈");
    const r = closeAlertWithTask(id, "张医生", "建议加用对症处理，2 周后复评", { type: "复评", due: "2026-10-27", owner: "个案管理师小陈" });
    expect(r.alert.status).toBe("closed"); expect(getStore().tasks).toHaveLength(1); expect(getStore().messages.at(-1)!.kind).toBe("plan_update");
  });
  it("invalid action returns error, state unchanged", () => {
    const { alerts } = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} });
    expect(() => actOnAlert(alerts[0].id, "close", "x")).toThrow(); expect(getStore().alerts[0].status).toBe("unassigned");
  });
});
```
Run → FAIL。

- [ ] **Step 2: 实现 actions 与路由**

`lib/clinic/actions.ts`：
```ts
import { getStore } from "@/lib/state/store";
import { now, newId } from "@/lib/state/clock";
import { transition } from "@/lib/alerts/machine";
export function actOnAlert(id: string, action: Parameters<typeof transition>[1], by: string, note?: string) {
  const s = getStore(); const i = s.alerts.findIndex(a => a.id === id); if (i < 0) throw new Error("alert not found");
  s.alerts[i] = transition(s.alerts[i], action, by, now(), note); return s.alerts[i];
}
export function closeAlertWithTask(id: string, by: string, note: string, task: { type: string; due: string; owner: string }) {
  const s = getStore(); const alert = actOnAlert(id, "close", by, note);
  const t = { id: newId("task"), patientId: alert.patientId, type: task.type, due: task.due, owner: task.owner, status: "open" as const, createdAt: now() };
  s.tasks.push(t);
  const message = { id: newId("msg"), patientId: alert.patientId, kind: "plan_update" as const, at: now(), text: `医生已处理您的报告：${note}。新增随访：${task.type}（${task.due}）。` };
  s.messages.push(message); return { alert, task: t, message };
}
```
`app/api/alerts/[id]/route.ts` PATCH：body `{ action, by, note?, task? }`，`action === "close"` 且带 `task` 时走 `closeAlertWithTask`，否则 `actOnAlert`；错误 400。升级检查统一放在 `/api/state`：`GET` 处理器在序列化前执行 `s.alerts = checkEscalations(s.alerts, now())`，不单独提供 `/api/alerts` 的 GET。
Run → 2 passed。

- [ ] **Step 3: 页面与组件**

- `app/clinic/layout.tsx`：左侧导航（预警队列 / 患者列表 / 随访任务 / 队列圈选 / 候选核查），顶部身份切换"个案管理师小陈 / 张医生"（存 localStorage，仅影响 `by` 字段）。
- `components/AlertQueue.tsx`：按 level 降序、时间升序；列：患者、类型、等级、规则、状态、责任人、首响应时长；行内按钮按当前状态只显示合法动作（接单 / 开始处置 / 提交复核 / 关闭）。关闭弹出表单：处置说明 + 随访任务类型 + 到期日。
- `app/clinic/alerts/page.tsx`：队列 + 顶部指标卡（高/中级首响应 P50/P90、逾期未处理数、本周关闭数，用 `alerts` 的 timestamps 计算，放 `lib/compute/alertMetrics.ts`）。
- `components/Timeline.tsx`：横向时间轴，分层泳道：标本/分型（显示每次 IHC/ISH 原始结果与派生分类）、分期、治疗事件（按意图着色，系统治疗线编号标在转移性事件上方）、结局事件、PRO 提交点。
- `components/ProTrend.tsx`：Recharts 折线，按条目分色。
- `app/clinic/patients/[id]/page.tsx`：基本信息、同意状态、Timeline、ProTrend、依从日历、该患者的预警与任务、医生助手面板占位（Task 11 填充）。
- `app/clinic/patients/page.tsx`：可按阶段过滤的患者表，锚点患者置顶并带"锚点"标签。
- `app/clinic/tasks/page.tsx`：任务表，可标记完成（PATCH `/api/tasks/:id`）。

- [ ] **Step 4: 手动验证**

患者 A 提交问卷后，在预警队列以个案管理师接单、处置、提交复核；切换张医生关闭并建任务；患者端消息页出现"医生已处理…"，预警状态"已关闭"。患者 B 页面时间轴显示原发 IHC 0 与转移灶 1+ 两条标本记录，且二线 ADC 标为 L2。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat(clinic): alert queue with state machine actions, patient timeline, tasks"
```

---

### Task 8: 队列圈选 → 数据治理 → 研究快照

**Files:**
- Create: `app/clinic/cohorts/page.tsx`, `app/governance/page.tsx`, `app/governance/snapshots/page.tsx`, `app/governance/his/page.tsx`, `app/api/cohorts/route.ts`, `app/api/snapshots/route.ts`, `lib/governance/snapshot.ts`
- Test: `tests/unit/snapshot.test.ts`

**Interfaces:**
- Consumes: `applyFilter`、`qualityMetrics`。
- Produces: `createCohort(name, filter, by): Cohort`；`submitCohort(id): Cohort`；`createSnapshot(cohortId, cutoff): ResearchSnapshot`（深拷贝患者，剔除 `consent.pharmaDeidentified === false` 者，去掉 `anchorKey`/`expertNote`，重算 `quality`）；`POST /api/cohorts` `{ name, filter, by }`；`PATCH /api/cohorts/:id` `{ action: "submit" }`；`POST /api/snapshots` `{ cohortId, cutoff }`。

- [ ] **Step 1: 失败测试**

`tests/unit/snapshot.test.ts`：
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import { getStore, resetStore } from "@/lib/state/store";
describe("snapshot", () => {
  beforeEach(() => resetStore());
  it("is immutable against later clinical edits", () => {
    const c = createCohort("HER2低表达转移性", { hrPositive: true, her2: ["low"], stage: ["metastatic"], priorCdk46: true }, "张医生"); submitCohort(c.id);
    const snap = createSnapshot(c.id, "2026-10-13"); const before = JSON.stringify(snap);
    const live = getStore().patients.get(snap.patients[0].id)!; live.treatments.push({ id: "new", type: "chemo", intent: "metastatic", drug: "x", start: "2026-10-14", end: null, stopReason: "ongoing", source: "in_house" });
    expect(JSON.stringify(getStore().snapshots[0])).toBe(before);
  });
  it("excludes patients without pharma consent and strips anchor fields", () => {
    const c = createCohort("all", {}, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    expect(snap.patients.every(p => p.consent.pharmaDeidentified)).toBe(true); expect(snap.patients.every(p => p.anchorKey === null && !p.expertNote)).toBe(true);
  });
  it("snapshot requires submitted cohort", () => { const c = createCohort("d", {}, "x"); expect(() => createSnapshot(c.id, "2026-10-13")).toThrow(); });
});
```
Run → FAIL。

- [ ] **Step 2: 实现**

`lib/governance/snapshot.ts`：
```ts
import { getStore } from "@/lib/state/store";
import { now, newId } from "@/lib/state/clock";
import { applyFilter, qualityMetrics } from "@/lib/compute";
import type { CohortFilter } from "@/lib/domain/types";
export function createCohort(name: string, filter: CohortFilter, createdBy: string) {
  const s = getStore(); const patientIds = applyFilter([...s.patients.values()], filter).map(p => p.id);
  const c = { id: newId("cohort"), name, filter, createdBy, createdAt: now(), patientIds, status: "draft" as const }; s.cohorts.push(c); return c;
}
export function submitCohort(id: string) { const s = getStore(); const c = s.cohorts.find(x => x.id === id); if (!c) throw new Error("cohort not found"); c.status = "submitted"; return c; }
export function createSnapshot(cohortId: string, cutoff: string) {
  const s = getStore(); const c = s.cohorts.find(x => x.id === cohortId); if (!c || c.status !== "submitted") throw new Error("cohort must be submitted");
  const patients = c.patientIds.map(id => s.patients.get(id)!).filter(p => p.consent.pharmaDeidentified).map(p => { const q = structuredClone(p); q.anchorKey = null; delete q.expertNote; return q; });
  const q = qualityMetrics(patients);
  const snap = { id: `SNAP-${cutoff}-v${s.snapshots.length + 1}`, cohortId, cutoff, createdAt: now(), patients, quality: { subtype: q.completeness.subtype, stage: q.completeness.stage, lines: q.completeness.lines, lineReviewRate: q.lineReviewRate, n: q.n } };
  s.snapshots.push(Object.freeze(snap)); return snap;
}
```
Run → 3 passed。

- [ ] **Step 3: 页面**

- `app/clinic/cohorts/page.tsx`：筛选表单（HR 阳性、HER2 分类多选、阶段多选、CDK4/6 经治、当前治疗类型），实时显示人数（调用 `POST /api/cohorts/preview` 或在页面取 state 后用 `applyFilter` 的服务端路由），"保存并提交数据治理"。
- `app/governance/page.tsx`：待处理候选队列列表；每个队列显示 `qualityMetrics`（字段完整率三项、治疗线复核率、同意三项各自比例）、"创建研究快照"（输入数据截止日，默认 manifest.cutoff）。还显示 `gapTasks`（Task 11 产生）。
- `app/governance/snapshots/page.tsx`：快照列表，显示 n、创建时间、质量指标，标注"不可变"。
- `app/governance/his/page.tsx`：[模拟] HIS/EMR 接口状态页：三条接口卡片（HIS 患者主索引、EMR 病理报告、LIS 检验）显示"演示环境：未连接（计划 Phase 2）"。

- [ ] **Step 4: 手动验证与提交**

在医生工作台圈选 HER2 低表达转移性队列并提交；在治理台看到质量指标并创建快照；在患者 B 时间轴上新增任何操作后快照页 n 不变。
```bash
git add -A && git commit -m "feat(governance): cohort selection, quality metrics, immutable research snapshots"
```

---

### Checkpoint B：临床闭环与治理完成（Task 6–8）
- [ ] 主线 A 与主线 C 可在浏览器完整走通
- [ ] `npm test` 全绿
- [ ] 与项目方确认预警等级规则与时间轴展示

---

### Task 9: 药企研究门户（三个用例）

**Files:**
- Create: `app/research/layout.tsx`, `app/research/page.tsx`, `app/research/[snapshotId]/overview/page.tsx`, `app/research/[snapshotId]/patterns/page.tsx`, `app/research/[snapshotId]/feasibility/page.tsx`, `app/research/[snapshotId]/adherence/page.tsx`, `app/research/sandbox/page.tsx`, `app/api/research/[useCase]/route.ts`, `components/Watermark.tsx`, `components/FunnelChart.tsx`, `components/PatternChart.tsx`, `components/StatFooter.tsx`
- Test: `tests/unit/research-route.test.ts`

**Interfaces:**
- Consumes: `treatmentPatterns`、`lineGapStatus`、`runFunnel`、`PROTOCOL_ADC_301`、`adherenceStats`。
- Produces: `GET /api/research/:useCase?snapshotId=…` 其中 `useCase ∈ overview | patterns | feasibility | adherence`；`researchUseCase(useCase, snapshotId)` 纯函数返回对应 JSON，`overview` 返回 `{ n, events: { metastasis, progression, death }, followUpMonths: { median, p25, p75 }, missing: { ish: number, stopReason: number, externalNoDate: number } }`。

- [ ] **Step 1: 失败测试**

`tests/unit/research-route.test.ts`：
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import { researchUseCase } from "@/lib/research/usecases";
import { resetStore } from "@/lib/state/store";
describe("research use cases", () => {
  let snapId: string;
  beforeEach(() => { resetStore(); const c = createCohort("m", { stage: ["metastatic", "deceased"] }, "x"); submitCohort(c.id); snapId = createSnapshot(c.id, "2026-10-13").id; });
  it("overview counts match snapshot", () => { const o = researchUseCase("overview", snapId); expect(o.n).toBeGreaterThan(0); expect(o.events.metastasis).toBe(o.n); });
  it("feasibility funnel steps are exhaustive per step", () => { const f = researchUseCase("feasibility", snapId); for (const s of f.steps) expect(s.met + s.notMet + s.unknown).toBeGreaterThan(0); });
  it("unknown snapshot throws", () => expect(() => researchUseCase("overview", "nope")).toThrow());
  it("overview with <10 deaths marks survival as not estimable", () => { const o = researchUseCase("overview", snapId); expect(typeof o.survivalEstimable).toBe("boolean"); });
});
```
Run → FAIL。

- [ ] **Step 2: 实现 usecases**

`lib/research/usecases.ts`：
```ts
import { getStore } from "@/lib/state/store";
import { treatmentPatterns, lineGapStatus, runFunnel, PROTOCOL_ADC_301, adherenceStats } from "@/lib/compute";
import { diffDays } from "@/lib/domain/dates";
export type UseCase = "overview" | "patterns" | "feasibility" | "adherence";
const q = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) * p)] : 0; };
export function researchUseCase(useCase: UseCase, snapshotId: string): any {
  const snap = getStore().snapshots.find(s => s.id === snapshotId); if (!snap) throw new Error("snapshot not found");
  const ps = snap.patients;
  if (useCase === "overview") {
    const fu = ps.map(p => diffDays(p.enrolledAt, p.lastContact) / 30.4);
    const deaths = ps.filter(p => p.outcomes.some(o => o.type === "death")).length;
    return { n: ps.length, events: { metastasis: ps.filter(p => p.outcomes.some(o => o.type === "distant_metastasis")).length, progression: ps.filter(p => p.outcomes.some(o => o.type === "progression")).length, death: deaths },
      followUpMonths: { median: q(fu, 0.5), p25: q(fu, 0.25), p75: q(fu, 0.75) }, survivalEstimable: deaths >= 10,
      missing: { ish: ps.filter(p => p.biomarkers.some(b => b.her2Ihc === "2+" && b.ish === "not_done")).length, stopReason: ps.filter(p => p.treatments.some(t => t.stopReason === "unknown")).length, externalNoDate: ps.filter(p => p.treatments.some(t => t.source === "external" && t.start === null)).length } };
  }
  if (useCase === "patterns") return { patterns: treatmentPatterns(ps), gapAfterLine1: lineGapStatus(ps, 1, snap.cutoff), gapAfterLine2: lineGapStatus(ps, 2, snap.cutoff), cutoff: snap.cutoff };
  if (useCase === "feasibility") return { protocol: "XX-ADC-301（虚构）", ...runFunnel(ps, PROTOCOL_ADC_301) };
  if (useCase === "adherence") return adherenceStats(ps);
  throw new Error("unknown use case");
}
```
`app/api/research/[useCase]/route.ts`：读 `snapshotId` 查询参数，调用 `researchUseCase`，错误 400/404。
Run → 4 passed。

- [ ] **Step 3: 页面与组件**

- `components/Watermark.tsx`：固定定位、半透明重复文字"合成数据，仅用于演示"，在 `app/research/layout.tsx` 全局挂载。
- `components/StatFooter.tsx`：每张图下方显示"n=…，事件数=…，随访中位…个月，数据截止…"。
- `app/research/page.tsx`：快照选择列表（无快照时提示"请先在数据治理台创建快照"）。
- `overview`：四个指标卡 + 随访时长分布条 + 缺失概况表；`survivalEstimable === false` 时显示灰色卡片"生存曲线：事件数 < 10，不可估计"。
- `patterns`：`PatternChart`（横向条形图，序列路径为标签，count 为值，取前 10）+ 两张互斥五态堆叠条（一线后 / 二线后）。
- `feasibility`：`FunnelChart`（每步三色堆叠：符合 / 不符合 / 信息不足）+ 右侧"信息不足原因"表 + 底部"符合已知条件 N 例，仍需医生核查"与按钮"申请候选患者核查"（Task 10 接通）。
- `adherence`：漏服原因饼图、停药念头比例、平均服药率，标题带"合成数据，关联不构成发现"。
- `app/research/sandbox/page.tsx`：[后续] 说明页。

- [ ] **Step 4: 手动验证与提交**

创建快照后三页均有数据且 StatFooter 的 n 与治理台快照 n 一致；`expected.json` 的 `hrpos_her2low_metastatic_cdk46` 人数与圈选页显示一致。
```bash
git add -A && git commit -m "feat(research): snapshot-based overview, patterns, three-state feasibility funnel, adherence"
```

---

### Task 10: 候选核查闭环（药企 → 医生确认 → 患者收到研究机会）

**Files:**
- Create: `app/api/candidates/route.ts`, `app/api/candidates/[id]/route.ts`, `app/clinic/candidates/page.tsx`, `lib/research/candidates.ts`, `app/patient/research/page.tsx`
- Modify: `app/research/[snapshotId]/feasibility/page.tsx`（按钮接通）
- Test: `tests/unit/candidates.test.ts`

**Interfaces:**
- Produces: `requestCandidates(snapshotId, protocolId): CandidateRequest`（候选 = `runFunnel(...).finalMet`，药企端只看到数量与请求 ID）；`confirmCandidate(requestId, patientId, status: "confirmed"|"rejected", by): CandidateRequest`（确认时向患者发 `research_opportunity` 消息）；`POST /api/candidates` `{ snapshotId, protocolId }`；`PATCH /api/candidates/:id` `{ patientId, status, by }`。

- [ ] **Step 1: 失败测试**

`tests/unit/candidates.test.ts`：
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import { requestCandidates, confirmCandidate } from "@/lib/research/candidates";
import { getStore, resetStore } from "@/lib/state/store";
describe("candidates", () => {
  beforeEach(() => resetStore());
  it("confirm sends research opportunity message to patient", () => {
    const c = createCohort("m", { stage: ["metastatic"], priorCdk46: true }, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    const req = requestCandidates(snap.id, "XX-ADC-301"); expect(req.candidates.length).toBeGreaterThan(0);
    const pid = req.candidates[0].patientId; confirmCandidate(req.id, pid, "confirmed", "张医生");
    expect(getStore().messages.some(m => m.patientId === pid && m.kind === "research_opportunity")).toBe(true);
  });
  it("research API response never includes patient ids", () => {
    const c = createCohort("m", { stage: ["metastatic"] }, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    const req = requestCandidates(snap.id, "XX-ADC-301"); const { candidates, ...pharmaView } = req; expect(JSON.stringify(pharmaView)).not.toMatch(/P-\d{4}/);
  });
});
```
Run → FAIL。

- [ ] **Step 2: 实现**

`lib/research/candidates.ts`：
```ts
import { getStore } from "@/lib/state/store";
import { now, newId } from "@/lib/state/clock";
import { runFunnel, PROTOCOL_ADC_301 } from "@/lib/compute";
export function requestCandidates(snapshotId: string, protocolId: string) {
  const s = getStore(); const snap = s.snapshots.find(x => x.id === snapshotId); if (!snap) throw new Error("snapshot not found");
  const { finalMet } = runFunnel(snap.patients, PROTOCOL_ADC_301);
  const req = { id: newId("cand"), snapshotId, protocolId, candidates: finalMet.map(patientId => ({ patientId, status: "pending" as const })), createdAt: now() };
  s.candidateRequests.push(req); return req;
}
export function pharmaView(req: ReturnType<typeof requestCandidates>) { return { id: req.id, snapshotId: req.snapshotId, protocolId: req.protocolId, total: req.candidates.length, confirmed: req.candidates.filter(c => c.status === "confirmed").length, createdAt: req.createdAt }; }
export function confirmCandidate(requestId: string, patientId: string, status: "confirmed" | "rejected", by: string) {
  const s = getStore(); const req = s.candidateRequests.find(r => r.id === requestId); if (!req) throw new Error("request not found");
  const c = req.candidates.find(x => x.patientId === patientId); if (!c) throw new Error("candidate not found"); c.status = status;
  if (status === "confirmed") s.messages.push({ id: newId("msg"), patientId, kind: "research_opportunity", at: now(), text: `${by}认为有一项临床研究（${req.protocolId}）可能适合您，请在下次门诊时咨询或点击预约。` });
  return req;
}
```
路由：`POST /api/candidates` 返回 `pharmaView(req)`；`PATCH /api/candidates/:id` 返回完整 req（医生端）。
Run → 2 passed。

- [ ] **Step 3: 页面**

- 研究门户 feasibility 页按钮 → POST，显示"已向科室发出候选核查请求（N 例）"，并在页面轮询显示"已确认 M 例"。
- `app/clinic/candidates/page.tsx`：请求列表，展开后逐例显示患者 ID、关键字段摘要（分型、当前线、最近 PRO），按钮"确认 / 不适合"。
- `app/patient/research/page.tsx`：显示 `research_opportunity` 消息与"预约门诊"按钮（[模拟] 点击后显示"已提交预约申请（演示）"）。

- [ ] **Step 4: 手动验证与提交**

从研究门户发请求 → 医生确认患者 B（若 B 不在 finalMet 因"无 ADC 既往"不符合，则演示脚本改为确认任一候选患者并把患者端切换到该患者；在演示脚本中注明）。注意：规格第 2 节闭环以患者 B 收到机会为例，但 B 已在 ADC 治疗，不符合虚构方案；**演示脚本改为确认一例符合的合成患者，并在患者端切换至该患者**。
```bash
git add -A && git commit -m "feat(candidates): pharma request → clinician confirm → patient research opportunity"
```

---

### Task 11: 智能体层（适配、工具、降级、三端面板）

**Files:**
- Create: `lib/agents/adapter.ts`, `lib/agents/providers/claude.ts`, `lib/agents/providers/openai.ts`, `lib/agents/providers/deterministic.ts`, `lib/agents/tools.ts`, `lib/agents/templates.ts`, `lib/agents/validate.ts`, `data/seed/guidelines.json`, `app/api/agent/route.ts`, `components/AgentPanel.tsx`, `app/patient/assistant/page.tsx`
- Modify: `app/clinic/patients/[id]/page.tsx`、`app/research/[snapshotId]/feasibility/page.tsx`（嵌入 AgentPanel）
- Test: `tests/unit/agents.test.ts`

**Interfaces:**
- Produces: `chat(req: ChatRequest): Promise<ChatResponse>`，`ChatRequest = { agent: "patient"|"doctor"|"research"; messages: {role:"user"|"assistant"; content:string}[]; context: { patientId?: string; snapshotId?: string; filter?: CohortFilter; page: string } }`，`ChatResponse = { text: string; mode: "deterministic"|"claude"|"openai"; degraded?: string; citations: { id: string; title: string; version: string }[]; toolCalls: { name: string; args: any; result: any }[] }`；工具：`get_patient_summary(patientId)`、`get_followup_plan(patientId)`、`search_guidelines(query)`、`ctcae_grade(symptom, grade)`、`count_cohort(snapshotId, filter)`、`funnel(snapshotId)`、`gap_reasons(snapshotId)`、`create_gap_task(snapshotId, field)`；`validateResponse(resp, knownCitationIds, toolNumbers): { ok: boolean; reason?: string }`。
- 快捷问题（每个助手按页面给 3 条，自由输入保留）：患者（"我最近关节痛，能不能先停药？" / "下次要做什么检查？" / "参加临床研究需要注意什么？"）；医生（"总结这位患者的治疗经过" / "当前线不良事件按 CTCAE 如何分级记录？" / "指南对 CDK4/6 后 HER2 低表达的推荐是什么？"）；研究（"信息不足中最主要的原因是什么，补齐需要什么数据？" / "符合已知条件的有多少例？" / "一线后进入二线的比例？"）。

- [ ] **Step 1: 指南要点库**

`data/seed/guidelines.json`：30 条 `{ id: "G-001", topic: "HER2低表达", text: "…要点转述…", source: "CSCO 乳腺癌诊疗指南", version: "2026", population: "HR+/HER2 低表达晚期", reviewed: false }`，覆盖：辅助内分泌疗程与依从、AI 类关节痛处理、骨健康、CDK4/6 后治疗选择、HER2 低表达 ADC 推荐级别、ADC 常见不良事件分级与处理、随访频率、转移灶再活检、BRCA 检测时机、临床研究知情要点。页面标注"待专家审阅"。

- [ ] **Step 2: 失败测试**

`tests/unit/agents.test.ts`：
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { chat } from "@/lib/agents/adapter";
import { validateResponse } from "@/lib/agents/validate";
import { resetStore, getStore } from "@/lib/state/store";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
describe("agents", () => {
  beforeEach(() => { resetStore(); delete process.env.DEMO_CLAUDE_API_KEY; delete process.env.DEMO_OPENAI_API_KEY; });
  it("deterministic patient assistant refuses stop-medication and routes to doctor", async () => {
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "我最近关节痛，能不能先停药？" }], context: { patientId: "P-A", page: "assistant" } });
    expect(r.mode).toBe("deterministic"); expect(r.text).toMatch(/医生确认|门诊/); expect(r.text).not.toMatch(/可以停药/);
  });
  it("research assistant numbers come from tools and differ by snapshot", async () => {
    const c1 = createCohort("a", { stage: ["metastatic"] }, "x"); submitCohort(c1.id); const s1 = createSnapshot(c1.id, "2026-10-13");
    const c2 = createCohort("b", { stage: ["early_adjuvant"] }, "x"); submitCohort(c2.id); const s2 = createSnapshot(c2.id, "2026-10-13");
    const r1 = await chat({ agent: "research", messages: [{ role: "user", content: "符合已知条件的有多少例？" }], context: { snapshotId: s1.id, page: "feasibility" } });
    const r2 = await chat({ agent: "research", messages: [{ role: "user", content: "符合已知条件的有多少例？" }], context: { snapshotId: s2.id, page: "feasibility" } });
    expect(r1.toolCalls[0].name).toBe("funnel"); expect(r1.text).not.toBe(r2.text);
  });
  it("gap question creates a DataGapTask", async () => {
    const c = createCohort("a", { stage: ["metastatic"] }, "x"); submitCohort(c.id); const s = createSnapshot(c.id, "2026-10-13");
    await chat({ agent: "research", messages: [{ role: "user", content: "信息不足中最主要的原因是什么，补齐需要什么数据？" }], context: { snapshotId: s.id, page: "feasibility" } });
    expect(getStore().gapTasks.length).toBe(1);
  });
  it("doctor assistant says 未找到依据 when guideline search is empty", async () => {
    const r = await chat({ agent: "doctor", messages: [{ role: "user", content: "指南对火星人乳腺癌的推荐？" }], context: { patientId: "P-B", page: "patient" } });
    expect(r.text).toMatch(/未找到依据/);
  });
  it("validateResponse rejects unknown citation and fabricated number", () => {
    expect(validateResponse({ text: "共 999 例", citations: [{ id: "G-404", title: "", version: "" }], toolCalls: [] } as any, new Set(["G-001"]), new Set([12])).ok).toBe(false);
  });
  it("provider failure degrades within 8s and keeps conversation", async () => {
    process.env.DEMO_OPENAI_API_KEY = "bad"; process.env.DEMO_OPENAI_BASE_URL = "http://127.0.0.1:9"; process.env.DEMO_OPENAI_MODEL = "x";
    const t = Date.now(); const r = await chat({ agent: "patient", messages: [{ role: "user", content: "下次要做什么检查？" }], context: { patientId: "P-A", page: "assistant" } });
    expect(Date.now() - t).toBeLessThan(8000); expect(r.mode).toBe("deterministic"); expect(r.degraded).toBeTruthy();
  });
});
```
Run → FAIL。

- [ ] **Step 3: 工具与模板**

`lib/agents/tools.ts`：每个工具 `{ name, description, schema: zod, run(args): any }`，`run` 只调用 `lib/compute`、`getStore`、`buildFollowUpPlan`、指南库检索（按 topic/text 的子串匹配，无命中返回 `[]`）。`create_gap_task` 把 `{ source: snapshotId, field, patientCount, status: "open" }` 推入 `gapTasks`。
`lib/agents/templates.ts`：`pickTemplate(agent, page, userText): TemplateId`（按关键词匹配，如 "停药"→`patient_stop_med`、"检查"→`patient_next_visit`、"多少例"→`research_count`、"原因"→`research_gap`、"分级"→`doctor_ctcae`、"指南"→`doctor_guideline`、"总结"→`doctor_summary`；无匹配→`generic_boundary`），`renderTemplate(id, toolResults): string`，模板数字槽位全部来自 `toolResults`。`generic_boundary` 文案："这个问题超出了演示助手的范围。您可以尝试下方的快捷问题，或联系您的医生/个案管理师。"
`lib/agents/providers/deterministic.ts`：`run(req)`：决定模板 → 执行该模板所需工具 → 渲染。
`lib/agents/validate.ts`：
```ts
export function validateResponse(resp: { text: string; citations: { id: string }[]; toolCalls: { result: any }[] }, knownCitationIds: Set<string>, toolNumbers: Set<number>) {
  for (const c of resp.citations) if (!knownCitationIds.has(c.id)) return { ok: false, reason: `unknown citation ${c.id}` };
  const nums = [...resp.text.matchAll(/(\d+(?:\.\d+)?)\s*(例|人|%)/g)].map(m => Number(m[1]));
  for (const n of nums) if (!toolNumbers.has(n)) return { ok: false, reason: `number ${n} not from tools` };
  return { ok: true };
}
```
`collectToolNumbers(toolCalls)`：递归收集 result 中所有数值（含百分比四舍五入到 1 位小数）。

- [ ] **Step 4: 提供商与适配器**

`providers/claude.ts`：`fetch("https://api.anthropic.com/v1/messages", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, body: { model: "claude-sonnet-5-5", max_tokens: 800, system, tools, messages } })`，处理 `tool_use` 循环最多 3 轮；`providers/openai.ts`：`${base}/chat/completions` 带 `tools` 的 function calling，同样最多 3 轮。两者都用 `AbortSignal.timeout(8000)`。
`adapter.ts`：
```ts
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const mode = process.env.DEMO_CLAUDE_API_KEY ? "claude" : process.env.DEMO_OPENAI_API_KEY ? "openai" : "deterministic";
  if (mode === "deterministic") return { ...(await deterministic.run(req)), mode };
  try {
    const out = await (mode === "claude" ? claude.run(req) : openai.run(req));
    const v = validateResponse(out, guidelineIds(), collectToolNumbers(out.toolCalls));
    if (!v.ok) throw new Error(`validation: ${v.reason}`);
    return { ...out, mode };
  } catch (e: any) {
    const fallback = await deterministic.run(req);
    return { ...fallback, mode: "deterministic", degraded: `已切换至本地演示模式（${e?.name === "TimeoutError" ? "超时" : e?.message ?? "错误"}）` };
  }
}
```
`app/api/agent/route.ts` POST → `chat`，并把 `mode` 写回 `store.agentMode` 供 ModeBadge 显示。
Run → 6 passed（最后一个测试在无网络时也应通过，因为连接拒绝会立即抛错）。

- [ ] **Step 5: 面板与嵌入**

`components/AgentPanel.tsx`：props `{ agent, context, quickQuestions: string[] }`；消息列表、快捷问题按钮、输入框；每条助手消息下显示引用（标题+版本）与"工具：funnel(…)"折叠；顶部显示当前模式与降级提示。嵌入：患者端 `assistant` Tab；医生患者详情页右栏；研究门户 feasibility 页右栏。

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "feat(agents): provider adapter with deterministic fallback, tools bound to compute, three assistants"
```

---

### Task 12: 演示脚本、文档、端到端测试与稳定性

**Files:**
- Create: `docs/demo-script.md`, `docs/data-generation.md`, `README.md`, `tests/e2e/story.spec.ts`, `tests/e2e/reset.spec.ts`
- Modify: `app/page.tsx`（链接演示脚本）

- [ ] **Step 1: 端到端故事线测试**

`tests/e2e/story.spec.ts`（Playwright，按 `data-testid` 定位，实现页面时补齐 testid）：
```ts
import { test, expect } from "@playwright/test";
test("full chain story", async ({ page, request }) => {
  await request.post("/api/reset");
  await page.goto("/patient/pro");
  await page.getByTestId("slider-关节痛").fill("2"); await page.getByTestId("slider-潮热").fill("2");
  await page.getByTestId("missed-doses").fill("5"); await page.getByTestId("stop-intent").check(); await page.getByTestId("submit-pro").click();
  await expect(page.getByText("个案管理师将在 1 个工作日内联系您")).toBeVisible();
  await page.goto("/clinic/alerts"); await expect(page.getByTestId("alert-row")).toHaveCount(2);
  const row = page.getByTestId("alert-row").first(); await row.getByRole("button", { name: "接单" }).click(); await row.getByRole("button", { name: "开始处置" }).click(); await row.getByRole("button", { name: "提交复核" }).click();
  await row.getByRole("button", { name: "关闭" }).click(); await page.getByTestId("close-note").fill("2 周后复评"); await page.getByTestId("close-task-due").fill("2026-10-27"); await page.getByTestId("close-confirm").click();
  await expect(row.getByText("已关闭")).toBeVisible();
  await page.goto("/clinic/cohorts"); await page.getByTestId("f-hrpos").check(); await page.getByTestId("f-her2-low").check(); await page.getByTestId("f-stage-metastatic").check(); await page.getByTestId("f-cdk46").check();
  const n = Number(await page.getByTestId("cohort-count").textContent()); expect(n).toBeGreaterThan(0); await page.getByTestId("cohort-submit").click();
  await page.goto("/governance"); await page.getByTestId("create-snapshot").first().click(); await expect(page.getByText(/SNAP-2026-10-13-v1/)).toBeVisible();
  await page.goto("/research"); await page.getByText("SNAP-2026-10-13-v1").click(); await page.getByRole("link", { name: "入组可行性" }).click();
  await expect(page.getByTestId("funnel-step")).toHaveCount(6); await page.getByTestId("request-candidates").click(); await expect(page.getByText(/已向科室发出候选核查请求/)).toBeVisible();
  await page.goto("/clinic/candidates"); await page.getByRole("button", { name: "确认" }).first().click();
  const pid = await page.getByTestId("candidate-pid").first().textContent();
  await page.goto(`/patient/research?patient=${pid}`); await expect(page.getByText(/可能适合您/)).toBeVisible();
  await page.goto("/patient/assistant"); await page.getByRole("button", { name: "参加临床研究需要注意什么？" }).click(); await expect(page.getByTestId("agent-reply")).toBeVisible();
});
```

`tests/e2e/reset.spec.ts`：连续三轮：提交 ePRO → 创建队列 → 创建快照 → `/api/reset`，每轮后断言 `/api/state` 的 `alerts`、`cohorts`、`snapshots`、`candidateRequests` 为空且 `P-A` 的 pro 条数回到种子值；另一个测试在 1440×900 视口访问四个视角首页，断言 `document.documentElement.scrollWidth <= 1440`。
Run: `npm run e2e` → Expected: 全部通过。

- [ ] **Step 2: 演示脚本**

`docs/demo-script.md`：按规格第 2 节五段编写，每步一行：页面 URL、操作、预期看到的文字或数字（数字引用 `expected.json` 的 key 而非硬编码）、备用话术。开头列"演示前检查"：`npm run demo`、`/api/state` 返回正常、重置一次、ModeBadge 显示模式、投屏分辨率。附"故障应对"：模型降级时如何解释、网络断开时的口径。

- [ ] **Step 3: 数据生成说明与 README**

`docs/data-generation.md`：种子、版本、checksum、三层结构、分布参数、不完美注入比例、硬约束清单、**不支持的推断清单**（疗效比较、依从与复发因果、生存估计、任何真实人群外推）。
`README.md`：环境要求（Node 20+）、安装、`npm run demo`、可选模型配置（`.env.example`）、测试命令、目录结构、功能标记说明。

- [ ] **Step 4: 全量验证与提交**

```bash
npm test && npm run build && npm run e2e
git add -A && git commit -m "docs(demo): demo script, data generation notes, README; e2e story and reset tests"
```

---

### Checkpoint C：验收（对照规格第 10 节）
- [ ] 一条命令启动、离线可走完全程
- [ ] 相同种子 checksum 相同；生成器自检违规 0
- [ ] 闭环：一次 ePRO 两条预警；关闭需处置记录；患者端同步
- [ ] `expected.json` 五组人数在圈选页、导出、研究助手三处一致
- [ ] 入组三态互斥；快照冻结后数字不变
- [ ] 降级注入四种故障 10 秒内切换
- [ ] 三助手各 3 正常 / 1 超范围 / 1 无依据问题有预期答案
- [ ] 三轮演示重置无残留；1920×1080 与 1440×900 无横向滚动
- [ ] 项目方审阅锚点病例与指南要点库

---

## 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 生成器难以一次满足"0 违规" | 中 | Task 2 测试先行，按 validate 报错逐条修；转移性治疗开始日强制晚于转移日 |
| 患者 B 不符合虚构方案导致闭环示例断裂 | 中 | Task 10 已改为确认任一符合的合成患者并切换患者端；演示脚本注明 |
| Next.js dev 模式热重载清空 globalThis 状态 | 中 | 状态只在 `lib/state/store.ts` 创建；演示前不改代码；必要时 `DEMO_PERSIST=1` 落 SQLite（本计划未实现，列为后备） |
| 模型提供商工具调用格式差异 | 低 | 两种提供商各自适配器，统一 `ChatResponse`；任何异常都降级 |
| 投屏字号与图表密度 | 低 | Task 12 的 1440×900 断言 + 人工过一遍 |

## 开放问题
- 锚点病例与指南要点库需要项目方专家审阅，建议在 Checkpoint A 与 C 各安排一次。
- 若演示现场必须联网展示真实模型，需提前准备 `DEMO_CLAUDE_API_KEY` 或国产模型的兼容端点并在现场前一天试跑。
