# 数据许可总览

本仓库按「代码 / 数据 / 文档」分层许可，不同城市的数据来源不同，**不能互相套用**。

| 层 | 位置 | 许可 | 说明 |
| --- | --- | --- | --- |
| 代码 | `packages/`、`apps/`、`scripts/`、`tools/` | MIT（见根目录 `LICENSE`） | 本项目原创 |
| 北京时刻数据 | `cities/beijing/network.json` | CC BY-SA 4.0 | 见 [beijing.md](beijing.md) |
| 长春时刻数据 | `cities/changchun/network.json`（不入库） | 未确认 | 见 [changchun.md](changchun.md) |
| 调研原始材料 | `research/` | 多种，且多为「仅研究」 | 见 [research-artifacts.md](research-artifacts.md) |

## 三条硬规则

1. **代码许可是 MIT，不因数据许可而改变。** 数据许可也不因代码是 MIT 而放宽。
2. **只有 `redistribution: allowed` 的数据会进入公开构建。** 由 `npm run data:sync` 与
   `npm run verify:public` 强制执行；长春数据默认只在本地存在。
3. **「本项目禁止商用」不是数据授权。** 项目的使用声明只约束本项目自身，不能替数据来源方授权，
   也不能作为再利用长春数据的依据。

新增城市时，必须在该城市 `city.json` 的 `license` 字段写明 `id`、`url`、`attribution`、
`redistribution`，并在此目录补一份说明文件。详见 [../docs/ADDING-A-CITY.md](../docs/ADDING-A-CITY.md)。
