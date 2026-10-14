# PSP 实施前现状续审

日期：2026-10-14。代码：`main` / `48b519f`，与 `origin/main` 一致；审查开始时工作区干净。

用户本轮明确要求：继续评审现状并完善实施计划，暂不编码。本文及配套计划只变更文档，不修复下述代码问题，不发布、不重置线上状态。

## 1 当前完成边界

| 内容 | 状态 | 证据 |
|---|---|---|
| 原患者→预警→医生处理→任务/消息→研究候选链 | 已有代码，继续保留 | `lib/pro/submit.ts`、`lib/clinic/actions.ts`、`lib/research/candidates.ts` |
| PSP 商业分析与详细设计 | 文档已提交 | `8ebf25a`、`d8503f0` |
| Workers/OpenNext 部署准备 | 已提交 | `00a0f7d` |
| API 单一共享 Durable Object 与 gzip 状态保存 | 已提交 | `7e4f447`；`cloudflare/worker.mjs:10–32` |
| 四份临床种子输入的 SHA-256 失效机制 | 已提交 | `48b519f`；`scripts/seed-fingerprint.ts` |
| PSP 项目、授权、固定计划、教育、服务快照、报告审核交付 | 尚未编码 | `DemoStore` 仍只有旧临床/研究字段；app/lib/tests/scripts 无 PSP 实现 |

首页和 ViewSwitcher 的药企入口仍是 `/research`。没有 `/pharma` 或 PSP 月报工作台，不能把 Cloudflare 部署进展当成新业务主线完成。

## 2 新发现的问题与依赖

### R01 / P1：OpenNext 环境打包绕过合成文件白名单

位置：`package.json:16` 的 `build:worker` 与 `package.json:18` 的 `deploy:worker`。

触发：本地 `.env.local` 或其它被 OpenNext 读取的 `.env*` 有模型密钥时执行 Worker 构建/发布。

安装版本 `@opennextjs/cloudflare@1.20.11` 的 `dist/cli/build/build.js:74` 调用 `compileEnvFiles()`；`dist/cli/build/open-next/compile-env-files.js:10–13` 将 production/development/test 各环境的变量写到 `.open-next/cloudflare/next-env.mjs`。`dist/cli/utils/extract-project-env-vars.js:24–32` 包含 `.env.local` 等输入；`dist/cli/templates/init.js:93–96` 会在 Worker 中回填 `process.env`。

`scripts/build-worker-files.ts` 的五文件白名单只限制 `__demoFiles`，并不限制 OpenNext 的环境编译。`.gitignore` 排除密钥文件也不等于构建不读取它们。

独立 reviewer 在 `/tmp` 用非真实 sentinel 密钥调用同一编译函数，确认变量名和值会进入生成环境模块；未读取/打印真实密钥、未调用外网或发布。**没有发现当前线上版本已泄露真实密钥的证据。**问题是当前手动发布路径不能兑现“不上传模型密钥、默认确定性助手”的约束。

下一轮优先增加无 `.env*` 的隔离构建和环境产物白名单验证，完成 sentinel 测试后再进行 Worker 构建/发布。不能只删 `files.generated.mjs` 中的变量或仅清空子进程的环境，因为磁盘 env 文件仍会被读取。

### R02 / P2：标准 lint 会扫描嵌套工作区

位置：`eslint.config.mjs:15–25`。

`npm run lint` 扫到 `.claude/worktrees/*/.next` 和该嵌套项目的生成声明文件，得到3315错误、10902警告。根项目的`.next/**`忽略不能覆盖嵌套路径。

诊断对照：`npx eslint . --ignore-pattern '.claude/**' --format json` 返回0错误/0警告，检查193个文件。建议在源配置中显式排除嵌套工作区，然后重新跑标准命令；这不是更改业务代码的理由。本轮仅记录，未改配置。

### R03：新增 PSP 状态必须升级应用存储契约

`lib/state/persistence.ts:4,16` 只有payload version 1和patients数组校验；`worker.mjs:8` 的key也是demo-v1。新增字段不能假设旧保存值包含PSP。本计划选择新payload schema/key恢复初始合成状态，不做隐式迁移；部署说明必须告知共享演示会重置。DO类仍是DemoState，wrangler类迁移tag不是payload版本。

新增PSP fixture和manifest应进入加载、打包、指纹同一个清单。当前指纹只有anchors/cohort/edge-cases/manifest，不含尚不存在的PSP文件；这是新功能依赖，不是当前四文件指纹缺陷。

### R04：新药企入口与通用序列化必须同时收紧

`components/ModeBadge.tsx:22` 仅识别`/research`，新增`/pharma`会走`useDemoState()`请求临床状态。`lib/state/store.ts:25–27` 的`serializeLite()`用`...rest`，直接新增store.psp会把内部账附带返回。需专用药企DTO/hook，并显式排除通用serialize/serializeLite中的PSP内部字段；报告页不能靠前端隐藏字段。

新接口白名单仍不能替代生产认证；原临床API在共享合成演示中可访问是已知边界。

### R05：PSP 原子写入和恢复需增加集成证据

DO现在串行处理整次API请求，但不能把串行化直接当成业务事务保证。PSP命令要在校验完成后暂存并一次提交；持久化失败、提交后响应丢失重试、并发同版本、重启恢复都需验证。当前编解码测试不覆盖DO包装器的实际异常行为，不能据源码推断已证明失败回滚。

JSON恢复不会保留Object.freeze；新增报告/快照应通过服务写屏障和hydrate重新冻结维持不可变。原在线agent请求也经过同一DO并可能阻塞其它请求；新增报告在线生成需要限时且不能占用未完成的业务写事务。首版报告使用模板，不扩张现有聊天provider权限。

## 3 本轮验证

| 命令/动作 | 结果 | 可以证明的范围 |
|---|---|---|
| `git status --short --branch` / `git log` | main同步48b519f，起始干净 | 当前仓库基线 |
| `npm test` | 34文件、364测试通过 | 现有单元/路由测试；不含PSP新功能 |
| `npx tsc --noEmit` | exit 0 | 当前类型检查 |
| `npm run lint` | exit 1；3315错误/10902警告 | 当前标准检查失败，集中在嵌套工作区 |
| 排除`.claude/**`的ESLint对照 | exit 0；193文件、0错误/0警告 | 原因定位，不能替代标准命令通过 |
| 只读loadSeed/applyFilter选人 | P-A+19个稳定cohort ID，见计划 | 选人满足临床范围；没有写fixture |
| 默认PSP名单历史自报只读核算 | 汇总153/168、内部199/216；10/13边界14/18条排除 | 精度规则下的完整fixture手算，尚未新增项目证据 |
| OpenNext sentinel复现 | 变量名和值进入环境模块 | R01机制成立；不是实际线上泄露证据 |

未重跑浏览器端到端、Next/OpenNext完整构建、Wrangler预览或线上流程。此前部署文档中的成功记录保留为历史证据，不表述成本轮复验。没有修改种子、运行状态、应用代码或依赖。

## 4 继续的顺序

按[PSP实施计划](../plans/2026-10-14-postlaunch-psp-demo.md)执行：构建/检查基线→项目/授权/固定计划与持久化→医患服务证据→指标/保护/快照→报告双审/交付验收→本地与Workers全链回归。

本轮设计没有发现需要推翻PSP主线的理由。主要变化是运行环境与实现依赖，20/18/14、阶段截止时点、医生责任、独立授权、k=5及原研究支线的契约保留。

## 5 实施计划交叉审查修订

独立初审提出的契约缺口已补入计划及相关规格：durable保存成功才提交/失败恢复、隔离构建所需PostCSS/ESLint配置与两份产物、患者/来源/报告读取路由、UTC存储与上海边界、医生close复评参数、今天due1打卡、最小模拟动作矩阵、service/aggregate撤回和重新授权、正文digest与动态签署元数据分开、默认日志手算与sampleUnit、跨指标/同族联动保护。它们是文档修订，不代表已修复应用或新增测试已通过。

受限复核确认上述初审问题已闭合；最后补齐个案管理师接单权限和PM内部交付端点。文档本地链接、围栏、未执行标记及空白检查通过。下一轮应按每段门槛提供真实执行证据，不沿用本文的设计审查作为实现验收。
