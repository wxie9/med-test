# PSP 药企阅读与验收体验 · UX Task 1–6 验收报告

设计日期：2026-10-15；本轮执行：2026-10-15 至 2026-10-16（上海时间）。

最终判定：**通过**。UX Task 1–6 的本批范围已实现并验证；最终应用/测试版本为 `e5282c4`，本报告所在提交仅更新文档。

## 改造结果与范围

药企项目概览先解释服务、周期/阶段及交付构成，再逐版显示实际交付入口。客户报告先显示当前交付状态、四项固定事实提要和本版下一期安排；完整七章、40 项事实及各自口径仍可展开核对。生成时标记与当前状态分开，完整校验码和版本放入核对资料。

验收区域提供三行只读核对导航；意见可选，修改理由必填。已验收/已请求修改版本显示相应记录并停止重复操作。验收只确认本次交付范围，不把下一期计划改成已完成。

范围依据：[设计](../specs/2026-10-15-psp-client-experience-design.md)、[实施计划](../plans/2026-10-15-psp-client-experience.md)、[改造前体验评审](../../../.impeccable/critique/2026-10-15T12-00-08Z__components-psp.md)。原 PSP Task 0–12 是历史业务基线；这里的编号均为新的 UX Task。

| 任务 | 提交 | 主要交付 |
|---|---|---|
| UX 1 | `8041006` | 安全的外部事实阅读模型及夹具/边界测试（前轮完成） |
| UX 2 | `ed14db0` | 项目概览、真实空态、逐版交付入口（前轮完成） |
| UX 3 | `11ffdd7` | 分层报告、原文/口径、锚点与键盘目标 |
| UX 4 | `250d56a` | 只读核对导航、状态化验收操作，保留原请求 owner |
| UX 5 | `e5282c4` | 浏览器阅读、固定文件与安全边界证据 |
| UX 6 | 本报告所在文档提交 | 全量门禁、演示脚本和实施记录 |

本轮代码基线 `ed14db0`；完整 UX 基线 `1d5a67f754d6a2aee3da7fbbefff7cf35eab51d9`。最终应用/测试代码版本 `e5282c4`；UX 6 只更新文档，不改变验证过的应用/测试代码。

主要改动文件：新增 `PharmaReportReading.tsx`、`PharmaDeliveryChecklist.tsx`、E2E 展开 helper 和阅读体验用例；原 `PharmaReport.tsx` 仅编排门控后的展示、导航、文案和按钮主次。原医患故事、交付、负向、阶段一、八宽度与 Worker 重启用例只适配正文显式展开或补强新增区域的保护断言，未删减既有断言。完整文件清单可用 `git diff --name-only ed14db0..HEAD` 查看。

`lib`、`app`、`data`、`scripts`、服务端投影、请求协议、schema/种子、报告模板、provider、依赖、运行器配置及共用 `ReportPreview`/`ReportTimeline`/`Common` 相对本轮代码基线没有修改。未新增路由、持久化的勾选/阅读记录或交付物。

## 最终门禁

所有命令在隔离 worktree `/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test`（分支 `codex/psp-client-experience-completion`）中执行。Next 使用自有 3112 服务；Worker 使用自有 8787/9240 和测试持久化目录。安全运行器拒绝接管已占用端口；没有向用户的 3000 服务发重置/测试请求，没有重启该服务。

| 验证 | 实际结果 | 退出状态 |
|---|---|---|
| `npm test -- --maxWorkers=4` | 最终 Node 24.19.0：102 文件 / 1032 项通过，69.06 秒，无失败/跳过 | 0 |
| `npm run lint` | 通过 | 0 |
| `npx tsc --noEmit` | 通过 | 0 |
| Task 5 定向四文件 E2E | 18 项通过，2.2 分钟；Worker 重启定向 1 项通过，48.3 秒 | 0 |
| `npm run e2e` | 64 项通过，1 项既有 Worker 专属跳过，5.1 分钟；无失败 | 0 |
| `npm run build:worker` | 隔离构建完成，产物检查无 dotenv 或嵌入环境值；应用代码与最终版本一致 | 0 |
| `npx wrangler deploy --dry-run --outdir /tmp/med-psp-client-experience-worker-dry-run` | 成功打包，gzip 2025.19 KiB；输出明确 dry-run 退出，无实际部署 | 0 |
| `npx playwright test --config playwright.worker.config.ts` | 最终重跑 65 项全部通过，12.8 分钟，无失败/跳过；真实停启用例 40.9 秒通过 | 0 |
| `git diff --check`、文档链接与提交范围检查 | 差异无空白错误；36 个本地链接可达；归档 457 个文件的 SHA-256 校验通过；提交范围仅本批文档 | 0 |

本机日志：[单测](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-unit.log)、[lint](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-lint.log)、[TypeScript](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-types.log)、[Task 5 定向](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-targeted.log)、[Worker 构建](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-worker-build.log)、[真实重启定向](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-worker-restart-probe.log)。[完整 Next](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-next.log)、[Worker dry-run](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-worker-dry-run.log)、[完整 Worker](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/logs/med-psp-client-experience-worker.log)。日志是本地验证产物，不进入 Git。

浏览器配置保留 `retries: 0`，未增加 skip 或放宽超时。最终重跑使用本机已经提供的 Node `v24.19.0`，通过进程级 PATH 前置 `/Users/xue.w/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` 选择；未安装/更换项目依赖，也未修改全局 Node 设置。macOS `caffeinate -i` 仅在验证命令生命周期内防止空闲休眠。

### 中间失败与排查

- 键盘初版对整页扫描 `aria-controls`，误把 Next 开发工具的 portal 按钮算进产品控件。诊断返回唯一无目标项为 `Open Next.js Dev Tools`；已限定在两个药企阅读区域，仍核对全部 54 个报告控件及其真实目标，未删除产品断言。
- 独立评审补强两项证据：真实 Tab 到达展开按钮、Enter 前后 `aria-expanded` 与全流程 0 POST；完整窗口逐项 exact 对应外部 DTO 的 `periodStart`/`periodEnd`/`cutoffAt`，并保证结束边界和阶段截止不同。两项单独重跑通过。
- 一轮 18 项运行有 2 项超时。trace 中单步等待分别约 79 秒、383 秒；macOS 电源记录对应 2026-10-15 23:51:46 合盖休眠，以及 23:53:51–23:59:41 睡眠。失败记录保存在 `/tmp/med-psp-client-experience-sleep-interruption/`；该轮不作通过证据。
- 随后重跑前 16 项通过，Next 进程原生崩溃。系统报告 `node-2026-10-16-000523.ips` 记录 PID 50852、`SIGSEGV`/`EXC_BAD_ACCESS`，栈位于 V8 `ClearStaleLeftTrimmedPointerVisitor`/垃圾回收；不是应用抛出的断言错误。已中断失去服务的剩余测试，退出 130，保留 trace 到 `/tmp/med-psp-client-experience-node24-crash/`。选择本机捆绑的更新 Node 后重新执行整组及最终门禁，结果以表格为准；不将中断轮计为成功。

Worker 首次全量运行的交付撤回用例在验收后等待状态时失败：POST 200（约359ms），详情 GET 200（约396ms）返回 accepted/version6、相同 seed/授权；页面仍是保存/刷新中。macOS 电源记录显示 2026-10-16 00:22:02 合盖睡眠、00:22:08 唤醒，横跨该 5 秒断言。网络完成不等于浏览器 JSON 消费及 React 提交完成；结合电源记录，先按运行中断保留 trace 到 `/tmp/med-psp-client-experience-worker-sleep-interruption/`，不修改组件、原超时或断言，该轮最终 61 项通过、4 项失败，19.6 分钟；其余长停顿包括原临床故事约138秒、研究清理约255秒，与 00:27:03–00:35:33 合盖/维护睡眠区间相符。整轮日志和四项失败 trace 已备份到 `/tmp/med-psp-client-experience-worker-first-full/`；中断前没有取回进程退出码，只记录实际失败汇总。之后在唤醒状态按相同完整命令重跑 Worker，未改代码、超时、skip 或 retries。最终结果见门禁表；这轮不作通过证据。

完整 Next 日志仍有 `MaxListenersExceededWarning`（Socket 的 unpipe/error/close/finish）。这与 [历史 Task 12 报告](psp-implementation-report.md) 记录的开发服务器输出转发诊断相同；本批没有改 Next 运行器、提高监听器上限或声称已修复。`NO_COLOR`/`FORCE_COLOR` 冲突提示和隔离构建无缓存提示也保留为诊断，不是失败项。

最终 Worker 日志有 2 条 ProxyWorker 在连接中断后第 2 次恢复的提示；相应用例及完整 65 项均通过。它是本地运行时观测，不证明生产容灾或全部断连均可恢复，也不改变 Playwright 的 `retries: 0`。

## 14 项设计标准的证据对应

测试路径均位于仓库 `tests` 下。`psp-client-experience.spec.ts` 的六个用例在 Next 和 Worker 两个运行时都执行；不是用 mock 页面代替服务端投影。

| 条款 | 证据与核对内容 |
|---|---|
| 1 服务、阶段、交付、下一步、人数含义 | `unit/psp-pharma-overview.test.ts` 的阅读顺序及分母隔离；本报告内部阅读检查 |
| 2 真实空态和未交付隔离 | E2E `scope:` 实际创建草稿、提交双签到 approved，两个阶段均无客户入口；真实 deliver 后才出现入口 |
| 3 首屏和窄窗优先级 | E2E `layout:` 在 1280×720 / 1440×900 的 scrollY=0 检查状态、阶段、提要及首项；四宽度截图 |
| 4 原保护事实一致 | E2E `reading:` 提要逐项对当前外部 DTO；原 S1–S11 真实服务行为的固定报告及来源链；本次 Next 与 Worker 实测均为问卷 suppressed、联系 9/14、教育 9/14、服务任务 18/28；不在组件写死示例值 |
| 5 四态/零/缺失 | 模型 66 项单测及阅读组件测试；三种整组不可评价状态携带 999 哨兵也不泄露，真实 0 保留，缺项可刷新 |
| 6 七章、40 项、原定义与完整窗口 | E2E `reading:` 验证 40 个唯一 key、逐项展开原 definition；完整窗口三个日期与上海时间 exact 比对，结束边界不含 |
| 7 当前状态与生成 notice | 组件 delivered/accepted/修改请求三态；生成原文默认不在 DOM，展开后原文仍可核对 |
| 8 文件固定、阅读无业务事件 | 两个独立 `fixed files:` 用例分别实际验收/请求修改，文本和 HTML 在动作前后 Buffer 完全一致；文本另比 artifact.text/SHA-256；只读阶段 0 POST、账版本与本版历史不变 |
| 9 三行提示只读 | 核对区 3 个链接/0 checkbox；没有新增保存 API，客户操作仍提交实际报告版本及原命令元数据 |
| 10 意见可选、理由必填、三态动作 | 空意见实际验收成功；空理由修改按钮禁用，长多行理由实际提交；终态禁止再操作，导航文案对应状态 |
| 11 精确重试与失效隔离 | `psp-pharma-ui.test.ts` 原/新增 503 序列化请求不变、409 刷新后逐次人工 ack；E2E 原回执、reset 和迟到响应消费屏障 |
| 12 新旧区域一起失效 | 负向用例在 `Response.finished()`、浏览器真实 JSON 消费/bodyUsed 和双 RAF 后断言：正文/提要/安排/核对提示/依据区均 0 节点、无旧下载；原 gate 文案可见 |
| 13 响应式、键盘和原锚点 | 四宽度默认/展开、长意见/64 位校验串；原八宽度回归；真实 Tab/Enter、直达 body hash、同 hash 重开和浏览器前进/后退焦点；54 个产品折叠目标存在 |
| 14 完整医患至验收主线 | `psp-story.spec.ts` S1–S11：问卷、联系、医生复核、教育反馈、快照、退回修订、新双签、交付、验收；Worker 专属用例真实停启、原回执与固定文件重验 |

授权失效、详情/父读取失败和换报告等组件测试都挂载真实原 `PharmaReport` owner，不通过移走命令状态来伪造通过。原 503/409 行为和客户意见只在原 owner 内持有。

实际 Next 与 Worker S1–S11 的修订 2 均已验收；下一期医学复核为医生负责、上海时间 2026-10-14 11:30、planned。四项实际冻结事实已从该次 trace 的 `joined-report-evidence` 提取到 [本机事实摘录](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/next-story-facts.json)，另从最终 Worker trace 提取 [Worker 事实摘录](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/worker-story-facts.json)，核对结果、窗口及本版安排与 Next 完全相同；没有把设计示例当运行结果。

## 截图、trace 与人工检查

生成证据不提交 Git。最终证据已归档在隔离 worktree 的 `test-results/psp-client-experience-e5282c4/`：`next/`、`worker/` 为两种运行时结果，`reports/` 为 HTML 报告，`logs/` 为命令日志，`interrupted-runs/` 保留中间失败证据。后续再跑测试不会清除这份归档；即使文档快进 main，证据仍在上述隔离 worktree，主目录不包含同名生成目录。可核对 [SHA-256 证据清单](/Users/xue.w/.codex/worktrees/psp-final-acceptance/med_Test/test-results/psp-client-experience-e5282c4/sha256-manifest.json)。每项 trace 为用例目录中的 `trace.zip`，配置为始终采集。

代表截图路径（相对上述归档的 `<next|worker>/`）：

- `psp-client-experience-layo-08609-d-reflow-in-all-four-widths-<next|worker>/first-viewport-1280x720.png` 和 `first-viewport-1440x900.png`。
- 同目录 `reading-default-{390,755,1440,1920}.png`、`reading-expanded-{390,755,1440,1920}.png`。
- `psp-client-experience-fixe-47fa7-load-formats-byte-identical-<next|worker>/customer-accept.png` 与 `psp-client-experience-fixe-7114b-load-formats-byte-identical-<next|worker>/customer-request_changes.png`。
- `psp-delivery-a-captured-ol-4338a-ed-overview-never-reappears-<next|worker>/psp-delivery-revoked-after-late-body.png`。
- `psp-story-*/story-accepted-{390,1440}.png` 及同用例 trace/`joined-report-evidence` 附件；原八宽度用例另外保留工作台、院内报告、来源、外部报告截图。

已人工查看定向 Next 运行的两种首屏、四宽度默认/展开、验收和撤回后截图。状态/阶段先于业务提要，390 单列、755 自然换行、宽屏限制行宽；原文很长但默认不占据主流程；验收主按钮与请求修改/下载/展开有层级区别，长意见和校验串未撑宽。Next 开发工具浮标在窄屏截图中可能覆盖局部文字，须以无此开发浮标的 Worker 构建截图补核；不隐藏开发工具来绕过测试。已补核 Worker 无开发浮标的 390/755 默认阅读与 1440×900 首屏截图：正文、表单、导航和状态均未见浮标遮挡或横向溢出。最终完整套件包含两运行时全部原布局和主线断言，均通过。

## 内部阅读检查与演示交接

此处按非开发者需要回答的问题作内部走查，未邀请真实药企客户，不能称为客户可用性测试。界面检查使用隔离合成项目，验收报告不代替真实 SOW。

| 阅读问题 | 界面可得到的答案 |
|---|---|
| 提供什么服务？ | 项目概览列出计划问卷、服务联系、必要时医生复核、批准教育及患者反馈；并列明阶段报告、双签记录、固定文件、下期安排/客户反馈等交付构成 |
| 数据截止何时？ | 项目阶段和各报告都明确上海时间；本次固定演示为 2026-10-13 10:00，完整统计窗口至 11 月 1 日但结束边界不含，不宣称整月已经完成 |
| 哪些能评价、哪些不能？ | 有值项仅按本版原分子/分母读；已保护、证据不足、无适用样本分别解释，不当作 0 或目标达标；当前允许汇总人数不能充当报告分母 |
| 本版有什么安排？ | 报告上方显示当前 nextActions 的类别、负责角色、上海时间、计划状态；空时明确未列安排；完整主线修订 2 的医学复核仍为计划 |
| 如何核对、如何反馈？ | 三行提示分别通往正文范围、签署/固定文件和限制/安排；全文每项可查口径，时间线及下载可核对；意见可选的验收、带理由修改分开，终态保留记录 |

更新后的 [演示脚本](../../demo-script.md) 保留医患主线，把药企段改为“范围/阶段/交付 → 本次交付 → 提要及限制 → 下一期安排 → 三行核对 → 正文口径/签署/固定文件 → 客户反馈”。所有链接从实际列表进入，不使用旧轮次 UUID。完整 40 项口径留作按需展开，不强行塞进 80 秒讲解。

## 限制与后续边界

患者、药企、运营背景、角色选择、电话和交付渠道均是演示合成/模拟；测试证明软件流程和隔离行为，不证明临床获益或商业 ROI。没有真实客户参与、真实 SOW/SLA、真实外发、生产认证/多租户、电子签章或正式 PV 验证。未执行真实在线模型调用，本批报告继续使用确定性模板。

本批没有改存储/事务，所以没有重跑独立的持久化故障矩阵；完整 Worker E2E 的真实停启、回执与原文件验证保留且必须通过。键盘/布局检查不等于完整 WCAG 审计。

独立评审：Task 3 无待处理问题；Task 4 测试清理的名称遮蔽已修复并复验；Task 5 两项测试证据补强后只读复核通过。最终代码与交接文档的独立只读复核通过，无 Critical / Important / Minor 待修问题；复核者独立校验全部457份归档哈希、直接读取两运行时主线 trace 附件，并查看首屏/窄窗/验收/撤回截图。上述五个问题仅为内部阅读走查，不代表真实药企用户测试。
