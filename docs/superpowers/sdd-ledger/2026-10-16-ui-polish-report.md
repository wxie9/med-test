# UI 专业工作台迭代验收

日期：2026-10-16。用户确认「专业工作台：整体统一，重点打磨首页与核心工作页面」。独立 worktree：`/Users/xue.w/.codex/worktrees/ui-polish/med_Test`，分支：`codex/ui-polish`。主工作目录不承担本轮修改。

## 已完成

- 统一角色切换顶栏、品牌入口、实际模式标识、侧栏和上下文栏；洋红色品牌与系统中文字体保持。
- 首页按角色入口、演示脚本/重置工具和真实 manifest 分区。四角色入口、原路由和重置测试标识保留。
- 提供共享表面、按钮、控件状态、聚焦、语义图标、文字与中性色层；记录于根目录 `DESIGN.md`。
- 服务台待办筛选、成员面板、项目说明和药企项目列表统一视觉；既有错误、重试、授权和历史事实完整保留。
- 患者端统一手机框架、问候区、快捷入口与六项底部导航，患者切换按钮在窄屏换行。
- 响应指标按宽度重排，患者概要在窄屏为单列。患者列表和预警表格在可聚焦的局部滚动区保留全部列。

没有修改 API、业务状态、计算、固定报告内容、权限、服务授权、签署或交付逻辑。没有新增 npm 依赖或远程字体/图片请求。

## 执行证据

| 检查 | 本轮实际结果 |
| --- | --- |
| 改动前 `npm test -- --maxWorkers=4` | 106 文件 / 1092 测试通过，65.00s，退出码 0 |
| 改动后 `npm test -- --maxWorkers=4` | 106 文件 / 1092 测试通过，71.42s，退出码 0 |
| `npm run lint` | 退出码 0 |
| `npx tsc --noEmit` | 退出码 0 |
| 完整 `npm run e2e` | 67 passed + 1 明确的 Worker-only skip，5.9m，退出码 0 |
| 最后表格和患者切换微调后的定向 E2E | reset、story、psp-evidence、ux-regressions 共 12 passed，1.2m，退出码 0 |
| `git diff --check` | 退出码 0 |

定向命令：`npx playwright test tests/e2e/reset.spec.ts tests/e2e/story.spec.ts tests/e2e/psp-evidence.spec.ts tests/e2e/ux-regressions.spec.ts`。E2E 使用项目既有独立 3112 服务；人工预览位于独立 3216 服务，两者未复用状态。

## 浏览器核对

通过 Codex 内置浏览器实际检查首页、医生预警队列、服务台、患者列表、治理入口、研究入口、药企项目和患者端。首页/医生入口/治理/研究/药企项目/服务台在实际 CSS 宽度 1440、768、390、320px 都满足 `document.documentElement.scrollWidth === innerWidth`，原始数值见 `artifacts/ui-polish/layout-checks.json`。浏览器原有缩放使截图像素不等于 CSS 宽度，检查以读回的 `innerWidth` 为准，未更改用户浏览器缩放。

另检查 320px 患者端：页面宽度 320px，六个底部入口存在，点击切换患者 B 后标题确为李女士，再切回患者 A。患者列表在 320px 页面内保持 251px 可视表区与 760px 表内容，页面本身不溢出；键盘可从可聚焦表区进入患者链接，实际有洋红聚焦轮廓。

只读代码审查未发现 P0–P2 问题，指出首页入口的外置焦点框被父容器裁切。修复为内置 outline 后，通过真实 Tab 操作读回洋红色约 3px 轮廓和负约 3px offset，证据为 `home-keyboard-focus.png`。

已核对浏览器编译后存在 `prefers-reduced-motion: reduce` 规则。未修改操作系统偏好；这项是 CSS 覆盖核对，不声明完成真实设备或全 WCAG 审计。

主色板计算对比度：正文/白底 13.25:1、次要文字/白底 5.33:1、次要文字/页面背景 4.97:1、白字/主操作 5.80:1、选中文字/浅洋红底 6.52:1。不是全站逐像素对比度认证。

## 截图

- `artifacts/ui-polish/home-1440.png`、`home-320.png`：首页。
- `services-1440.png`、`services-320.png`：服务台。
- `clinic-1440.png`、`clinic-320.png`：医生入口。
- `governance-1440.png`、`governance-320.png`：治理入口。
- `research-1440.png`、`research-320.png`：研究入口。
- `pharma-1440.png`、`pharma-320.png`：药企项目。
- `patient-320.png`、`patients-320.png`：患者端与患者列表。
- `home-keyboard-focus.png`：首页焦点修复。

## 限制与保留状态

本轮未发布、未合并 main，保留工作分支及 3216 预览。未重跑 Worker 构建、Worker 持久化或生产构建；本轮未修改它们的代码与配置。完整 Next 回归保留既有 NO_COLOR 与 Next Socket listener 开发警告，未隐藏警告或改动依赖。设计检测器指出的 1px 中性分隔线与跨 JSX 分支配色经人工核对，不作为新增缺陷；检测通过与否不替代浏览器视觉检查。
