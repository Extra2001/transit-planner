# 长春 E 出行 table2 数据

## 当前状态（2026-10-30）

- 线路：1 号线
- 车站：2 站（北环城路、庆丰路）
- 班次：173（方向 2，工作日）
- 覆盖率：2/15 ≈ 13.3%
- 车次匹配：173/173，无歧义
- 状态：**partial**，未生成正式 `network.json`，未开放查询

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
```

维护 agent 的操作规范见 [../../skills/changchun-data-maintenance/SKILL.md](../../skills/changchun-data-maintenance/SKILL.md)。
