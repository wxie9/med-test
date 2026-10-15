# PSP Task 9 独立代码审查

日期：2026-10-15；基线 `399d2c5103d8135d79ce3893bf003b4a01de3f10`。范围审查、fresh wholebranch 审查与修复后独立复核均已完成。最终结论：**规格 PASS / 质量 PASS；未关闭 Critical 0、Important 0、Minor 0。**

## 实测发现与关闭

| 级别 | 发现 | 修复与复核 |
|---|---|---|
| Important/P2 | 连续第二次409继承旧确认，未重新锁住所有写区 | 每个新审核命令重置确认；合法 data v2→medical批准v3→medical退回v4 竞争路径新增失败回归，修复后通过 |
| Minor/P3 | approved/returned版本仍计入“已保存草稿” | 改“已保存报告”及空态，保留既有UI/E2E定位验证；不保留新增的纯文案专用测试 |
| Important/P2 | 409后的强制刷新失败会抹掉锁，刷新尚未结束也可提前确认旧对象 | hook新增scope/token/seed绑定的独立 conflict epoch/freshness；只接受本次冲突后有效成功GET。失败/旧/被新请求替代的GET不解锁，成功刷新仍须人工确认；同页项目表单、审核区、选择器与修订按钮一致锁定。两条独立失败探针原样复跑2/2通过；新增client5项及原hook8项独立13/13通过 |

初次修复见实际 RED4/21→GREEN21。最终 freshness 修复新增9项失败回归后38项通过；移除2个低影响文案专用测试后，最终4文件36项通过。覆盖报告与项目两种冲突、刷新失败/延迟、手动恢复、连续epoch、同URL新seed、旧token与GET乱序；503原body/meta重试保持。409文案也不再提前声称刷新成功。

## 审查范围与结论

完整读取所有产品差异、新文件和正式回归，沿调用检查共享hook、transaction/http、snapshotAuthorization、types/persistence。审查确认：

- 创建回执始终校验原draft/v1投影；submit/review回执逐事件前缀重建，原回执不更新。原请求在后续退回、修订、批准及授权撤回后仍可精确重放。
- 事件逐字段绑定report/seed/project/revision/snapshot及摘要、模板/算法/保护版本，两签共享submissionId/submittedVersion；各自CAS前版本2/3独立递增。首签不终审，双签顺序任意，无第三个PM批准。
- report.version CAS、latest batch head、同步隔离写入保留第一签；修订使用项目ledger CAS与唯一create_report回执。父状态按子创建时事件前缀校验，新版不继承签署。
- 当前materialized状态须等于完整事件投影；事件/回执双向匹配，全局业务序号和回执序号约束相互检查。恢复端直接执行strict schema/完整校验，不依赖encode先检查。
- 提交核对当前汇总来源授权；历史恢复限定提交当时的时间与账前缀，后来撤回不使合法历史失效。内部审查不冒充Task10外部门控。
- 正文仍从冻结保护投影生成并校验原digest域；签署和理由只在工作流，报告/事件深冻结，GET及命令返回副本。角色/seed/路由严格，不允许status/正文注入。
- 新conflict元数据不依赖提示文字，失败/迟到响应不能伪造已刷新；旧消费者原返回字段和503重试语义保留。Task10交付/下载/药企报告入口均未越界。

## 最终冻结与边界

最终 reviewer 对14份产品源码逐一重新生成完整diff，与冻结文件逐字节一致；SHA-256：`c1f17fbf9e32fefffcb5abf3bb6770abd476a661818082e1c0d187a3ccb1d1a2`。最初FAIL审查及原始失败探针保留，v2复核为最终结论。

完整单测、Next/Worker E2E、安全构建及真实停启/原始DO核对由root另行运行，最终实际结果见[实施报告](2026-10-15-psp-task9-report.md)。原始报告、探针、源码差异、日志与证据保存到本地 `/tmp/med-psp-task9-evidence`。当前合成持久化验证语义一致性，不声称具备外部真实性签名。
