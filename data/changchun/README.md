# 长春 E 出行 table2 数据

## 当前状态（2026-10-30）

- 线路：8 条
- 车站：142 个唯一车站；168 个线路-车站对
- 班次：4,843
- 站-线覆盖率：168/168 = 100%（不是班次覆盖率）
- 车次匹配可信度：最低 90.6%，平均 97.3%
- 状态：**ready**，已生成 `network.json` 并接入 PWA

## 目录

```
raw/       原始响应（lines.json、table2-*.json、capture-manifest.json）
imported/  版本快照、匹配报告、current.json
```

`raw/` 与 `imported/` 默认不提交；许可未确认，禁止公开再分发。

## 更新

```bash
node tools/changchun-import/import-table2.mjs build
node tools/changchun-import/import-table2.mjs status
node tools/changchun-import/import-table2.mjs rollback <version>
node tools/changchun-import/fetch-all.mjs --confirm-bulk --delay 3000 --jitter 1000
```

维护 agent 的操作规范见 [../../skills/changchun-data-maintenance/SKILL.md](../../skills/changchun-data-maintenance/SKILL.md)。
