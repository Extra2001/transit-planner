# 长春 E 出行 table2 离线导入

目标：把 E 出行 H5 的逐站时刻响应，解析、校验并匹配成可追溯的逐班数据。**不含 OCR、截图识别或浏览器自动化。**

## 已确认协议

- 线路/站点：`GET http://app.ccetravel.cn/micro/other/train/time/get/subwayLine/lines`
- 逐站时刻：`POST http://app.ccetravel.cn/micro/other/train/time/get/table2`
  ```json
  {"lineCode":"01","standCode":"0121","direction":"1","weekday":1}
  ```
- 接口实际返回 **JSON**（不是 XML）；解析器只接受 JSON，已移除 XML 依赖。
- `startInterval` 为小时，`paramsList[].time` 为两位分钟。
- 实测 `weekday` 0、3–7 返回空 list；1/2 有数据，1 比 2 班次密。导入器把 1/2 解释为工作日/双休日，但标记为**推断**，需 App/官方文案复核。

## 命令

```bash
node tools/changchun-import/import-table2.mjs build
node tools/changchun-import/import-table2.mjs status
node tools/changchun-import/import-table2.mjs rollback <version>
npm run test:changchun
```

`build` 只读 `data/changchun/raw/`，输出到 `data/changchun/imported/versions/<时间戳>/`，并更新 `current.json` 和 PWA 状态文件。

## 输入

- `data/changchun/raw/lines.json`：线路/站序/站码/方向端点。
- `data/changchun/raw/table2-<lineCode>-<standCode>-<direction>-<weekday>.json`：逐站响应。
- `data/changchun/raw/capture-manifest.json`：请求参数、响应哈希、采集时间、weekday 证据。

原始响应与导入快照默认被 `.gitignore` 忽略，不随 PWA 或仓库公开分发。

## 校验与闸门

- 首末班与 `firstDate`/`lastDate` 一致；
- 时刻严格递增、无重复、间隔异常告警；
- 方向端点、站名、站码、`directionType` 一致；
- 相邻站匹配使用单调最大基数 + 1–15 分钟区间约束；
- 匹配不唯一时记录歧义，不把推断轨迹用于精确赶车；
- 站-线覆盖率低于 95% 或匹配置信度低于 0.90 时，只生成 `network.partial.json`，不生成正式 `network.json`，不进入 PWA；
- 当前样本：8 条线、142 个唯一车站/168 个线路-车站对、4,843 班；站-线覆盖 **168/168 = 100%**；匹配可信度最低 90.6%/平均 97.3%；状态 **ready**。
- “站-线覆盖率”= 已导入的线路-车站对 / 全部线路-车站对；不是班次覆盖率，也不是匹配成功率。
- 全量采样命令（需明确授权）：`node tools/changchun-import/fetch-all.mjs --confirm-bulk --delay 3000 --jitter 1000`。

## 版本

每次 `build` 生成独立版本目录。`rollback <version>` 只切换 `current.json` 指针，不删除历史版本。

## 许可

E 出行数据使用条件未确认。仅处理用户提供/授权的少量样本；未获许可前不做全站批量采集，不公开再分发。维护流程见 [skills/changchun-data-maintenance/SKILL.md](../../skills/changchun-data-maintenance/SKILL.md)。
