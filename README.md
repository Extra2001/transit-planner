# 逐班换乘 · 多城市轨道交通（可行性研究原型）

基于**逐班计划时刻**的北京地铁换乘优化器：给定出发站、目的站、时间、步速与换乘安全余量，计算最早到达方案，并同时给出「保守步行」与「1.35× 冲刺」两套结果、赶车余量、错过后下一班与预计损失。

> 这是可行性研究的最小原型，不是实时导航产品。数据为计划时刻，不含延误、临客、临时限流与节假日专用图。

## 先看结论

- **北京可以做**「计划时刻级」的逐班换乘优化：官方以图片发布车站逐班时刻表，已有开源项目完成 OCR 与结构化。
- **长春已全量导入**：8 条线、142 个唯一车站（168 个线路-车站对）、4,943 条已确认区段（整线 4,660）；站-线覆盖 168/168，相邻站关联覆盖 99.7%，关联不唯一 15/640 段，已开放查询。
- **没有发现**公开、文档化、允许第三方直接调用的北京/长春实时列车 API。因此本原型不做实时。
- 换乘步行时间来自爱好者整理/推算，**不是运营方实测**；UI 中标注为「估计」，并支持按步速缩放与安全余量。

完整的来源、许可、覆盖率、更新频率、成本与风险对照见 [research/report.md](research/report.md)。

## 原型覆盖

- **北京地铁全网 28 条线**：1–19 号线、亦庄线、房山线、S1 线、昌平线、西郊线、亦庄 T1 线、燕房线、首都机场线、大兴机场线
- **425 座车站、19,844 班车**（工作日 + 双休日）、104 座换乘站、299 个换乘变体
- 逐线记录数据来源、BST 截止日期、站表缺口、越行/待避、环线端点与可信度
- 数据汇总版本：`train_schedule_all/schedule.json` 最后提交于 **2026-01-13**

其中 6 条线标记为「待核验」但仍可查询：

- 1 号线：BST 站表含苹果园、缺八角游乐园；按汇总班次为准
- 2 / 10 号线：环线在端点折返，闭环段依赖反方向列车
- 6 号线：含通过不停车与待避记录，越行已从可上下车站序中剔除
- 14 号线：汇总班次含陶然桥，BST 旧站表未列
- 17 号线：望京西未在班次中停靠

## 长春

> 长春数据的再分发许可未确认，**默认不随仓库分发、不进公开构建**。本地可用
> `INCLUDE_RESTRICTED_DATA=1 npm run build:local` 启用，公开站点只有北京。
> 详见 [data/licenses/changchun.md](data/licenses/changchun.md)。

已确认 E 出行 H5 的 table2 接口与字段：`startInterval` 是小时、`paramsList[].time` 是分钟。当前为 8 条线、142 个唯一车站（168 个线路-车站对）、4,943 条已确认区段；状态 `ready`。可用 `npm run changchun:status` 查看。

时刻表没有列车 ID，车次由相邻站时刻的单调最大匹配重建：只保留在**所有**最大匹配中都出现的配对，其余配对断开、不写入车次。因此「班次」是**已确认区段数**（同一列车若在中途被不确定关联截断会计成两段），不是实际开行班次。

```bash
node tools/changchun-import/import-table2.mjs build   # 读取 data/changchun/raw，离线导入
node tools/changchun-import/import-table2.mjs status
node tools/changchun-import/import-table2.mjs rollback <version>
node tools/changchun-import/fetch-all.mjs --confirm-bulk --delay 3000 --jitter 1000
npm run test:changchun
```

导入器只读取本地原始响应，不发起网络请求；覆盖不足或匹配不唯一时只生成 partial，不进入正式路径搜索。原始响应与导入快照默认不随仓库分发。数据维护步骤见 [skills/changchun-data-maintenance/SKILL.md](skills/changchun-data-maintenance/SKILL.md)。

## 快速开始

要求 Node.js ≥ 20.19（建议 22+）。

```bash
npm install
npm run build:data   # 从 research/raw 生成 packages/core/src/data/network.json
npm run dev          # http://localhost:5173
```

生产构建与本地预览：

```bash
npm run build
npm run preview      # http://localhost:4173
```

测试与类型检查：

```bash
npm test
npm run typecheck
```

## 结构

```
packages/core/          # 与框架无关的 TS：数据模型、时间依赖图、最早到达、换乘建议、schema 校验
  src/router.ts         # 时间依赖 Dijkstra（状态 = 车站 × 线路）
  src/network.ts        # createNetwork(data)：车次/站点/换乘索引
  src/schema.ts         # 运行时校验 + v1/v2 迁移
cities/<id>/city.json   # 城市 manifest（来源、许可、默认起终点、提示）
cities/<id>/network.json# 城市时刻数据，按许可决定是否入库
apps/web/               # Vue 3 + Pinia + TypeScript + Vite PWA
  src/cities/registry.ts# 构建期收集 manifest，新增城市无需改前端代码
  src/cities/loader.ts  # 按需 fetch + 缓存 + 离线下载
scripts/sync-cities.mjs # 只把允许再分发的城市数据同步进 public/
scripts/build-data.mjs  # 北京适配器：原始时刻表 → cities/beijing/network.json
tools/changchun-import/ # 长春适配器（采集/解析/重建/发布）
research/               # 调研报告与原始材料快照
```

- **纯前端**：没有后端；城市数据按需下载，查询在浏览器内完成。
- **多城市**：城市由 `cities/*/city.json` 驱动，可选城市、默认起终点、免责声明都来自 manifest。
- **按需加载**：首屏 JS 约 120 KB（gzip 46 KB），3.4 MB 北京数据在选中城市后才下载并缓存。
- **许可闸门**：只有 `license.redistribution: allowed` 的数据进入公开构建，构建后自动检查产物。
- **PWA**：静态资源预缓存；城市数据用 CacheFirst 运行时缓存，可在覆盖面板手动「下载离线数据」。
- **实测性能**：全网单次查询（含两套方案与逐换乘分析）约 **3–26 ms**（Apple Silicon / Node 24，随换乘次数变化）。

设计说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，风险清单见 [docs/RISKS.md](docs/RISKS.md)。

## 算法要点

1. 节点为「车站 × 线路」，乘车边来自每一班车的实际站序与到站时刻；6 号线通过不停车不生成上下车站点。
2. 到站后二分查找下一班可坐车次；换乘边按「步行基础时间 ÷ 步速 + 安全余量」计费。
3. 保守方案按正常步速；冲刺方案按 1.35× 步速，两套各跑一次最早到达。
4. 对每个换乘输出：走完后的余量、冲刺可赶上的前一班及全程收益、错过后下一班及预计晚到；同时显示来源/可信度/风险。
5. 同一线路对的方向/时段变体取保守上界；西直门 2→4 的 30 秒原值保留并提示测量条件，不自动改写。
6. 用户可在换乘卡片录入 0–1800 秒个人实测，写入 localStorage，优先于整理值。
7. 无车、超出覆盖范围、缺少换乘数据均显式返回，不补造班次。

## 数据与许可

分层许可，各城市独立，不可互相套用：

| 内容 | 许可 | 分发 |
| --- | --- | --- |
| 代码（`packages/`、`apps/`、`scripts/`、`tools/`） | MIT，见 [LICENSE](LICENSE) | 允许 |
| 北京时刻与换乘数据（`cities/beijing/network.json`） | CC BY-SA 4.0，见 [data/licenses/beijing.md](data/licenses/beijing.md) | 允许（须署名 + 相同许可） |
| 长春时刻数据（`cities/changchun/`） | **未确认**，见 [data/licenses/changchun.md](data/licenses/changchun.md) | **不允许**，默认不随仓库、不进公开构建 |
| 调研原始材料（`research/raw/`） | 多种，多为仅研究 | 见 [data/licenses/research-artifacts.md](data/licenses/research-artifacts.md) |

- 北京时刻源自 [BoyInTheSun/beijing-subway-schedule](https://github.com/BoyInTheSun/beijing-subway-schedule)，底层为北京地铁/京港地铁官网公布的车站逐班时刻表图片，经 OCR 与人工纠错。
- 换乘步行时间源自 [Mick235711/Beijing-Subway-Tools](https://github.com/Mick235711/Beijing-Subway-Tools)（MIT），为爱好者整理/推算值，非运营方实测。
- 长春数据来自 E 出行 H5 `table2` 接口的低频本地采集，**未取得再分发授权**，因此只保留 manifest 与说明文档。
- 「本项目禁止商用」之类的使用声明只约束本项目，不构成对任何数据的授权。

详见 [NOTICE.md](NOTICE.md)、[docs/DATA-LICENSES.md](docs/DATA-LICENSES.md)。
新增城市见 [docs/ADDING-A-CITY.md](docs/ADDING-A-CITY.md)，贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 已知限制

- 计划时刻而非实时；调图、临客、故障、限流都会造成偏差。
- 不含节假日专用图；节假日请按实际运营图选择工作日/双休日。
- 换乘步行时间为估计值；西直门 2→4 仅 30 秒（distance 0、stairs 37、无方向条件），反向 4→2 为 2.5 分钟/100 米/86 级台阶；原值保留并提示“疑为局部测量”。
- 78 个同站线路对缺少整理值，按 180 秒默认估计，已在覆盖面板/换乘卡片标注。
- 6 号线待避列车发车时刻未知，按到站时刻保守处理；越行通过站已剔除，不允许上下车。
- 2/10 号线环线在端点折返，闭环段依赖反方向列车；1 号线苹果园、17 号线望京西未在班次中停靠。
- 查询时刻按「已到达站台」计，不含进站、安检、站厅步行。
- 长春数据为 8 条线/4,943 条已确认区段，站-线覆盖 100%、相邻站关联覆盖 99.7%；关联不唯一的 15/640 段已断开，班次可能少于实际开行，结果偏保守。换乘时间按 180 秒默认估计，不适合把结果当作绝对精确的赶车依据。
- 未实现票价、首末班单独提示、无障碍路径、逐站台/最佳车厢数据。
