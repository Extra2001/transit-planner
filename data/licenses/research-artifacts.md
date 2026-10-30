# 调研原始材料：`research/`

这些文件是研究过程留档，**不是**产品数据，**不是**发布物，也不受 `LICENSE-DATA` 中北京
CC BY-SA 4.0 的覆盖。多数材料的再利用条件未确认，按「仅存档、不再分发」处理。

## 分类

| 文件 | 性质 | 来源 | 再分发 |
| --- | --- | --- | --- |
| `raw/bj_schedule_all.json`（9.8MB） | 北京逐班时刻上游导出 | BoyInTheSun/beijing-subway-schedule | 允许，CC BY-SA 4.0（保留署名与相同许可） |
| `raw/bst_*.json5`、`raw/metadata.schema.json5`、`raw/bst_spec.md` | 各线站表与换乘元数据 | Mick235711/Beijing-Subway-Tools | 允许，MIT（保留版权声明） |
| `raw/om_bj_*.json`、`raw/om_cc_*.json`、`raw/om_quality.md` | 开放数据检索结果与质量记录 | 第三方开放数据检索，具体许可逐项未核实 | **未确认**，仅研究 |
| `raw/mtr_*.html`、`raw/mtr_station_timetable*.jpg` | 港铁页面与站台时刻图截图 | 运营方公开页面 | **未确认**，仅研究 |
| `raw/cc_timetable1.jpg`、`raw/cc_timetable_notice.html`、`raw/ccqg_home.html` | 长春相关页面与时刻图 | 运营方公开页面 | **未确认**，仅研究 |
| `raw/*.html`、`raw/*.js`、`raw/*.txt`（检索页、接口脚本、抓取片段） | 抓取/检索留痕 | 公开网页 | **未确认**，仅研究 |
| `screenshots/*.png` | 本项目界面截图 | 本项目 | MIT（与代码一致） |
| `report.md` | 本项目研究报告 | 本项目 | MIT |

## 影响

- 仓库公开可见，因此上述「仅研究」文件目前仍随仓库分发。若要彻底规避风险，应把
  `research/raw` 整体移出仓库（保留本地），只留 `report.md` 与截图。
- 这一动作会改写工作区文件而非提交历史；是否执行由维护者决定，见
  [../docs/DATA-LICENSES.md](../docs/DATA-LICENSES.md) 的「可选项」。
- 公开构建（`apps/web/dist`）不包含 `research/` 任何内容。
