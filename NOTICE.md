# 数据许可与署名

本仓库采用分层许可，代码、各城市数据、调研材料各自独立，**不可互相套用**。

| 内容 | 位置 | 许可 | 再分发 |
| --- | --- | --- | --- |
| 代码 | `packages/`、`apps/`、`scripts/`、`tools/` | MIT（`LICENSE`） | 允许 |
| 北京时刻数据 | `cities/beijing/network.json` | CC BY-SA 4.0 | 允许（须署名 + 相同许可） |
| 长春时刻数据 | `cities/changchun/network.json` | 未确认 | **不允许**，默认不随仓库/构建分发 |
| 换乘步行时间 | 已并入北京数据文件 | MIT（上游） | 允许 |
| 调研原始材料 | `research/` | 多种 | 多数未确认，仅存档 |
| 界面截图、研究报告 | `research/screenshots/`、`research/report.md` | MIT | 允许 |

详细说明：

- [data/licenses/README.md](data/licenses/README.md)
- [data/licenses/beijing.md](data/licenses/beijing.md)
- [data/licenses/changchun.md](data/licenses/changchun.md)
- [data/licenses/research-artifacts.md](data/licenses/research-artifacts.md)
- [docs/DATA-LICENSES.md](docs/DATA-LICENSES.md)（逐文件审计、Git 历史影响、可选项）

## 公开构建的硬约束

1. 只有 `license.redistribution: allowed` 的城市数据会被 `npm run data:sync` 复制进
   `apps/web/public/cities/`。
2. `npm run build` 结束时执行 `npm run verify:public`，发现未授权城市数据即失败。
3. 受限城市（当前为长春）只能在本地用 `INCLUDE_RESTRICTED_DATA=1 npm run build:local` 构建。

## 免责声明

时刻与换乘时间均可能过时或含整理错误。本项目为非官方社区项目，不提供实时到站，
不构成出行保证；实际出行请以运营方现场信息为准。
