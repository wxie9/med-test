# 项目 SOW 迭代工作区

本仓库当前用于项目范围、系统架构、工作内容与交付物的迭代。已统一 CX 患者数字孪生与 DX 共用持续改进框架的首期 SOW 口径，并整理并行与顺序推进两个讨论版本。

## 分支安排

| 分支 | 用途 |
| --- | --- |
| `main` | 本轮 SOW 与架构设计文档，后续以此为基础迭代 |
| `demo` | 保留此前演示系统代码与完整历史，当前停留在 `905a88a` |

`main` 与 `demo` 保留共同提交历史。本次调整将演示系统的文件从 `main` 当前版本中移出，原有内容可在 `demo` 查看和继续开发。现有其他开发分支保留。

## 当前材料

- [CX 与 DX SOW 版本索引](docs/proposal/cx-dx-sow/README.md)：统一工作内容、交付物、分工与阶段。
- [版本一：两个项目并行推进](docs/proposal/cx-dx-sow/parallel.md)：独立工作线，允许阶段错开和分批交付。
- [版本二：先完成一个，再推进另一个](docs/proposal/cx-dx-sow/sequential.md)：先行项目完成约定首期交付及交接后启动后续项目，兼容两种先后顺序。
- [CX 首期工作内容与交付物](docs/proposal/cx-digital-twin/phase1-sow.md)：当前范围基线。
- [CX 文档索引](docs/proposal/cx-digital-twin/README.md)：总体参考架构、交互更新时序和调研来源。
- [DX 首期工作内容与交付物](docs/proposal/dx-self-improvement/phase1-sow.md)：顾问牵头设计与技术评审、工程团队实施与验证的首期范围收敛稿。
- [DX 共用持续改进底座深度分析](docs/proposal/dx-self-improvement/deep-dive.md)：参考 RRSI 与 Dream-RSI 的设计依据、评估与回放边界；首期范围以 DX SOW 收敛稿为准。

当前处于方案与 SOW 收敛阶段，尚未开展本期工程实施与验证。采用顾问牵头设计、实施指导与技术评审，工程团队负责实施与验证，项目方负责资料与环境协调、业务／专业要求确认及阶段交付接收的分工。本轮暂不确定时间、费用、患者数据结构和业务功能。

医院端本地临床模型部署项目已有前期讨论。DX 新讨论稿拓展到受控改进流程；本地部署条件与实际院内实施范围仍需分别确认。
