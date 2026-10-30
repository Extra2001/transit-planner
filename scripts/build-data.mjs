/**
 * 构建前端离线时刻数据（北京全网）。
 *
 * 数据：
 *   research/raw/bj_schedule_all.json  BoyInTheSun/beijing-subway-schedule（CC BY-SA 4.0）
 *   research/raw/bst_*.json5           Beijing-Subway-Tools（MIT）线路元数据/站序/截止日期
 *   research/raw/bst_metadata.json5    换乘步行与站内条件（MIT，爱好者整理）
 *
 * 原则：
 *   - 班次只来自 schedule.json 的实际车次，不按间隔补班。
 *   - 6 号线 `(HH:MM` 表示通过不停车，直接丢弃该停站，避免允许上下车；
 *     `HH:MM-` 表示待避，保留到站时刻，但发车时刻未知（按到站时刻保守处理）。
 *   - 站名统一去掉 `(x号线)` 后缀；1 号线苹果园、17 号线望京西未在班次中停靠，
 *     记为 stationGaps，不补造班次。
 *   - 换乘步行按方向/时段存为多个变体，路由取保守上界；30 秒原值保留并标风险。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSON5 from 'json5'

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const raw = path.join(root, 'research/raw')

const LINE_DEFS = [
  { sched: '1号线八通线', file: 'line1', id: 'l1', name: '1号线', short: '1', mode: 'metro' },
  { sched: '2号线', file: 'line2', id: 'l2', name: '2号线', short: '2', mode: 'metro' },
  { sched: '3号线', file: 'line3', id: 'l3', name: '3号线', short: '3', mode: 'metro' },
  { sched: '4号线大兴线', file: 'line4', id: 'l4', name: '4号线', short: '4', mode: 'metro' },
  { sched: '5号线', file: 'line5', id: 'l5', name: '5号线', short: '5', mode: 'metro' },
  { sched: '6号线', file: 'line6', id: 'l6', name: '6号线', short: '6', mode: 'metro' },
  { sched: '7号线', file: 'line7', id: 'l7', name: '7号线', short: '7', mode: 'metro' },
  { sched: '8号线', file: 'line8', id: 'l8', name: '8号线', short: '8', mode: 'metro' },
  { sched: '9号线', file: 'line9', id: 'l9', name: '9号线', short: '9', mode: 'metro' },
  { sched: '10号线', file: 'line10', id: 'l10', name: '10号线', short: '10', mode: 'metro' },
  { sched: '11号线', file: 'line11', id: 'l11', name: '11号线', short: '11', mode: 'metro' },
  { sched: '12号线', file: 'line12', id: 'l12', name: '12号线', short: '12', mode: 'metro' },
  { sched: '13号线', file: 'line13', id: 'l13', name: '13号线', short: '13', mode: 'metro' },
  { sched: '14号线', file: 'line14', id: 'l14', name: '14号线', short: '14', mode: 'metro' },
  { sched: '15号线', file: 'line15', id: 'l15', name: '15号线', short: '15', mode: 'metro' },
  { sched: '16号线', file: 'line16', id: 'l16', name: '16号线', short: '16', mode: 'metro' },
  { sched: '17号线', file: 'line17', id: 'l17', name: '17号线', short: '17', mode: 'metro' },
  { sched: '18号线', file: 'line18', id: 'l18', name: '18号线', short: '18', mode: 'metro' },
  { sched: '19号线', file: 'line19', id: 'l19', name: '19号线', short: '19', mode: 'metro' },
  { sched: '亦庄线', file: 'yizhuang-line', id: 'yz', name: '亦庄线', short: '亦庄', mode: 'metro' },
  { sched: '房山线', file: 'fangshan-line', id: 'fs', name: '房山线', short: '房山', mode: 'metro' },
  { sched: 'S1线', file: 'line-s1', id: 's1', name: 'S1线', short: 'S1', mode: 'maglev' },
  { sched: '昌平线', file: 'changping-line', id: 'cp', name: '昌平线', short: '昌平', mode: 'metro' },
  { sched: '西郊线', file: 'xijiao-line', id: 'xj', name: '西郊线', short: '西郊', mode: 'tram' },
  { sched: '亦庄T1线', file: 'yizhuang-t1-line', id: 't1', name: '亦庄T1线', short: 'T1', mode: 'tram' },
  { sched: '燕房线', file: 'yanfang-line', id: 'yf', name: '燕房线', short: '燕房', mode: 'metro' },
  { sched: '首都机场线', file: 'capital-airport-express', id: 'cae', name: '首都机场线', short: '机场', mode: 'airport' },
  { sched: '大兴机场线', file: 'daxing-airport-express', id: 'dae', name: '大兴机场线', short: '大兴机场', mode: 'airport' }
]

const LINE_NAME_TO_ID = {}
for (const def of LINE_DEFS) {
  LINE_NAME_TO_ID[def.name] = def.id
  LINE_NAME_TO_ID[def.sched] = def.id
}
LINE_NAME_TO_ID['1号线'] = 'l1'
LINE_NAME_TO_ID['4号线'] = 'l4'

const DAYS = [
  { key: '工作日', id: 0, label: '工作日' },
  { key: '双休日', id: 1, label: '双休日' }
]

const schedule = JSON.parse(fs.readFileSync(path.join(raw, 'bj_schedule_all.json'), 'utf8'))
const meta = JSON5.parse(fs.readFileSync(path.join(raw, 'bst_metadata.json5'), 'utf8'))

function canon(name) {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`无法解析时刻: ${hhmm}`)
  return Number(m[1]) * 60 + Number(m[2])
}

function parseToken(rawToken) {
  let token = String(rawToken).trim()
  let pass = false
  let dwellUnknown = false
  if (token.startsWith('(')) {
    pass = true
    token = token.slice(1)
  }
  if (token.endsWith('-')) {
    dwellUnknown = true
    token = token.slice(0, -1)
  }
  return { minute: toMinutes(token), pass, dwellUnknown }
}

function luminanceTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 165 ? '#1c2430' : '#ffffff'
}

function parseDate(text) {
  const m = /数据截止\s*(\d{4})\/(\d{2})\/(\d{2})/.exec(text)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// ---------- 站点与线路元数据 ----------
const stationNames = []
const stationIndex = new Map()
function stationId(name) {
  const c = canon(name)
  if (!stationIndex.has(c)) {
    stationIndex.set(c, stationNames.length)
    stationNames.push(c)
  }
  return stationIndex.get(c)
}

const lines = []
const lineBySched = new Map()

for (const def of LINE_DEFS) {
  const fileText = fs.readFileSync(path.join(raw, `bst_${def.file}.json5`), 'utf8')
  const lineFile = JSON5.parse(fileText)
  const bstStations = (lineFile.stations ?? []).map((s) => canon(typeof s === 'string' ? s : s.name))
  const schedDirs = Object.keys(schedule['工作日']?.[def.sched] ?? {})
  if (schedDirs.length !== 2) throw new Error(`${def.name} 方向数异常: ${schedDirs.length}`)

  const directions = schedDirs.map((name, i) => ({
    id: ['east', 'west', 'south', 'north', 'outer', 'inner', 'ne', 'sw', 'in', 'out'][0] && directionId(name),
    name,
    index: i
  }))

  const line = {
    id: def.id,
    name: def.name,
    shortName: def.short,
    color: lineFile.color ?? '#666666',
    textColor: luminanceTextColor(lineFile.color ?? '#666666'),
    mode: def.mode,
    loop: Boolean(lineFile.loop),
    directions,
    source: {
      name: 'BoyInTheSun/beijing-subway-schedule + Mick235711/Beijing-Subway-Tools',
      url: 'https://github.com/BoyInTheSun/beijing-subway-schedule',
      license: 'CC BY-SA 4.0（汇总时刻） / MIT（线路元数据）',
      file: `data/beijing/${def.file}.json5`
    },
    dataDate: parseDate(fileText),
    aggregateDate: '2026-01-13',
    confidence: 'high',
    status: 'supported',
    stationCount: 0,
    bstStationCount: bstStations.length,
    tripCount: 0,
    passEntries: 0,
    dwellUnknown: 0,
    stationGaps: [],
    extraStations: [],
    missingAdjacency: [],
    notes: []
  }
  lines.push(line)
  lineBySched.set(def.sched, { def, line, bstStations, index: lines.length - 1 })
}

function directionId(name) {
  const map = {
    东行: 'east', 西行: 'west', 南行: 'south', 北行: 'north',
    外环: 'outer', 内环: 'inner', 东北行: 'ne', 西南行: 'sw',
    进城: 'in', 出城: 'out'
  }
  return map[name] ?? 'unknown'
}

// ---------- 班次 ----------
const trips = []
const tripStationsByLine = new Map() // lineId -> Set(stationName)
const pairsByLine = new Map()
const longestByLine = new Map()
const passByLine = new Map()
const dwellByLine = new Map()

for (const { def, line, bstStations } of [...lineBySched.values()]) {
  tripStationsByLine.set(def.id, new Set())
  pairsByLine.set(def.id, new Set())
  longestByLine.set(def.id, [])
  passByLine.set(def.id, 0)
  dwellByLine.set(def.id, 0)
  for (const day of DAYS) {
    for (let dirIdx = 0; dirIdx < line.directions.length; dirIdx++) {
      const dirName = line.directions[dirIdx].name
      const srcTrips = schedule[day.key]?.[def.sched]?.[dirName]
      if (!srcTrips) throw new Error(`缺少班次: ${day.key} ${def.sched} ${dirName}`)
      for (const [virtualId, rawStops] of Object.entries(srcTrips)) {
        const stops = []
        let prev = -1
        let offset = 0
        let passCount = 0
        let dwellCount = 0
        for (const [rawName, rawTime] of rawStops) {
          const tok = parseToken(rawTime)
          if (tok.pass) {
            passCount++
            continue
          }
          if (tok.dwellUnknown) dwellCount++
          let m = tok.minute
          if (prev < 0 && m < 4 * 60) m += 1440
          while (prev >= 0 && m + offset < prev) offset += 1440
          m += offset
          const s = stationId(rawName)
          if (stops.length > 0 && stops[stops.length - 1].s === s) {
            // 同一站重复条目：保留较早到站，不制造 0 距离边
            continue
          }
          stops.push({ s, m, dwellUnknown: tok.dwellUnknown })
          prev = m
        }
        if (stops.length < 2) continue
        for (let i = 1; i < stops.length; i++) {
          if (stops[i].m < stops[i - 1].m) {
            throw new Error(`时刻倒序: ${def.name} ${dirName} ${virtualId}`)
          }
        }
        const flat = []
        for (const st of stops) flat.push(st.s, st.m)
        trips.push([day.id, lines.indexOf(line), dirIdx, flat])
        passByLine.set(def.id, passByLine.get(def.id) + passCount)
        dwellByLine.set(def.id, dwellByLine.get(def.id) + dwellCount)
        if (stops.length > (longestByLine.get(def.id)?.length ?? 0)) {
          longestByLine.set(def.id, stops.map((st) => stationNames[st.s]))
        }
        for (let i = 0; i < stops.length; i++) {
          tripStationsByLine.get(def.id).add(stationNames[stops[i].s])
          if (i > 0) {
            pairsByLine.get(def.id).add(`${stationNames[stops[i - 1].s]}>${stationNames[stops[i].s]}`)
          }
        }
      }
    }
  }
}

// ---------- 线路完整性与逐线元数据 ----------
for (const { def, line, bstStations } of [...lineBySched.values()]) {
  const tripStations = tripStationsByLine.get(def.id)
  const bstSet = new Set(bstStations)
  const gaps = bstStations.filter((s) => !tripStations.has(s))
  const extras = [...tripStations].filter((s) => !bstSet.has(s))
  const pairs = pairsByLine.get(def.id)
  const canonicalOrder = longestByLine.get(def.id) ?? []
  const missing = []
  for (let i = 1; i < canonicalOrder.length; i++) {
    const a = canonicalOrder[i - 1]
    const b = canonicalOrder[i]
    if (!tripStations.has(a) || !tripStations.has(b)) continue
    if (!pairs.has(`${a}>${b}`) && !pairs.has(`${b}>${a}`)) missing.push(`${a}—${b}`)
  }
  if (line.loop && canonicalOrder.length > 1) {
    const a = canonicalOrder[canonicalOrder.length - 1]
    const b = canonicalOrder[0]
    if (tripStations.has(a) && tripStations.has(b) && !pairs.has(`${a}>${b}`) && !pairs.has(`${b}>${a}`)) {
      missing.push(`${a}—${b}（环线闭合段）`)
    }
  }

  line.stationCount = tripStations.size
  line.tripCount = trips.filter((t) => t[1] === lines.indexOf(line)).length
  line.passEntries = passByLine.get(def.id)
  line.dwellUnknown = dwellByLine.get(def.id)
  line.stationGaps = gaps
  line.extraStations = extras
  line.missingAdjacency = missing

  if (gaps.length) line.notes.push(`BST 站表有、但汇总班次未停靠: ${gaps.join('、')}`)
  if (extras.length) line.notes.push(`汇总班次有、但 BST 站表未列: ${extras.join('、')}`)
  if (missing.length) line.notes.push(`未找到相邻区间班次: ${missing.join('、')}`)
  if (line.passEntries) line.notes.push(`含 ${line.passEntries} 个通过不停车记录（已从可上下车站序剔除）`)
  if (line.dwellUnknown) line.notes.push(`含 ${line.dwellUnknown} 个待避记录，发车时刻未知，按到站时刻保守处理`)
  if (line.loop) line.notes.push('环线：班次在端点折返，闭环段依赖反方向列车；未合成闭环边')

  const incomplete = gaps.length > 0 || missing.some((m) => !m.includes('环线闭合段')) || extras.length > 0
  line.status = incomplete ? 'review' : line.loop || line.passEntries || line.dwellUnknown ? 'review' : 'supported'
  line.confidence = incomplete || line.passEntries || line.dwellUnknown ? 'medium' : 'high'
}

// ---------- 换乘 ----------
const transferVariants = []
const directionIndexById = new Map(lines.map((l) => [l.id, new Map(l.directions.map((d) => [d.name, d.index]))]))

function dirIndex(lineId, name) {
  if (!name) return undefined
  return directionIndexById.get(lineId)?.get(name)
}

const seenTransferKeys = new Set()
for (const [stationName, records] of Object.entries(meta.transfers ?? {})) {
  const sName = canon(stationName)
  if (!stationIndex.has(sName)) continue
  const s = stationIndex.get(sName)
  for (const rec of records) {
    const fromId = LINE_NAME_TO_ID[rec.from]
    const toId = LINE_NAME_TO_ID[rec.to]
    if (!fromId || !toId || fromId === toId) continue
    const from = lines.findIndex((l) => l.id === fromId)
    const to = lines.findIndex((l) => l.id === toId)
    if (from < 0 || to < 0) continue
    const fromDirection = dirIndex(fromId, rec.from_direction)
    const toDirection = dirIndex(toId, rec.to_direction)
    const windows = Array.isArray(rec.apply_time)
      ? rec.apply_time.map((w) => ({
          day: w.date_group === '工作日' ? 0 : w.date_group === '双休日' ? 1 : 2,
          start: w.start ? toMinutes(w.start) : undefined,
          end: w.end ? toMinutes(w.end) : undefined
        }))
      : undefined
    const seconds = Math.round(rec.minutes * 60)
    const key = [s, from, to, seconds, fromDirection ?? '', toDirection ?? '', JSON.stringify(windows ?? null)].join('|')
    if (seenTransferKeys.has(key)) continue
    seenTransferKeys.add(key)
    const caution =
      sName === '西直门' && fromId === 'l2' && toId === 'l4'
        ? '原始记录 0.5 分钟、distance 0、stairs 37，且无方向条件；反向 4→2 为 2.5 分钟/100 米/86 级台阶。疑为特定车厢/楼梯口的局部测量，保留原值，建议实测确认。'
        : seconds <= 30
          ? '不超过 30 秒，可能只覆盖同台/短通道；建议按实际车门位置复核。'
          : undefined
    transferVariants.push({
      s,
      from,
      to,
      sec: seconds,
      fromDirection,
      toDirection,
      fromPlatform: rec.from_platform ?? undefined,
      toPlatform: rec.to_platform ?? undefined,
      bestCarriage: rec.best_carriage ?? undefined,
      source: 'estimate',
      confidence: seconds <= 30 ? 'low' : seconds < 90 ? 'medium' : 'medium',
      conditional: Boolean(windows),
      windows,
      distance: rec.distance ?? undefined,
      stairs: rec.stairs ?? undefined,
      note: 'BST metadata 人工整理/推算，非运营方实测',
      caution
    })
  }
}

// 补齐同站线路对：缺失时使用 180 秒默认值并标 fallback
const lineAt = stationNames.map(() => [])
{
  const temp = new Map()
  for (const t of trips) {
    const lineIdx = t[1]
    const flat = t[3]
    for (let i = 0; i < flat.length; i += 2) {
      const s = flat[i]
      if (!temp.has(s)) temp.set(s, new Set())
      temp.get(s).add(lineIdx)
    }
  }
  for (const [s, set] of temp) for (const l of set) lineAt[s].push(l)
  for (const arr of lineAt) arr.sort((a, b) => a - b)
}

let fallbackTransfers = 0
for (let s = 0; s < stationNames.length; s++) {
  const ls = lineAt[s]
  if (ls.length < 2) continue
  for (const from of ls) {
    for (const to of ls) {
      if (from === to) continue
      const exists = transferVariants.some((t) => t.s === s && t.from === from && t.to === to)
      if (!exists) {
        transferVariants.push({
          s,
          from,
          to,
          sec: 180,
          source: 'estimate',
          confidence: 'low',
          fallback: true,
          note: '无整理值，按 180 秒默认估计'
        })
        fallbackTransfers++
      }
    }
  }
}

const warnings = [
  '换乘步行时间为爱好者整理/推算，非运营方实测；30 秒级记录（含西直门 2→4）可能偏乐观，未自动改写。',
  '时刻为计划图；不含节假日专用图、临客、故障与临时限流。'
]

// ---------- 输出 ----------
const out = {
  meta: {
    schemaVersion: 2,
    title: '北京地铁全网络逐班计划时刻（原型）',
    generatedAt: new Date().toISOString(),
    aggregateUpdatedAt: '2026-01-13',
    aggregateUpdatedNote:
      'schedule.json 最后提交日期；各线 BST 文件截止日期见 line.dataDate。计划时刻，不含实时运行调整。',
    counts: {
      lines: lines.length,
      stations: stationNames.length,
      trips: trips.length,
      transferVariants: transferVariants.length,
      fallbackTransfers
    },
    warnings
  },
  lines,
  stations: stationNames,
  transfers: transferVariants,
  trips
}

const outPath = path.join(root, 'packages/core/src/data/network.json')
fs.writeFileSync(outPath, JSON.stringify(out))
const size = fs.statSync(outPath).size
console.log(`写出 ${outPath}`)
console.log(
  `线路 ${lines.length}，车站 ${stationNames.length}，班次 ${trips.length}，换乘变体 ${transferVariants.length}（默认补齐 ${fallbackTransfers}）`
)
console.log(`大小 ${(size / 1024 / 1024).toFixed(2)} MiB`)
console.log('线路状态:')
for (const l of lines) {
  console.log(
    `  ${l.name.padEnd(7)} ${l.status.padEnd(9)} ${String(l.tripCount).padStart(5)} 班 ` +
      `${String(l.stationCount).padStart(3)} 站  ${l.dataDate ?? '?'}  ` +
      (l.notes.length ? l.notes.join('；') : '')
  )
}
