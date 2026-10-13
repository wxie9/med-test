# Implementation Plan: 乳腺癌全生命周期平台演示版

详细计划（含每步代码与测试）见 `docs/superpowers/plans/2026-10-13-breast-cancer-lifecycle-demo.md`。
规格见 `docs/superpowers/specs/2026-10-13-breast-cancer-lifecycle-demo-design.md`。

## Overview
一条命令启动的 Next.js 演示应用：四视角共享内存状态，mock 乳腺癌队列，三个可降级智能体，完整"患者 → 医生 → 治理 → 药企 → 患者"闭环。

## Architecture Decisions
- 服务端 globalThis 单例状态容器 + `/api/*`，页面轮询 3 秒，跨视角实时联动，零外部依赖。
- `lib/compute` 是唯一统计来源；页面与智能体都不写数字。
- 智能体默认确定性模板，Claude / OpenAI 兼容为可选增强，8 秒超时与结构校验失败一律降级。
- 合成数据三层：手写锚点 12 例、受约束生成 2000 例、异常 20 例；固定种子与 checksum。

## Task List
### Phase 1: 基础层
- [ ] Task 0 脚手架
- [ ] Task 1 领域类型、HER2 派生、治疗线推断
- [ ] Task 2 锚点与生成器
- [ ] Task 3 状态容器与导航
- [ ] Task 4 计算服务
- [ ] Task 5 预警规则与状态机
### Checkpoint A
### Phase 2: 临床闭环与治理
- [ ] Task 6 患者端主线 A
- [ ] Task 7 医生工作台
- [ ] Task 8 圈选、治理、快照
### Checkpoint B
### Phase 3: 研究端与智能体
- [ ] Task 9 药企研究门户
- [ ] Task 10 候选核查闭环
- [ ] Task 11 智能体层
- [ ] Task 12 脚本、文档、E2E
### Checkpoint C: 验收

## Risks and Mitigations
见详细计划末尾。

## Open Questions
- 锚点病例与指南要点库需专家审阅。
- 现场是否联网展示真实模型。
