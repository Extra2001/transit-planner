# 贡献指南

## 环境

- Node.js >= 20.19，npm >= 10
- 首次：`npm ci`
- 本地开发：`npm run dev`（会先同步可公开的城市数据到 `apps/web/public/cities/`）

## 提交前必须通过

```bash
npm run typecheck   # core + web 类型检查
npm test            # 核心算法与数据测试
npm run build       # 数据同步 → 构建 → 产物许可检查
```

`npm run build` 末尾的 `verify:public` 会断言构建产物里没有未授权数据；它失败说明数据边界被破坏，
不要绕过，修数据放置位置。

## 代码边界

- `packages/core` 是纯算法与类型，**不允许** import 任何城市数据、浏览器 API、Vue。
- `apps/web` 只通过 `cities/<id>/city.json` 与运行时加载器接触数据，不写死城市分支。
- 新增城市见 [docs/ADDING-A-CITY.md](docs/ADDING-A-CITY.md)。

## 数据规则（重要）

1. **不要提交许可未确认的数据。** 当前长春（`cities/changchun/network.json`、`status.json`）
   与 `data/changchun/raw|imported` 都被 `.gitignore` 忽略，提交前确认 `git status` 干净。
2. 不要为了跑通 CI 去抓取运营方接口。CI 不联网、不需要原始响应，相关测试在缺少本地数据时自动 skip。
3. 不要用「本项目禁止商用」作为数据授权依据，也不要给 CC BY-SA 数据附加更严格限制。
4. 修改北京数据必须同步更新 `data/licenses/beijing.md` 的「本项目的修改」一节。

## 提交与 PR

- 一个 PR 做一件事；算法改动请带回归测试。
- 提交信息用中文或英文均可，写清「为什么」而不只是「改了什么」。
- 不要 force push 共享分支，不要重写已推送历史。
- 涉及数据来源、许可、采集方式的变更，请在 PR 描述中单独说明。

## 报告问题

- 换乘时间、时刻错误：请附城市、线路、车站、日期类型与具体时间，便于复现。
- 安全问题：见 [SECURITY.md](SECURITY.md)。
