---
name: changchun-data-maintenance
description: 维护长春 E 出行 table2 逐班计划时刻数据；仅做低频、限量、可追溯的接口采样与离线导入，不含 OCR/截图识别。
---

# 长春 E 出行 table2 数据维护

## 何时使用

需要新增/更新长春轨道交通逐班计划时刻、复核已有样本、或回退数据版本时使用。

## 硬性边界

- **不做 OCR、不做截图识别、不做浏览器自动化**；数据源只有 table2 接口响应。
- 不伪造认证、不绕过 401/403/429/验证码/访问限制。
- 未确认服务条款与再利用许可前，**不做全站批量采集、不公开再分发**。
- 默认串行、低频、限量：请求间隔 3–5 秒并加轻微随机抖动；用户明确授权时可降到约 1 秒，但仍须串行、设总上限、遇限制即停。
- 不并发扫描、不高频重试、不请求无关接口。
- 原始响应与导入快照默认被 `.gitignore` 忽略，仅本地保留。

## 接口

线路/站点：

```
GET http://app.ccetravel.cn/micro/other/train/time/get/subwayLine/lines
```

逐站时刻：

```
POST http://app.ccetravel.cn/micro/other/train/time/get/table2
Content-Type: application/json

{"lineCode":"01","standCode":"0121","direction":"1","weekday":1}
```

最小必要请求头（实测可用）：

```
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1
Accept: application/json, text/plain, */*
Content-Type: application/json
Origin: http://app.ccetravel.cn
Referer: http://app.ccetravel.cn/
```

不要复制无关 Cookie/认证头。

## weekday 语义（实测，非官方枚举）

- 0、3、4、5、6、7：`list` 为空。
- 1：176 班（北环城路，方向 1）。
- 2：139 班。
- 导入器把 1/2 解释为工作日/双休日，但标记 `inferred`；需要 App/官方文案复核。不要仅凭字段名硬编码。

## 数据流

1. `data/changchun/raw/lines.json`：线路、站序、站码、方向端点。
2. `data/changchun/raw/table2-<lineCode>-<standCode>-<direction>-<weekday>.json`。
3. `data/changchun/raw/capture-manifest.json`：请求参数、响应哈希、采集时间、请求策略、weekday 证据。
4. 运行：

```bash
node tools/changchun-import/import-table2.mjs build
node tools/changchun-import/import-table2.mjs status
node tools/changchun-import/import-table2.mjs rollback <version>
npm run test:changchun
```

5. 输出：`data/changchun/imported/versions/<时间戳>/`，含 `station-times/`、`match-report.json`、`network.partial.json`，必要时 `network.json`；`current.json` 指向当前版本；`apps/web/src/data/changchun-status.json` 是给 UI 的精简状态（不含时刻）。

## 校验与匹配规则

- `startInterval` = 小时，`paramsList[].time` = 分钟；严格递增、无重复、首末班与响应字段一致。
- 方向端点、站名、站码、`directionType` 必须与线路表一致。
- 相邻站匹配：单调最大基数 + 1–5 分钟区间约束（实测相邻站时刻差主峰 1–4 分钟；放宽窗口会引入与发车间隔同余的错位配对）。
- 关联确定性逐对判定：禁用该配对后最大基数下降，才算数据唯一确定；只有确定配对写入车次，其余断开、不跨腿配对。
- 缺站/跳站：缺口两侧不跨站匹配。
- 站-线覆盖率 <95%、相邻站关联覆盖 <90% 或关联不唯一的腿 >10%：只生成 partial，不进入正式查询。
- 车次数是「已确认区段数」，不是实际开行班次；汇报时不得把数量覆盖说成概率。

## 验收门槛

- [ ] 原始响应与请求参数已保存、哈希可核对。
- [ ] 无 401/403/429/验证码绕过。
- [ ] weekday 1/2 的推断有记录，未被当成官方定义。
- [ ] `match-report.json` 无不可解释的歧义/缺站。
- [ ] 站-线覆盖 ≥95%、相邻站关联覆盖 ≥90%、关联不唯一腿 ≤10%。
- [ ] 每组 `verification` 不为 `insufficient`，且 `gaps` 为空。
- [ ] 版本快照可回退。
- [ ] 许可未确认时，未公开再分发。

## 当前样本

- 8 条线、142 个唯一车站/168 个线路-车站对、4,943 条已确认区段（整线 4,660）；站-线覆盖 100%；相邻站关联覆盖 99.7%；关联不唯一 15/640 段。
- 状态 ready；已生成 `network.json` 并接入 PWA 城市切换。

## 禁止事项

- 不要新增 OCR、截图导入、tesseract、Vision 或类似依赖。
- 不要为了“看起来完整”补造班次或跨缺口强行匹配。
- 不要在未获许可时抓取全线路或把原始响应提交到公开仓库。
