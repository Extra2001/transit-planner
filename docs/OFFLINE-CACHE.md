# 城市数据离线缓存与完整性校验

## 目标

1. 用户点过「下载离线数据」的城市，断网后仍能查询。
2. 缓存按城市、按 `dataVersion` 分开，切换城市或升级数据不会互相覆盖。
3. 旧版本、已下线城市不会永久占着存储。
4. 数据损坏或与 `status.json` 摘要不符时明确报错，而不是悄悄按错数据算路线。

## 数据布局

```
apps/web/dist/cities/<id>/network.json   # 时刻数据
apps/web/dist/cities/<id>/status.json    # 覆盖/来源/许可/dataSha256/byteSize
apps/web/dist/cities/<id>/city.json      # manifest（构建期 import.meta.glob 读取）
```

- 请求 URL 带版本号：`/cities/beijing/network.json?v=2026-01-13`，缓存键天然区分版本。
- Service Worker 使用 `CacheFirst`、缓存名 `transit-city-data`，且 **不预缓存** `cities/**`。

## 完整性校验

- 发布时就地计算：`scripts/lib/publish-city.mjs` 写 `network.json` 后立刻生成
  `status.json.dataSha256` 与 `byteSize`。
- 加载时校验：`loadCityNetwork()` 并行取 `network.json` 与 `status.json`，
  用 `crypto.subtle` 对响应字节算 SHA-256，不一致抛
  `CityDataUnavailable('integrity')`，界面提示「数据校验失败…请重新下载」。
- 离线下载同样先校验再写入 CacheStorage（`cacheCityOffline`），避免把损坏内容缓存下来。
- 缺少 `dataSha256`（例如受限城市的旧 status）时跳过校验并正常加载，不阻塞本地流程。
- 手工改动数据后运行 `npm run data:hash` 重算摘要，否则会被判定为损坏。

摘要函数与判定规则在 `packages/core/src/city-cache.ts`，纯函数、Node 与浏览器通用。

## 缓存清理

`pruneCityCache(manifest)` 在每次成功加载或离线下载后运行：

| 条目 | 处理 |
| --- | --- |
| 其他城市的当前版本 | 保留 |
| 同一城市的旧 `dataVersion` | 删除 |
| 已从注册表下线的城市 | 删除 |
| 没有 `?v=` 的旧格式条目 | 删除 |
| 非 `/cities/<id>/` 的条目 | 不动 |

选择规则是纯函数 `staleCacheEntries(urls, {cityId, dataVersion, knownCityIds})`，
删除动作由浏览器侧执行。当前实现是「按需清理」：每次加载某个城市时顺手清掉该城市的
过期条目与已下线城市。不做定时全量扫描，避免启动时遍历大缓存。

## 尚未实现（按需再加）

- 缓存占用量展示与「清理缓存」按钮：需要 `navigator.storage.estimate()`，UI 改动较大，
  当前只保留 `pruneCityCache` 与 `clearable` 接口位置。
- 后台更新（stale-while-revalidate）：当前 `dataVersion` 变化后，用户重新下载即更新。
- 缓存配额不足时的降级策略：目前失败只是返回 `false`，界面提示下载失败。

## 探测与回退

`probeCity()` 用 HEAD 探测，`classifyProbe(status, contentType)` 把
「200 + 非 JSON」判为 `missing`。Vite 开发服务器对不存在的 `/cities/**` 会返回
`index.html`（200 + text/html），只看状态码会把缺失城市误判为可用，随后
`JSON.parse('<!doctype …')` 直接失败。现在缺失城市会显示「本地」标记并自动回退到
可用城市；`npm run dev` 也会把本地受限/合成数据同步进来，避免出现空城。

## 测试

| 文件 | 覆盖 |
| --- | --- |
| `packages/core/test/city-cache.test.ts` | URL 解析、清理选择（同城旧版本/他城/下线/无版本）、SHA-256 向量、摘要不符、已发布城市摘要一致性 |
| 端到端手测 | 加载北京 → 注入旧版本缓存条目 → 重载后旧条目被清、当前版本保留；篡改 `dist/cities/beijing/network.json` 后加载出现「数据校验失败」 |
