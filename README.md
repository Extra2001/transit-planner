# 逐班换乘 · 北京（可行性研究原型）

基于**逐班计划时刻**的北京地铁换乘优化器：给定出发站、目的站、时间、步速与换乘安全余量，计算最早到达方案，并同时给出「保守步行」与「1.35× 冲刺」两套结果、赶车余量、错过后下一班与预计损失。

> 这是可行性研究的最小原型，不是实时导航产品。数据为计划时刻，不含延误、临客、临时限流与节假日专用图。

## 先看结论

- **北京可以做**「计划时刻级」的逐班换乘优化：官方以图片发布车站逐班时刻表，已有开源项目完成 OCR 与结构化。
- **长春协议已确认、覆盖不足**：E 出行 H5 table2 已实测；当前 1 号线 2 站/173 班样本，覆盖率约 13%，状态 partial，未开放查询。
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

已确认 E 出行 H5 的 table2 接口与字段：`startInterval` 是小时、`paramsList[].time` 是分钟。当前用少量样本验证了协议与跨站匹配，但**样本只覆盖 1 号线 2 站/173 班（约 13%），状态为 partial，未开放长春查询**；可用 `npm run changchun:status` 查看。

```bash
node tools/changchun-import/import-table2.mjs build   # 读取 data/changchun/raw，离线导入
node tools/changchun-import/import-table2.mjs status
node tools/changchun-import/import-table2.mjs rollback <version>
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
packages/core/          # 与框架无关的 TS：数据模型、时间依赖图、最早到达、换乘建议
  src/router.ts         # 时间依赖 Dijkstra（状态 = 车站 × 线路）
  src/network.ts        # 车次/站点/换乘索引
  src/data/network.json # 构建期生成的离线数据（3.41 MiB）
apps/web/               # Vue 3 + Pinia + TypeScript + Vite PWA
scripts/build-data.mjs  # 从原始时刻表生成 28 条线数据
research/               # 调研报告与原始数据快照
```

- **纯前端**：没有后端；数据在构建期裁剪并随包发布，查询在浏览器内完成。
- **全覆盖**：28 条线、425 站，原生可搜索车站选择器；线路覆盖/缺口/版本可在页面底部展开。
- **PWA**：`vite-plugin-pwa` 预缓存全部静态资源，离线可重新打开并查询。
- **实测性能**：全网单次查询（含两套方案与逐换乘分析）约 **3–26 ms**（Apple Silicon / Node 24，随换乘次数变化）；构建产物约 3.68 MB JS（gzip 1.14 MB），数据 3.41 MiB。

## 算法要点

1. 节点为「车站 × 线路」，乘车边来自每一班车的实际站序与到站时刻；6 号线通过不停车不生成上下车站点。
2. 到站后二分查找下一班可坐车次；换乘边按「步行基础时间 ÷ 步速 + 安全余量」计费。
3. 保守方案按正常步速；冲刺方案按 1.35× 步速，两套各跑一次最早到达。
4. 对每个换乘输出：走完后的余量、冲刺可赶上的前一班及全程收益、错过后下一班及预计晚到；同时显示来源/可信度/风险。
5. 同一线路对的方向/时段变体取保守上界；西直门 2→4 的 30 秒原值保留并提示测量条件，不自动改写。
6. 用户可在换乘卡片录入 0–1800 秒个人实测，写入 localStorage，优先于整理值。
7. 无车、超出覆盖范围、缺少换乘数据均显式返回，不补造班次。

## 数据与许可

- **代码**：MIT，见 [LICENSE](LICENSE)。
- **时刻数据**：衍生自 [BoyInTheSun/beijing-subway-schedule](https://github.com/BoyInTheSun/beijing-subway-schedule)（CC BY-SA 4.0），其底层为北京地铁/京港地铁官网公布的车站逐班时刻表图片，经 OCR 与人工纠错。数据文件以 CC BY-SA 4.0 提供，见 [LICENSE-DATA](LICENSE-DATA)。
- **换乘步行时间**：衍生自 [Mick235711/Beijing-Subway-Tools](https://github.com/Mick235711/Beijing-Subway-Tools) 的 `metadata.json5`（MIT），为爱好者整理/推算值。
- 详见 [NOTICE.md](NOTICE.md)。

## 已知限制

- 计划时刻而非实时；调图、临客、故障、限流都会造成偏差。
- 不含节假日专用图；节假日请按实际运营图选择工作日/双休日。
- 换乘步行时间为估计值；西直门 2→4 仅 30 秒（distance 0、stairs 37、无方向条件），反向 4→2 为 2.5 分钟/100 米/86 级台阶；原值保留并提示“疑为局部测量”。
- 78 个同站线路对缺少整理值，按 180 秒默认估计，已在覆盖面板/换乘卡片标注。
- 6 号线待避列车发车时刻未知，按到站时刻保守处理；越行通过站已剔除，不允许上下车。
- 2/10 号线环线在端点折返，闭环段依赖反方向列车；1 号线苹果园、17 号线望京西未在班次中停靠。
- 查询时刻按「已到达站台」计，不含进站、安检、站厅步行。
- 长春 table2 仅完成协议与 2 站样本验证（1 号线、173 班、覆盖率约 13%），状态 partial，不能做长春查询。
- 未实现票价、首末班单独提示、无障碍路径、逐站台/最佳车厢数据。
