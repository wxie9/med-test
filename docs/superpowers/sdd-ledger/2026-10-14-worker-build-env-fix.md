# OpenNext 环境打包与 lint 修复记录

日期：2026-10-14。修复基线：`3e238f4`。用户授权修复这两项问题、验证后commit；PSP业务保持不动。本轮没有推送、发布、设置在线模型或修改临床/PSP种子与业务逻辑。

## 问题与最终行为

OpenNext 1.20.11会把项目`.env*`的production/development/test变量写入部署环境模块，原合成文件白名单不能阻止。回归测试用临时fixture中的虚构密钥直接调用安装版本编译器，确认原路径可打包该值；不读取或打印真实密钥。

`build:worker`改为隔离wrapper：明确源文件/配置清单，排除dotenv、缓存及工作区，实际复制已安装依赖并限制链接，子进程使用环境白名单与固定演示时钟。Next/OpenNext只在隔离目录中运行，原环境文件与本地`.next`保持原样。OpenNext环境模块必须只有三个空JSON导出，最终包中不得有dotenv文件；验证后才更新两份部署产物。解析不执行生成的JavaScript，错误不输出环境值。

发布输出更新失败时回滚`.open-next`与`cloudflare/files.generated.mjs`，防止新Worker和旧种子混用。独立审查用只读目标目录发现该失败路径；根代理新增测试，确认旧代码断言失败，再修复至通过。回滚本身失败时保留备份并报告路径，不清掉恢复材料。

ESLint新增`.claude/**`忽略，避免扫描嵌套worktree的Next产物。标准lint从3315错误/10902警告变为exit0；正常应用源文件仍纳入检查。

## 最终验证

| 检查 | 结果 |
|---|---|
| 策略回归 | 14项通过，含真实上游编译器、dotenv变体、子进程变量、源/依赖链接、严格环境模块、失败保留/回滚 |
| `npm test` | 35文件、378测试通过 |
| `npm run lint` | exit0，无ESLint诊断 |
| `npx tsc --noEmit` | exit0 |
| `npm run build:worker` | 完整Next/OpenNext构建exit0；传入三个虚构环境密钥用于验证过滤 |
| 最终产物扫描 | 1535文件，三个sentinel值均无命中；production/development/test导出均为`{}` |
| `npx wrangler deploy --dry-run` | exit0；只进行本地部署打包，没有上传 |
| 最终产物的本地Workers API | 200；2012患者、deterministic模式、上海10月13日10:00固定时刻 |
| 既有Playwright套件→本地Workers 8787 | 8项通过，48.5秒：原完整故事线、三轮重置及窗口回归 |
| 独立代码复核 | 初审P2发布回滚问题已闭合，受限复核未发现直接新增问题 |

本地Wrangler使用独立`/tmp/med-safe-worker-preview-state`存储；没有重置线上共享状态。Playwright临时配置复用仓库`tests/e2e`，baseURL为`http://127.0.0.1:8787`，单worker、1920×1080，禁用原3000端口webServer。验证结束停止本轮预览服务。E2E日志只有非失败的终端颜色环境提示，不影响8项结果。

## 后续边界

隔离构建只发布`.open-next`和合成文件模块，不将临时`.next`或env复制回工作目录。开发模式仍可使用原本的本地模型配置。构建需要额外临时磁盘空间；直接绕过wrapper运行OpenNext不受此策略保护。

PSP实施计划中的Task0前置修复已由本次完成，Task1–12及PSP业务未执行。不能把这些检查称为PSP验收或生产身份隔离；后续开始业务实施时仍需检查当前git状态与相应计划。
