# 专业工作台视觉系统

沿用 PRODUCT.md 的白色内容面、系统中文字体、洋红色强调和统计语义。演示场景为明亮会议室中的桌面浏览器，患者端同时保留手机演示外框。只在操作、选中态和品牌标识中强调洋红。

## Tokens

`app/globals.css` 为样式源：`--background` 是页面背景，`--surface` 是白色内容面，`--surface-subtle` 用于表头与筛选工具条，`--line` 是分隔线，`--ink-muted` 是次要文字，`--accent` / `--accent-hover` / `--accent-soft` 是强调色及其状态。

沿用 Tailwind 的 `gray-*` / `pink-*` 调用，在 `@theme inline` 映射到统一色板，保证原有业务组件能一致呈现。状态红、黄、绿、蓝不重定义，仍需文字说明状态。

## 组件约定

- `workspace-shell`、`workspace-sidebar`、`workspace-context`、`workspace-content` 负责角色页面框架。1024px 以下导航自然换行，所有入口保留。
- `ui-panel` 提供白色内容面、1px 边框、12px 圆角和统一内边距；避免面板内再装饰性嵌套面板。
- `ui-button` 是一般操作，`ui-button-primary` 只强调主要操作。业务状态与禁用条件由原组件提供。
- `sidebar-link`、`view-link`、`patient-tab` 通过 `aria-current` 表示选中状态；不单独创建视觉选中状态。
- 统一图标来自 `components/ui/Icon.tsx`，仅用于辅助识别，默认对辅助技术隐藏；操作名称始终保留文字。
- 数据表在窄屏使用明确标记且可聚焦的局部横向滚动区，避免挤碎表头和隐藏列。

## 排版与交互

正文默认 14px / 1.65，辅助文字 12–13px；页面标题 24px，手机 22px，首页 30px / 手机 25px。数字使用 tabular-nums，指纹使用 mono。正文使用系统中文字体，不请求远程字体。

桌面常规控件至少 36–38px，手机操作至少 44px。颜色与边框反馈 160ms，减少动态效果偏好下立即变化。聚焦轮廓使用洋红 3px 外描边，保留键盘导航。

## 验证边界

按 1440、768、390、320px 的实际 CSS 视口检查首页和代表性角色页面。对小样本保护、授权范围、模拟身份、历史事实、未来任务及报告签署不做视觉性删减。可访问性检查是本轮聚焦验证，不代表完整 WCAG 或真实设备认证。
