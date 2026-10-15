# PSP Task 8 独立代码审查

日期：2026-10-15；基线 `5142ff4ff2e81a4ca054ad1d67481b7463e6f6c6`。两位独立 reviewer 分别执行范围审查与 fresh wholebranch 复审；实现者收到完整清单后统一修复。最终结论：**规格 PASS / 代码质量 PASS；未关闭 Critical 0、Important 0、Minor 0。**

## 发现及关闭

| 级别 | 首次实测发现 | 修复与独立复核 |
|---|---|---|
| Important | 真实 freeze→draft→aggregate withdraw 后，把 report 创建账序号与匹配 receipt 一致改成撤回事件序号，encode/decode 仍接受全局序号碰撞 | 报告创建 revision 加入既有统一业务事件唯一性集合，覆盖权限、成员、联系、问卷、自报、补录核验、动态计划出生等；保留原报告/receipt 一致性校验。正式 permission 和 correction verification 两项失败回归转绿，独立旧探针再次通过 |
| Minor | API 保存带秒/毫秒 dueAt 的安排，UI“不编辑直接修订”静默截为整分钟 | 上海时间映射、parser 与 datetime-local step 共同保留秒/毫秒；正式精确往返回归及原独立 jsdom 探针均通过 |

首次审查有两个独立 RED 探针。修复新增三个正式回归实际 RED：3 failed / 32 skipped；修复后相关3文件37项通过。最终 reviewer 独立重跑旧 ledger 探针1项、旧 UI 探针1项、三个正式修复用例3项，均通过。另自建 raw gzip→decode 探针绕过 encode 校验，确认 coherent sequence/fact rehash/actor/seed/workflow 篡改仍被恢复端拒绝；合法撤回后旧回执与深冻结保留，1项通过。

## 审查范围

审查完整 Task8 新旧差异及所有新文件：确定性模板与40项事实白名单、结构化安排 schema、命令与批次修订、全局 CAS/幂等回执、授权区间 helper、持久化重生成/深冻结、API scope/roles/seed/no-store、staff UI/异步状态/导航，以及新单测与实际 durable 集成；沿调用核对 snapshot/permissions/transaction/client hook 等原模块。

确认：

- 正文只采用 protectedMetrics，不复制 raw label/applicability/source note，unknown/suppressed/no_applicable 与零分开；source locator 与精确值只在独立内部区核对。
- digest 明确绑定不可变正文/安排/事实/快照版本，不掺动态 workflow；恢复从冻结来源重新生成，不能靠攻击者重算摘要绕过。
- 当前授权检查仅供新 draft，覆盖 aggregate 真实贡献/分母与必要历史 grant；服务-only、非贡献者不误伤，旧报告恢复不依赖当前授权。少数旧 unknown 缺少精确资格见证的保守拒绝属于已批准边界。
- 最新显式父版本、同期间 batch、项目账 CAS 和完整回执防止分叉与重复创建；旧版不变。PM 写，PM/DR/MR 读；旧 seed/错误身份/额外字段拒绝。
- 503 保留原请求并锁表单和修订快捷按钮，409 刷新后显式核对；角色/seed/report 切换隔离迟到响应。
- 无 Task9 提交/双签、Task10 交付/外部读取/下载或 Task11 全时间线越界；原种子、provider、依赖和安全构建策略未改。

## 冻结边界

最终 reviewer 对 `git diff HEAD -- app components lib` 独立逐字节核对，完整差异 **78,268 bytes**，SHA-256 **`67474813b84ad85e09c73aa7c8daec6d73699f465a5a210073ee01fccaea1845`**；另核对15份源码文件 manifest。后续只补测试/文档和运行证据，提交前由实现者再次核对该源码差异指纹。

全套单测、Next/Worker端到端、安全构建、真实重启和原始DO核对由主代理单独运行，最终实际结果以[实施报告](2026-10-15-psp-task8-report.md)为准；审查结论不代替这些运行门禁。原始两次审查报告、失败/通过日志、独立探针和 source diff 保存到本地 `/tmp/med-psp-task8-evidence`。
