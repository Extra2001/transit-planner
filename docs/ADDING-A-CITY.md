# 新增一个城市

目标：只新增「manifest + 数据文件 + 适配器」，**不改** `packages/core`、不改城市选择器、
不改路由核心。

## 0. 先确认许可

没有明确的可再分发许可，就走「仅本地」路径：

- `city.json` 里 `license.redistribution` 写 `unclear`（或 `forbidden`）；
- **不要** `git add` 数据文件，把它加进 `.gitignore`；
- 在 `data/licenses/<id>.md` 写明来源、采集方式、限制；
- 本地验证用 `INCLUDE_RESTRICTED_DATA=1 npm run build:local`。

`redistribution: allowed` 只在拿到明确条款（CC、MIT、ODbL、书面许可等）后使用。

## 1. 目录

```
cities/<id>/
  city.json      # 必须入库，描述与许可
  network.json   # 数据，按许可决定是否入库
  status.json    # 可选，导入质量/覆盖统计
```

`apps/web/public/cities/` 是 `npm run data:sync` 生成物，不要手改，也不要提交。

## 2. manifest

```json
{
  "schemaVersion": 1,
  "id": "demo",
  "order": 30,
  "name": "示例轨道交通",
  "shortName": "示例",
  "dataUrl": "cities/demo/network.json",
  "dataVersion": "2026-01-01",
  "networkSchemaVersion": 2,
  "license": {
    "id": "CC0-1.0",
    "url": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attribution": "示例数据（合成）",
    "redistribution": "allowed",
    "file": "data/licenses/demo.md"
  },
  "provenance": {
    "source": "手工合成",
    "capturedAt": "2026-01-01",
    "validFrom": "2026-01-01",
    "validUntil": null,
    "official": false,
    "realtime": false,
    "synthetic": true,
    "modified": "无"
  },
  "defaults": { "from": "甲站", "to": "乙站", "time": "08:00" },
  "notices": ["合成数据，仅用于演示。"],
  "ui": { "tripUnit": "班", "sourceLabel": "生成" }
}
```

字段约定：

- `order`：城市选择器顺序，越小越靠前。
- `dataVersion`：改了数据就改它，前端用它做缓存键，避免旧数据被 CacheFirst 命中。
- `ui`：仅放展示文案，不放业务逻辑。
- `provenance.synthetic: true` 的城市必须在 `notices` 里明确写「合成/演示」。

## 3. 数据格式

支持两种，`createNetwork()` 会在运行时校验并归一：

**v1（扁平，历史格式）**

```json
{
  "meta": { "schemaVersion": 1, "title": "...", "aggregateUpdatedAt": "2026-01-01", "counts": {} },
  "stations": ["甲站", "乙站"],
  "lines": [{ "id": "demo-1", "name": "示例线", "shortName": "1", "color": "#00843d", "textColor": "#fff",
              "mode": "metro", "status": "supported", "confidence": "high",
              "stationCount": 2, "tripCount": 10, "dataDate": "2026-01-01",
              "source": { "name": "合成", "url": "https://example.com", "license": "CC0-1.0" },
              "notes": [], "directions": [{ "name": "上行" }] }],
  "transfers": [],
  "trips": [[0, 0, 0, [0, 480, 1, 483]]]
}
```

`trips` 元素：`[dayType, lineIndex, directionIndex, [stationIndex, minute, stationIndex, minute, ...]]`，
`minute` 为服务日分钟数，跨午夜保留 >1440。

**v2（推荐，带稳定 ID 与别名）**

```json
{
  "schemaVersion": 2,
  "city": "demo",
  "meta": { "...": "同 v1" },
  "stations": [
    { "id": "demo:station:jia", "name": "甲站", "aliases": ["甲"], "stops": [{ "line": "demo-1" }] },
    { "id": "demo:station:yi", "name": "乙站", "stops": [{ "line": "demo-1" }] }
  ],
  "lines": [], "transfers": [], "trips": [],
  "services": [{ "id": "weekday", "label": "工作日", "dayType": 0, "days": [1,2,3,4,5] }]
}
```

约束：

- 站点 `name` 是显示名，必须唯一；`aliases` 只用于搜索，不参与路由。
- 换乘站按「多线路共享同一站点记录」建模，不要为每条线复制同名的两个站。
- 无法确定的车次关联不要编造：断开或标为不确定，宁缺勿假。

## 4. 适配器

现成参考：

- `tools/demo-city/generate.mjs`：最小适配器（合成数据，可直接复制改名）；
- `scripts/lib/to-v2.mjs`：把 v1 扁平数据补成 v2（稳定 ID、别名、站点-线路关系）；
- `scripts/lib/publish-city.mjs`：统一发布层，写 `network.json` + `status.json`，
  并把 manifest 的许可/来源带进 status。

```js
import { toV2 } from '../../scripts/lib/to-v2.mjs'
import { publishCity, readManifest } from '../../scripts/lib/publish-city.mjs'

const network = toV2(v1Data, { city: 'demo' })
publishCity({ cityId: 'demo', network, status, manifest: readManifest(root, 'demo'), root })
```


把上游数据转成上面的格式，放在 `tools/<id>-import/` 或 `scripts/`，要求：

- 分阶段：采集 / 原始解析 / 归一化 / 校验 / 车次重建 / 发布；
- 输出旁挂 `status.json`：覆盖数、歧义数、来源、采集时间、有效期、许可状态；
- 可重复执行，版本化输出，失败可回滚；
- 不在适配器里写死前端任何文案。

## 5. 验证

```bash
npm run data:validate        # schema 校验（对每个有数据的城市）
npm test                     # 核心算法回归
npm run build                # 同步 → 构建 → 产物许可检查
npm run dev                  # 手动点一遍：切换城市、默认起终点、查询
```

检查项：

- [ ] 城市选择器出现新城市，默认起终点来自 manifest；
- [ ] 首屏 JS 体积没有因为新城市显著变大（数据按需加载）；
- [ ] 断网刷新后，已下载的城市仍可查询；
- [ ] `apps/web/dist/cities/` 只含允许分发的城市；
- [ ] 未授权数据未提交（`git status` 干净）。
