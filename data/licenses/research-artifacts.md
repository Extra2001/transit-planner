# 调研原始材料：`research/`

这些文件是研究过程留档，**不是**产品数据，**不是**发布物，也不受 `LICENSE-DATA` 中北京
CC BY-SA 4.0 的覆盖。

处置结果（方案 E）：只保留**明确许可的上游数据**与**本项目原创**（截图、报告）入库；
运营方页面、抓取留痕、许可不明的第三方导出已移出 Git 追踪，文件仍保留在本地
`research/raw/`，`.gitignore` 用白名单兜底，新抓取的文件不会再被误提交。

## 分类

| 文件 | 性质 | 来源 | 再分发 |
| --- | --- | --- | --- |
| 文件 | 性质 | 来源 | 再分发 | 入库 |
| --- | --- | --- | --- | --- |
| `raw/bj_schedule_all.json`（9.8MB） | 北京逐班时刻上游导出 | BoyInTheSun/beijing-subway-schedule | 允许，CC BY-SA 4.0（保留署名与相同许可） | 保留 |
| `raw/bst_*.json5`、`raw/metadata.schema.json5`、`raw/bst_spec.md` | 各线站表、换乘元数据、格式说明 | Mick235711/Beijing-Subway-Tools | 允许，MIT（保留版权声明） | 保留 |
| `raw/om_bj_*.json`、`raw/om_cc_*.json`、`raw/om_quality.md` | 开放数据检索结果与质量记录 | 第三方开放数据检索，具体许可逐项未核实 | **未确认**，仅研究 | 移出，本地留存 |
| `raw/mtr_*.html`、`raw/mtr_station_timetable*.jpg` | 港铁页面与站台时刻图截图 | 运营方公开页面 | **未确认**，仅研究 | 移出，本地留存 |
| `raw/cc_timetable1.jpg`、`raw/cc_timetable_notice.html`、`raw/ccqg_home.html` | 长春相关页面与时刻图 | 运营方公开页面 | **未确认**，仅研究 | 移出，本地留存 |
| `raw/*.html`、`raw/*.js`、`raw/*.txt`（检索页、接口脚本、抓取片段） | 抓取/检索留痕 | 公开网页 | **未确认**，仅研究 | 移出，本地留存 |
| `screenshots/*.png` | 本项目界面截图（已逐张核对内容） | 本项目 | MIT（与代码一致） | 保留 |
| `report.md` | 本项目研究报告 | 本项目 | MIT | 保留 |

## 执行记录

- 已按方案 E 移出 23 个未确认文件（`git rm --cached`，**未删除本地文件**）：
  5 个网页/接口脚本、4 个港铁页面、4 个运营方时刻图与页面、5 个开放数据导出、
  5 个检索留痕文件。
- `.gitignore` 对 `research/raw/` 采用白名单：只允许上表「保留」的 32 个文件，
  其余本地文件一律忽略；新增抓取不会误入库。
- 未执行历史重写：这些文件仍存在于既往提交中，按 [../docs/DATA-LICENSES.md](../docs/DATA-LICENSES.md)
  第 5 节的说明处理。
- 构建不依赖被移出的材料：`scripts/build-data.mjs` 只读 `bj_schedule_all.json`
  与 `bst_*.json5`；`npm run build` 在干净克隆上通过。
- 公开构建（`apps/web/dist`）不包含 `research/` 任何内容。
