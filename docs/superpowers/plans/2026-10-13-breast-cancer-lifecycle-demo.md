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
git init
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
