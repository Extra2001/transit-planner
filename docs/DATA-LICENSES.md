# 数据许可审计与风险处置

本文回答三个问题：仓库里每类文件从哪来、能不能再分发、历史里留下了什么。
**本文只报告，不执行历史重写、不 force push。** 处置方案见文末「可选项」。

## 1. 分级

| 级别 | 含义 | 典型位置 | 是否入库 | 是否进公开构建 |
| --- | --- | --- | --- | --- |
| C 代码 | 本项目原创 | `packages/`、`apps/`、`scripts/`、`tools/` | 是 | 是（编译后） |
| U 上游数据 | 第三方以明确许可发布 | `research/raw/bj_schedule_all.json`、`research/raw/bst_*` | 是 | 否（构建时转成 G） |
| G 生成数据 | 本项目从 U/本地采集生成 | `cities/beijing/network.json` | 是 | 是 |
| G* 生成数据（受限） | 许可未确认的生成数据 | `cities/changchun/network.json` | **否** | **否** |
| L 本地采集 | 原始响应、导入快照 | `data/changchun/raw/`、`data/changchun/imported/` | 否 | 否 |
| R 调研材料 | 抓取页面、截图、检索结果 | `research/raw/`（大部分）、`research/screenshots/` | 是 | 否 |
| B 构建产物 | `dist`、PWA 缓存 | `apps/web/dist/`、`apps/web/public/cities/` | 否 | — |

## 2. 逐文件审计

### 2.1 代码与配置（C，MIT）

`packages/**`、`apps/**`、`scripts/**`、`tools/**`、`docs/**`、`skills/**`、
`README.md`、`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig*.json`。

- 许可：MIT（根目录 `LICENSE`），**本轮未改动**。
- 依赖：Vue / Pinia / Vite / Workbox / Puppeteer 等均为 MIT 或 Apache-2.0，未引入
  GPL/AGPL 或「禁止商用」类依赖。

### 2.2 上游数据（U）

| 文件 | 来源 | 许可 | 再分发 |
| --- | --- | --- | --- |
| `research/raw/bj_schedule_all.json`（9.8MB） | BoyInTheSun/beijing-subway-schedule | CC BY-SA 4.0 | 允许，须署名 + 相同许可 |
| `research/raw/bst_*.json5`、`metadata.schema.json5`、`bst_spec.md` | Mick235711/Beijing-Subway-Tools | MIT | 允许，保留版权声明 |
| `research/raw/om_bj_*.json`、`om_cc_*.json`、`om_quality.md` | 第三方开放数据检索导出（逐项许可未核实） | 未确认 | **仅研究，不再分发** |
| `research/raw/mtr_*`、`cc_timetable1.jpg`、`cc_timetable_notice.html`、`ccqg_home.html` | 运营方公开页面/时刻图截图 | 未确认 | **仅研究，不再分发** |
| `research/raw/*.html`、`*.js`、`*.txt`（检索页、接口脚本、抓取片段） | 公开网页留痕 | 未确认 | **仅研究，不再分发** |
| `research/screenshots/*.png`、`research/report.md` | 本项目 | MIT | 允许 |

### 2.3 生成数据（G / G*）

| 文件 | 输入 | 许可 | 再分发 | 公开构建 |
| --- | --- | --- | --- | --- |
| `cities/beijing/network.json`（3.5MB） | `bj_schedule_all.json` + `bst_metadata` | CC BY-SA 4.0 | 允许 | **是** |
| `cities/changchun/network.json`（816KB） | 本地采集（L） | 未确认 | **否** | **否** |
| `cities/changchun/status.json` | 同上 | 未确认 | **否** | **否** |
| `cities/*/city.json` | 本项目手写 | MIT | 允许 | 是（作为元数据） |

长春数据在本轮之前位于 `apps/web/src/data/changchun-network.json`、`changchun-status.json`。
现在已 `git rm --cached`（文件保留在本地并移动到 `cities/changchun/`），并被 `.gitignore` 忽略。

### 2.4 本地采集（L）

`data/changchun/raw/`（原始 HTTP 响应）、`data/changchun/imported/`（导入快照）、
`data/changchun/README.md`（说明文档，已入库且不含原始响应内容）。

- 未入库；`npm run changchun:*` 读写这些目录。
- CI 不依赖它们（相关测试在缺少本地数据时自动 skip）。

### 2.5 明确不属于本仓库的内容

- 运营方接口的访问凭证、Cookie、个人账号信息：未采集、未存储。
- 用户位置、行程记录：无。
- 第三方地图瓦片、字体文件：无（界面使用系统字体与内联 SVG）。

## 3. Git 历史影响（报告，不处置）

事实：

1. 长春数据文件在 `0a99087` 及更早的多个提交中被追踪，历史 blob 仍在对象库中。
2. 任何人 `git clone` 后都可以用 `git log --all -- apps/web/src/data/changchun-network.json`
   定位并 `git show` 出完整内容。
3. GitHub 的 fork、缓存、Release 附件、PR 引用不受新提交影响；删除 HEAD 中的文件
   不等于撤回已公开内容。
4. 因此本轮改动只能保证「从当前提交起不再分发」，**不能**保证「历史上从未分发」。

风险评估：

- 数据为公开查询接口的低频快照，不含个人信息、不含访问凭证。
- 主要风险是「未经许可复制数据库」的著作权/合同风险，随使用规模与商业化程度上升。
- 项目本身非商业、非官方、已声明免责，风险低于商业再利用，但不为零。

## 4. 可选项（由维护者决定，本轮不执行）

| 方案 | 操作 | 效果 | 代价 |
| --- | --- | --- | --- |
| **A. 维持现状**（默认） | 只在 HEAD 停止分发，历史保留 | 成本最低；历史仍可取回 | 不能声称「从未分发」 |
| B. 平台侧删除 | 通过 GitHub Support 申请清除特定路径的历史（不涉及 force push） | 平台层面减少暴露 | 需平台受理，可能被拒；fork 无法覆盖 |
| C. 重写历史 | `filter-repo` + force push 全部分支 | 彻底移除 | **本轮明确不做**：破坏所有克隆、引用与协作记录 |
| D. 迁移新仓库 | 新建仓库，只导入当前干净树，旧仓库归档 | 新旧分离，历史可控 | 需迁移 Issues/Stars/链接；旧库仍在 |
| E. 移出调研材料 | 将 `research/raw` 中 R 类文件移出仓库 | 降低「仅研究」材料的暴露 | 需维护者确认是否保留研究可复现性 |

在维护者决定前，补充约束已经生效：

- `data:sync` 默认不复制受限城市；
- `verify:public` 在构建后断言产物无受限数据；
- CI 在干净检出（无 `data/changchun/raw`、无受限数据）上跑通；
- 文档、界面、NOTICE 均不再把长春数据描述为 CC BY-SA 4.0 或「可再分发」。

## 5. 新增城市时的检查单

1. 在 `cities/<id>/city.json` 写清 `license.id/url/attribution/redistribution`。
2. `redistribution` 不是 `allowed` 时，**不要**提交数据文件，加入 `.gitignore`。
3. 在 `data/licenses/<id>.md` 写来源、采集方式、修改内容、分发限制。
4. 更新 `NOTICE.md` 与 `data/licenses/README.md` 的表格。
5. 跑 `npm run build && npm run verify:public`，确认产物只含允许分发的城市。
