# 数据许可与署名

本仓库采用分层许可：

| 内容 | 许可 | 来源 |
| --- | --- | --- |
| 代码（`packages/`、`apps/`、`scripts/`） | MIT | 本项目 |
| 时刻数据（`packages/core/src/data/network.json`） | CC BY-SA 4.0 | BoyInTheSun/beijing-subway-schedule |
| 换乘步行时间（已并入上述数据文件） | MIT（上游） | Mick235711/Beijing-Subway-Tools |

## 时刻数据

- 来源仓库：https://github.com/BoyInTheSun/beijing-subway-schedule
- 上游文件：`train_schedule_all/schedule.json`，最后提交 2026-01-13。
- 上游说明：数据来自北京地铁、京港地铁官网公布的车站**逐班到站时刻表图片**，经 OCR 与人工纠错整理；2024-07 起由 Beijing-Subway-Tools 汇出。
- 许可：Creative Commons Attribution-ShareAlike 4.0 International（CC BY-SA 4.0）。
- 本项目的裁剪、字段重排与时刻换算属于衍生作品，按 CC BY-SA 4.0 提供。再分发时请保留本署名、许可链接并注明修改。

## 换乘步行时间

- 来源仓库：https://github.com/Mick235711/Beijing-Subway-Tools
- 文件：`data/beijing/metadata.json5` 的 `transfers` 字段。
- 许可：MIT。
- 说明：为爱好者根据公开资料、实地体验与视频整理的估计值，并非运营方实测；本项目未做独立测量。

## 免责声明

时刻与换乘时间均可能过时或含整理错误。本项目为可行性研究原型，不构成出行保证；实际出行请以运营方现场信息为准。
