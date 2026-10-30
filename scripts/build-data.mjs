/**
 * 构建前端离线时刻数据。
 *
 * 输入：
 *   research/raw/bj_schedule_all.json —— BoyInTheSun/beijing-subway-schedule 的
 *   train_schedule_all/schedule.json（CC BY-SA 4.0），由官方车站逐班时刻表图片经
 *   OCR + 人工纠错整理而来。
 *   research/raw/bst_metadata.json5 —— Beijing-Subway-Tools 的换乘步行时间手工整理
 *   （MIT），注：并非运营方实测值。
 *
 * 输出：packages/core/src/data/network.json
 *
 * 只保留 1/2/4/5 号线；1 号线裁剪到四惠以西（四惠—古城），因为汇总数据中西行
 * 只记录了四惠以西区段，裁剪可避免把缺失区段当成 0 分钟。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSON5 from 'json5'

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const raw = path.join(root, 'research/raw')

const LINE_DEFS = [
  {
    id: 'l1',
    src: '1号线八通线',
    name: '1号线',
    shortName: '1',
    color: '#A4343A',
    directions: { 东行: 'east', 西行: 'west' },
    trimAfter: '四惠'
  },
  {
    id: 'l2',
    src: '2号线',
    name: '2号线',
    shortName: '2',
    color: '#006098',
    directions: { 外环: 'outer', 内环: 'inner' }
  },
  {
    id: 'l4',
    src: '4号线大兴线',
    name: '4号线',
    shortName: '4',
    color: '#328D9A',
    directions: { 南行: 'south', 北行: 'north' }
  },
  {
    id: 'l5',
    src: '5号线',
    name: '5号线',
    shortName: '5',
    color: '#A6217F',
    directions: { 南行: 'south', 北行: 'north' }
  }
]

const META_LINE_NAMES = { '1号线': 'l1', '2号线': 'l2', '4号线': 'l4', '5号线': 'l5' }

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`无法解析时刻: ${hhmm}`)
  return Number(m[1]) * 60 + Number(m[2])
}

const schedule = JSON.parse(fs.readFileSync(path.join(raw, 'bj_schedule_all.json'), 'utf8'))
const meta = JSON5.parse(fs.readFileSync(path.join(raw, 'bst_metadata.json5'), 'utf8'))

// 1 号线保留段：以东行完整站序中四惠及其以西为准
const line1East = schedule['工作日']['1号线八通线']['东行']
const fullTrip = Object.values(line1East).sort((a, b) => b.length - a.length)[0]
const fourHuiIdx = fullTrip.findIndex(([name]) => name === '四惠')
if (fourHuiIdx < 0) throw new Error('1 号线站序中没有四惠')
const line1Keep = new Set(fullTrip.slice(0, fourHuiIdx + 1).map(([name]) => name))

const lines = []
const stations = []
const stationIndex = new Map()
let trips = []

function stationId(name) {
  if (!stationIndex.has(name)) {
    stationIndex.set(name, stations.length)
    stations.push(name)
  }
  return stationIndex.get(name)
}

for (const def of LINE_DEFS) {
  const lineIdx = lines.length
  const directions = Object.entries(def.directions).map(([srcName, id], i) => ({
    srcName,
    id,
    index: i
  }))
  lines.push({
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    color: def.color,
    directions: directions.map(({ id, srcName }) => ({ id, name: srcName }))
  })

  for (const dayType of ['工作日', '双休日']) {
    for (const dir of directions) {
      const srcTrips = schedule[dayType]?.[def.src]?.[dir.srcName]
      if (!srcTrips) throw new Error(`缺少 ${dayType} ${def.src} ${dir.srcName}`)
      for (const [virtualId, stops] of Object.entries(srcTrips)) {
        let filtered = stops
        if (def.trimAfter) filtered = stops.filter(([name]) => line1Keep.has(name))
        if (filtered.length < 2) continue

        // 到站时刻 → 服务日分钟；跨零点加 1440，夜班首站加 1440
        const flat = []
        let prev = -1
        let offset = 0
        for (const [name, hhmm] of filtered) {
          let m = toMinutes(hhmm)
          if (prev < 0 && m < 4 * 60) m += 1440
          while (prev >= 0 && m + offset < prev) offset += 1440
          m += offset
          flat.push(stationId(name), m)
          prev = m
        }
        trips.push({
          dayType: dayType === '工作日' ? 0 : 1,
          line: lineIdx,
          dir: dir.index,
          flat,
          virtualId
        })
      }
    }
  }
}

// 排序：日期类型 → 线路 → 方向 → 首站发车时刻，便于前端二分查找
trips.sort((a, b) => a.dayType - b.dayType || a.line - b.line || a.dir - b.dir || a.flat[1] - b.flat[1])

// 换乘：仅保留四条线之间的记录；同一线路对取首条（忽略高峰逆向等条件变体）
const transferMap = new Map()
for (const [stationName, records] of Object.entries(meta.transfers ?? {})) {
  const s = stationIndex.get(stationName)
  if (s === undefined) continue
  for (const rec of records) {
    const from = META_LINE_NAMES[rec.from]
    const to = META_LINE_NAMES[rec.to]
    if (!from || !to || from === to) continue
    const key = `${s}|${from}|${to}`
    if (transferMap.has(key)) continue
    transferMap.set(key, {
      s,
      from: lines.findIndex((l) => l.id === from),
      to: lines.findIndex((l) => l.id === to),
      sec: Math.round(rec.minutes * 60),
      est: true
    })
  }
}

// 换乘站必须双向都有记录；缺失方向补默认 180 秒并标记估计
const stationLines = new Map()
for (const t of trips) {
  const lineIdx = t.line
  for (let i = 0; i < t.flat.length; i += 2) {
    const s = t.flat[i]
    if (!stationLines.has(s)) stationLines.set(s, new Set())
    stationLines.get(s).add(lineIdx)
  }
}
const warnings = []
for (const [s, set] of stationLines) {
  if (set.size < 2) continue
  const arr = [...set]
  for (const a of arr) {
    for (const b of arr) {
      if (a === b) continue
      const key = `${s}|${lines[a].id}|${lines[b].id}`
      if (!transferMap.has(key)) {
        transferMap.set(key, { s, from: a, to: b, sec: 180, est: true, fallback: true })
        warnings.push(`${stations[s]} ${lines[a].name}→${lines[b].name} 无整理值，使用默认 180 秒`)
      }
    }
  }
}

const transfers = [...transferMap.values()]

// 换乘站列表（供 UI 标注）
const interchangeStations = [...stationLines.entries()]
  .filter(([, set]) => set.size >= 2)
  .map(([s, set]) => ({ s, lines: [...set].map((i) => lines[i].id) }))

const out = {
  meta: {
    title: '北京地铁 1/2/4/5 号线逐班计划时刻（原型裁剪）',
    generatedAt: new Date().toISOString(),
    dataUpdatedAt: '2026-01-13',
    dataUpdatedNote:
      '汇总文件 train_schedule_all/schedule.json 的最后提交日期；各线底层官方时刻图整理时间更早（4 号线约 2025-01，1/2/5 号线 2026 年上半年）。仅代表计划时刻，不含实时运行调整。',
    source: {
      name: 'BoyInTheSun/beijing-subway-schedule',
      url: 'https://github.com/BoyInTheSun/beijing-subway-schedule',
      license: 'CC BY-SA 4.0',
      upstream:
        '北京地铁、京港地铁官网公布的车站逐班到站时刻表图片，经 OCR 与人工纠错整理；2024-07 起数据由 Mick235711/Beijing-Subway-Tools（MIT）汇出。'
    },
    transferSource: {
      name: 'Mick235711/Beijing-Subway-Tools 的 data/beijing/metadata.json5',
      url: 'https://github.com/Mick235711/Beijing-Subway-Tools',
      license: 'MIT',
      note: '换乘步行时间为爱好者手工整理/推算，非运营方实测；仅作估计，可按步速缩放。'
    },
    coverage:
      '北京地铁 1 号线（四惠—古城段）、2 号线、4 号线大兴线、5 号线；工作日/双休日两套图。不含节假日专用图、临时调整、实时延误。',
    stats: {
      lines: lines.length,
      stations: stations.length,
      trips: trips.length,
      transfers: transfers.length,
      interchanges: interchangeStations.length
    },
    warnings: [
      '换乘步行时间为爱好者整理/推算值，非运营方实测；西直门 2 号线→4 号线记录仅 30 秒，可能明显偏短，相关方案需谨慎。',
      '时刻数据为计划图，不含节假日专用图、临客、故障与临时限流；实际运营以现场为准。'
    ]
  },
  stations,
  lines: lines.map((l) => ({
    id: l.id,
    name: l.name,
    shortName: l.shortName,
    color: l.color,
    directions: l.directions
  })),
  interchanges: interchangeStations,
  transfers,
  // [dayType, lineIdx, dirIdx, [stationIdx, minute, ...]]
  trips: trips.map((t) => [t.dayType, t.line, t.dir, t.flat])
}

const outPath = path.join(root, 'packages/core/src/data/network.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(out))

const size = fs.statSync(outPath).size
console.log(`写出 ${outPath}`)
console.log(`线路 ${lines.length}，车站 ${stations.length}，列车 ${trips.length}，换乘边 ${transfers.length}`)
console.log(`大小 ${(size / 1024 / 1024).toFixed(2)} MiB`)
if (warnings.length) console.log('警告：\n' + warnings.join('\n'))
