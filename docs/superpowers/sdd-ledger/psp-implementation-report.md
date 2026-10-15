# PSP Task 12：整链、恢复与最终交付验收

日期：2026-10-15。基线 `51ff31424251b14081963ceb6cb862b7b58d0aba`；最终执行代码 SHA256 `ccf166f48acc2be0456546391daa5c2bfef38dfaa10173433acb5e5817c97a75`。

Task 0–12 的既定功能与本轮代码/执行门禁已完成。本轮最终代码、执行门禁、静态文档检查及独立复核均通过。未推送、未部署、未真实发送。

## 范围与证据身份

本轮只收尾 Task 12：固定时钟独立 Next/Worker 运行器、实际 DO/OpenNext/SQLite 故障集成、共享浏览器冲突/重置、原研究回归与完成文档；没有新增 PSP 业务功能。`app/components/lib/data/cloudflare`、生产依赖/锁文件与规范 seed 未改。测试故障包装只在独立临时构建，不增加生产接口或持久化 schema/key。

固定上海时间 2026-10-13 10:00；gen-v4 / checksum cc3217fe1d251f10 / 2012 人，五组筛选 207/974/357/37/134；PSP-BC-ENDO-001 初始20/18/14。全部患者/运营背景合成，身份/渠道模拟。10月是截至13日10:00的阶段交付，不是整月业绩。

[代码冻结记录](/tmp/med-psp-task12-evidence/.wrangler/task12-final-code-freeze.json)与各最终 JSONL 记录均绑定同一 before/after SHA256，sourceUnchanged=true、commandExitCode=exitCode=0。只采用最新 `final-* / worker-build / dry-run / dto-regressions / durable-integration / raw-do`，不采用 scoped-raw-do 或 Task11 的925/53/557933历史数字。

## 最终命令门禁

| 门禁 | 实际命令 | 实际结果 | 证据 |
|---|---|---|---|
| 单测 | `npm test -- --maxWorkers=4` | 925项 / 99文件；Vitest 61.86s（4worker）；wall 62.607s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-final-unit.log) |
| lint | `npm run lint` | 无错误；wall 3.560s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-final-lint.log) |
| TypeScript | `npx tsc --noEmit` | 无错误；wall 2.963s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-final-types.log) |
| Next完整E2E | `npm run e2e` | 57 passed + 1 explicit Worker-only skip；4.5分钟；wall 271.220s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-final-next-e2e.log) |
| 安全Worker构建 | `npm run build:worker` | 隔离构建成功；wall 43.621s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-worker-build.log) |
| 打包dry-run | `npx wrangler deploy --dry-run --outdir .wrangler/task12-dry-run` | bundle16497.39KiB / gzip2034.79KiB，非DO数据gzip；wall 2.028s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-dry-run.log) |
| 独立DTO断言 | `node --import tsx --test tests/integration/worker-state/assert-dto.regression.mjs` | 33/33：3正例+30反例；9.784s；wall 10.090s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-dto-regressions.log) |
| 真实DO故障集成 | `npm run test:worker-state` | 28PASS；178.006s至PASS；wall 179.060s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-durable-integration.log) |
| Worker完整E2E | `npx playwright test --config playwright.worker.config.ts` | 58 passed；11.5m；wall 693.926s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-final-worker-e2e.log) |
| 全套件最终初始状态审计 | `npx tsx .wrangler/inspect-task12-persisted.ts /Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/worker-persist-1ziioW --initial-only` | gzip362220字节；seed84/ledger80/auth1；snapshot/report/artifact/receipts0；wall 0.827s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-full-worker-final-initial-audit.log) |
| 另起独立Wrangler重启probe | `npx playwright test --config playwright.worker.config.ts tests/e2e/worker-state.spec.ts` | 1 passed（42.6s）；仅worker-state.spec.ts，同一冻结代码；wall 44.057s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-final-worker-restart-probe.log) |
| 停止后的原始DO | `npx tsx .wrangler/inspect-task12-persisted.ts /Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/worker-persist-8woGlF` | gzip395995 / cap2096128字节；snapshot/report/artifact1，receipts8；wall 1.045s；exit0 | [日志](/tmp/med-psp-task12-evidence/.wrangler/task12-raw-do.log) |

单测/lint/types通过后启动完整 E2E。Next3112、Worker8787/9240，各1worker/retries0，拒绝复用旧服务；独立 DO 集成8798/9241，需要Python3标准库sqlite3。所有写入/重置只访问本机独立环境。安全构建隔离 dotenv/dev-vars 与密钥；没有读取真实环境文件或调用真实付费模型。Worker bundle gzip 与下文 DO gzip 是不同对象。

## S1–S11 与原功能回归

完整 `psp-story.spec.ts` / `helpers/pspStory.ts` 保留真实页面填表与点击：P-A固定计划问卷→两条规则预警→小陈一次已接通电话覆盖两条→医生确认/未来复评→教育阅读与帮助反馈→冻结→初版提交/退回→修订重新双签→交付→客户验收。GET只核对实际生成引用，不能把故障/API fixture 的 approved 数据冒充真实 UI 主线。

医生关闭不等于症状改善；两条未来临床复评及教育帮助联系仍open。发送/页面打开/明确阅读/反馈分别记录。旧版正文/摘要、修订绑定及固定文件在审批/验收后不改；药企不见个体来源与内部退回理由。

原 `story.spec.ts` 临床→治理→研究→候选→患者闭环、原三次reset、快照169/806、候选17及五组207/974/357/37/134继续由本轮全量E2E覆盖。新增三轮dirty→交付→撤回→reset是API fixture负向场景，与真实UI故事分开。两个独立browser context验证同版本CAS一胜一409、刷新后人工核对，再用新请求完成第二签。

旧seed POST被拒，旧available GET实际完成传输、被应用JSON消费并经过两次动画帧后仍不回显正文/下载/重试，不能以取消旧请求代替迟到响应验证。SSR页面读取在写入前、写后、真实重启后不改变业务账；临床PRO/alert与PSP引用、seed一致。

八宽度390/640/755/800/1024/1280/1440/1920做溢出与控制项断言；仅390/1440保存代表截图，另有所有场景trace，不声称八组完整截图。证据在本轮 `test-results` / `playwright-report`，原始日志、截图/trace及停机SQLite已保存至 `/tmp/med-psp-task12-evidence`。

## Durable 提交点与28场景

[最终结果对象](/tmp/med-psp-task12-evidence/.wrangler/task12-a-1792059878831/results.json)保存28条records：PRO、关联interaction、双签delivery各9种故障，共27；另1种子生命周期。实际使用生产DemoState、request锁、OpenNext handler、真实gzip及SQLite，只包装依赖注入故障，不是toy store/codec测试。

| 场景 | 最终证明 |
|---|---|
| handler throw / HTTP500 | 未保存则整份旧状态，后续GET、对象驱逐、整个runtime重启一致，无半条业务 |
| CompressionStream构造失败 | 真实编码路径抛错，503且无put，旧状态可恢复 |
| 真实容量门槛 | PRO 3524092、interaction 3524261、delivery 3553672 压缩字节 >2096128；三者putAttempts=puts=0，503且可恢复 |
| put前确定失败 | 未提交恢复旧状态；原请求可重新执行，不重复事实 |
| put后抛错 | 实际已提交，重读durable新状态；重试原回执，不回滚真实成功 |
| uncertain-old / uncertain-new | 恢复读取也失败时阻止tentative读取、503；恢复后依据真实旧/新保存值，GET handler未偷跑 |
| 保存成功响应丢失 | 新状态已提交；同clientRequestId/原始body精确回放，PRO/interaction/delivery不重复 |
| 每故障六阶段GET | before/recovered/eviction/restart/retry/second-retry均独立对照保存事实，27×6=162检查；完整ID集合与重复数、作用对象及所有联系字段检查 |
| seed/docs命名空间 | 只改嵌入文档保留状态；仅PSP合法whitespace改变实际fingerprint得到新完整初始状态；恢复原bundle后原状态/回执恢复，真实SQLite包含两个key |

矩阵正常raw gzip范围 363064–395214 字节；种子生命周期最后snapshot/report/artifact各1、1、1，receipts8。这些是独立DO集成环境，不能替代下面两个Wrangler原始存储审计数字。

## 最终真实Wrangler重启与原始存储

完整Worker58项包括第52项owned stop/restart；随后第56项真实UI故事、57项宽度和58项空工作台检查继续执行，最后一次reset让完整套件最终状态回到初始seed。不能把套件中途的交付fixture或旧persist当作完整套件结束后的交付证据。[全套件最终初始状态审计](/tmp/med-psp-task12-evidence/.wrangler/task12-full-worker-final-seed.json)来自另行保留的stopped目录 `/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/worker-persist-1ziioW`：gzip362220、seedVersion84/ledgerRevision80/authorizationVersion1，snapshot/report/artifact/receipts均0，完整PSP与loadPspSeed相等。全量证据保留在 `test-results/worker-full` / `playwright-report/worker-full`。

因此在完整58项之后另起独立、同冻结代码的 `worker-state.spec.ts` probe（实际命令/wall见门禁表），仅此1项pass，刻意保留delivered fixture后正常停止。它验证改变PID、同persist、同snapshot/report正文和摘要、临床全量digest、患者/服务/内部/公开DTO、当前gate/seed/authVersion、固定text/HTML字节以及原8请求精确回执。此API fixture与真实UI故事accepted终态、完整套件最终reset状态分别记录。

最后运行器descriptor已stopped:true，persist为 `/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/worker-persist-8woGlF`。最新source-bound raw-do命令明确使用此目录，审计[当前原始DO结果](/tmp/med-psp-task12-evidence/.wrangler/task12-raw-do.json)来自该目录SQLite，未采用更早scoped probe。gzip **395995** /2096128字节；患者2012、snapshot1、report1、artifact1、回执8、审核/交付动作4；seedVersion2、ledgerRevision90、authorizationVersion1。双scope指标/保护重算、摘要及深层不可变核验均true。

## 模型、授权与输出边界

Next/Worker实际观测mode=deterministic，guarded/degraded/detail缺失，属于无密钥直接模板；医生草稿仍要求确认，患者停/减药与急症、研究疗效/生存边界通过实际请求验证。已有provider失败单测使用mock，不能称本轮真的遭遇在线失败/调用真实模型；线上模型可用性、配额和真实断网均未验证。

ModeBadge显示配置模式，单条回复还需看mode/guarded/degraded；provider预算7.5秒/MAX_TOKENS1500。PSP报告始终确定性模板。k=5是演示策略，suppressed/unknown/no_applicable均无精确值回退；保护投影、授权撤回/迟到payload与下载边界由本轮unit及全量E2E覆盖，非生产认证或匿名化证明。撤回不能收回已下载副本。

## 失败、修复与审查

保留所有harness失败：tsx CJS/ESM导入和Node builtin打包，Miniflare5资源/绑定/资产路由初始化，缺localhost解析；launcher健康检查Response.ok布尔用法、Worker别名解析及嵌套打包node_modules/.next复制遗漏修正；初始PRO/交付ledger期望与现有语义不符；内部SQL key受限改为停机Python只读SQLite。没有把这些工具错误冒充产品缺陷或修改产品语义。

独立A初审发现GET oracle只遍历返回项，空/缺对象可能假通过；修复为从实际command+保存store推导完整集合。真实oracle RED为33测试/6pass/27fail，随后33GREEN（3正例+30反例），本轮最终33/33。此RED针对测试断言，不声称产品TDD。B首轮患者自身tool args允许P-A，收窄到可见回复；Playwright强杀launcher后清理精确owned组并加gracefulShutdown；Worker SSR夹具路由404改成真实/services；明确跨API引用，强化安全语义和实际迟到GET消费证明。另有root停机审计helper首轮误以为初始ledger应为0而exit1；实际规范seed账头为80，保留失败log后改为完整loadPspSeed深相等并exit0，未改产品。现有测试阈值未抬高、未启用重试、未删除旧测试。

[独立代码复审汇总](2026-10-15-psp-task12-code-review.md)记录A/B v2及whole frozen review均Approved，无Critical/Important源码发现；它们在最终根门禁完成前只给代码就绪结论。最终执行证据与[完成文档独立复核](/tmp/med-psp-task12-evidence/.superpowers/sdd/task-12-completion-doc-review.md)已逐项核对通过；独立复核无Critical/Important或新的Minor发现。

## 实际警告与限制

最终Next完整门禁复现Socket MaxListenersExceededWarning。后续一次定向保留日志的14项序列exit0/14pass1.2m，实际复现16条（unpipe/error/close/finish各4）；分配栈指向Next15.5.27 `DevServer.getStaticPathsWorker` 的 `worker.getStdout().pipe(process.stdout)` / stderr，对应next-dev-server.js127–128。这是开发静态路径worker输出转发调用点；不能从此断言监听器已修复、必然泄漏或生产Worker也有问题。finally中的worker.end只提供生命周期上下文，未测清理后计数。

[最终警告诊断](/tmp/med-psp-task12-evidence/.superpowers/sdd/task-12-b-warning-final-probe.md)及实际stack/log保留，NO_COLOR/FORCE_COLOR警告也未隐藏。没有warning suppression、提高listener上限、依赖/生产修复；本轮测试通过不等于warning-free。

最终Worker完整日志还保留3条ProxyWorker GET警告：与UserWorker连接中断后第2次尝试恢复，S1–S11仍通过；这是本机运行时观测，不证明生产容灾或所有断连均可恢复。

当地模拟故障不代表真实部署网络/硬盘故障。无真实患者接入、身份认证、多租户、真实报告发送、精排PDF或电子签章；不做疗效/因果/ROI、正式PV或完整RWS/IIT。真实合同、医学内容、授权文本和服务目标仍需实际项目确认。

## 收口状态

README/计划/交接已按最终证据应用，Task12七项均完成。八份文档的本地链接、标题/围栏、占位符及状态检查通过，独立完成文档复核SpecCompliant/QualityApproved。原始证据已保存到上述本机目录；本轮提交流程为本地commit与main精确快进，实际提交标识以Git记录为准，不包含推送、PR或部署。既有Task11记录保留为历史。
