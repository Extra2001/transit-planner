# 北京时刻数据：CC BY-SA 4.0

**文件**：`cities/beijing/network.json`（由 `scripts/build-data.mjs` 从 `research/raw/bj_schedule_all.json` 生成）

**许可**：Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
<https://creativecommons.org/licenses/by-sa/4.0/>

你可以复制、分发、修改本数据，但必须：

- 保留署名与许可链接；
- 注明是否做了修改；
- 以相同许可（CC BY-SA 4.0）分发你的衍生数据。**不能用更严格的条款覆盖它**，也不能
  声称它「禁止商用」——CC BY-SA 4.0 本身允许商业使用。

## 上游来源

| 内容 | 来源 | 许可 |
| --- | --- | --- |
| 逐班时刻 | <https://github.com/BoyInTheSun/beijing-subway-schedule>（`train_schedule_all/schedule.json`，最后提交 2026-01-13） | CC BY-SA 4.0 |
| 换乘步行时间 | <https://github.com/Mick235711/Beijing-Subway-Tools>（`data/beijing/metadata.json5` 的 `transfers`） | MIT |
| 底层一手材料 | 北京地铁、京港地铁官网公布的车站逐班到站时刻表图片，经 OCR 与人工纠错 | 运营方公布信息 |

换乘步行时间为爱好者根据公开资料、实地体验与视频整理的估计值，并非运营方实测。

## 本项目的修改（CC BY-SA 4.0 要求注明）

- 统一站名：去除「(1号线)」一类线路后缀，合并同名换乘站；
- 剔除 6 号线「通过不停车」记录，避免把越行当作停站；
- 时刻由「时:分」换算为服务日分钟数，跨午夜保留 >1440 的分钟值；
- 重排为紧凑数组 JSON（`[dayType, line, dir, [stationIdx, minute, ...]]`）；
- 未合成任何缺失班次，未插值、未补齐。

## 再分发注意

- 直接分发 `cities/beijing/network.json` 时，须同时提供本文件与许可链接。
- 若把它并入其他数据集，该数据集整体需按 CC BY-SA 4.0 分发（ShareAlike 的传染性只作用于
  本数据的衍生部分，不改变本项目 MIT 代码的许可）。
