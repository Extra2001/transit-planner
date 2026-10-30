# 架构设计：多城市逐班规划平台

本文描述重构后的目标结构。实现按阶段推进，未完成的条目会标注「后续阶段」。

## 目标

- 代码（MIT）、数据（逐数据集许可）、项目政策（非官方、非实时、非商业社区项目）三者分离。
- 新增城市 = 提交 `cities/<id>/city.json` + 数据文件 + 适配器，不改前端城市选择器、`City` 联合类型或路由核心。
- 首屏不加载任何城市时刻表；按城市按需加载并独立缓存、独立版本。
- 未获再分发授权的数据不进入公开构建产物。

## 分层

```
采集 collect ──► 原始响应 raw/            （本地，不入库）
解析 parse   ──► 逐站时刻 / 车次碎片       （本地中间产物）
标准化 normalize ─► 统一 NetworkData v2    （带 provenance）
校验 validate ──► schema + 业务规则        （运行时报错 / 测试断言）
重建 rebuild ──► 车次与关联确定性           （长春专用，见 table2.mjs）
发布 publish ──► cities/<id>/network.json  （受许可闸门控制）
```

阶段之间只通过文件或纯函数传递，任何阶段失败都不会产生「半发布」数据。

## 目录

```
packages/core/                 纯算法 + 类型 + schema，无任何数据文件
  src/types.ts                 NetworkData v1/v2、规划结果类型
  src/schema.ts                运行时校验 + v1→v2 迁移
  src/network.ts               createNetwork(data) → 索引化 Network
  src/router.ts                时间依赖 Dijkstra（接口不变）
  src/city.ts                  CityManifest / 许可 / 可用性类型

cities/<id>/
  city.json                    manifest（小，入库）
  network.json                 时刻数据（是否入库由许可决定）

apps/web/src/cities/
  registry.ts                  读取 manifest、排序、可用性
  loader.ts                    fetch + 内存缓存 + 版本
  cache.ts                     CacheStorage 离线包

tools/
  pipeline/                    分阶段 CLI（采集/解析/标准化/校验/重建/发布）
  changchun-import/            长春 table2 解析与重建
```

## 城市 manifest

```jsonc
{
  "schemaVersion": 1,
  "id": "beijing",
  "order": 10,
  "name": "北京地铁",
  "shortName": "北京",
  "dataUrl": "cities/beijing/network.json",
  "dataVersion": "2026-01-13",
  "networkSchemaVersion": 2,
  "license": {
    "id": "CC-BY-SA-4.0",
    "url": "https://creativecommons.org/licenses/by-sa/4.0/",
    "attribution": "BoyInTheSun/beijing-subway-schedule",
    "redistribution": "allowed"      // allowed | unclear | forbidden
  },
  "provenance": {
    "source": "…",
    "capturedAt": "2026-01-13",
    "validFrom": "2026-01-13",
    "validUntil": null,
    "official": false,
    "realtime": false
  },
  "defaults": { "from": "西直门", "to": "东单", "time": "08:00" },
  "notices": ["非官方计划时刻，不构成出行保证"]
}
```

`license.redistribution` 是发布闸门：`allowed` 的数据才会被 `data:sync` 复制进
`apps/web/public/cities/`，也才会随 npm 包/镜像分发。`unclear` 的城市 manifest 可以入库，
但数据文件被 `.gitignore` 排除，且只能由开发者本地 `--include-restricted` 生成。

## 加载与缓存

- manifest 在构建期通过 `import.meta.glob('cities/*/city.json')` 收集（体积极小）。
- 数据在运行时 `fetch(dataUrl?v=dataVersion)`，**不进入首屏 JS**。
- `loader.ts` 按 `id@dataVersion` 做内存缓存；Service Worker 对 `cities/` 走 CacheFirst，
  每个城市独立缓存条目，可在覆盖面板中显式「下载离线数据」。
- 城市可用性：`probeCity()` 先 `HEAD` 数据文件。公开构建里未授权的城市返回 404，
  选择器显示为「本地数据」，切换时给出说明而不是 404 报错。

## 站点身份

v1 的 `stations: string[]` 继续可读。v2：

```jsonc
"stations": [
  { "id": "beijing:station:xizhimen", "name": "西直门", "aliases": ["Xizhimen"],
    "stops": [{ "line": "l2" }, { "line": "l4" }, { "line": "l13" }] }
]
```

- `id` 稳定、跨版本可引用；缺省时按 `<city>:station:<name>` 生成，不改变现有文件。
- `name` 只用于显示；`aliases` 只用于搜索/兼容旧链接。
- `stops` 表达「同一换乘站的多条线路站点」，路由仍是站点索引 → 线路索引的映射，
  不改变算法。
- 个人换乘覆盖仍以站点**名称**为键（兼容已存的 localStorage），迁移留待后续。

## 服务日历

v1 的 `dayType`（0/1）保留在车次里。v2 增加：

```jsonc
"services": [
  { "id": "weekday", "label": "工作日", "dayType": 0, "days": [1,2,3,4,5],
    "exceptions": { "2026-10-01": "weekend" } },
  { "id": "weekend", "label": "双休日", "dayType": 1, "days": [6,7] }
]
```

`plan()` 接口不变，仍接受 `day: 'weekday' | 'weekend'`；新增可选 `date`，由
`resolveDayType(network, date)` 查日历与例外。UI 暂不强制改，保持两种日期类型按钮。

## 兼容性

- `createNetwork(data)` 同时接受 v1/v2，内部统一为 v2；路由、计划结果类型不变。
- `@transit/core` 不再导出任何网络单例；调用方必须显式传入数据。
- 现有 store 对外暴露的字段（`lines`、`stations`、`plan` 参数）保持，新增加载状态。

## 发布闸门

1. `npm run data:sync` 清空 `apps/web/public/cities/`，只复制 `redistribution: allowed` 的城市。
2. `npm run verify:public` 断言构建产物里不含受限城市数据（CI 必跑）。
3. 受限城市本地开发用 `INCLUDE_RESTRICTED_DATA=1 npm run build:local`，产物不得公开部署。
