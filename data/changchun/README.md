# 长春 E 出行 table2 数据

## 当前状态（2026-10-30）

- 线路：8 条
- 车站：142 个唯一车站；168 个线路-车站对
- 已确认区段：4,943（其中走完整个导入站序 4,660）
- 站-线覆盖率：168/168 = 100%（不是班次覆盖率）
- 相邻站关联覆盖：97,267/97,594 对 = 99.7%
- 关联不唯一的腿：15/640 = 2.3%；这些腿断开，不写入车次
- 分段验证：21 组 unique / 11 组 partial / 0 组 insufficient
- 状态：**ready**，已生成 `network.json` 并接入 PWA

「区段」是已确认的相邻站乘车段：时刻表没有列车 ID，同一列车若在中途遇到关联不唯一的相邻站，会在该处被截断成两条区段。因此区段数不是实际开行班次，查询结果偏保守。

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
