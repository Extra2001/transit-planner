#!/usr/bin/env node
/**
 * 长春 table2 离线导入器。
 *
 * 读取 data/changchun/raw 下的线路响应与 table2 响应，做：
 * 解析 → 逐站校验 → 方向/站序对齐 → 相邻站车次匹配 → 版本快照 → 覆盖率/可信度报告。
 *
 * 没有真实响应时不会生成长春班次；不做网络请求。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseLinesPayload, parseTable2, buildTrips, WEEKDAY_EVIDENCE, DEFAULT_MAX_RUN } from './table2.mjs'

const root = path.dirname(fileURLToPath(import.meta.url)) + '/../..'
const rawDir = path.join(root, 'data/changchun/raw')
const importedDir = path.join(root, 'data/changchun/imported')
const versionsDir = path.join(importedDir, 'versions')

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1)
      else {
        const next = argv[i + 1]
        if (next && !next.startsWith('--')) {
          flags[a.slice(2)] = next
          i++
        } else flags[a.slice(2)] = true
      }
    } else positional.push(a)
  }
  return { flags, positional }
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function findLinesFile() {
  const p = path.join(rawDir, 'lines.json')
  if (fs.existsSync(p)) return p
  throw new Error('找不到线路响应：data/changchun/raw/lines.json')
}

function parseFileName(file) {
  const m = /^table2-(\d+)-(\d+)-(\d)-(\d)\.json$/.exec(file)
  if (!m) return null
  return {
    lineCode: m[1].padStart(2, '0'),
    standCode: m[2],
    direction: Number(m[3]),
    weekday: Number(m[4])
  }
}

function collectTableFiles() {
  return fs
    .readdirSync(rawDir)
    .filter((f) => /^table2-.*\.json$/.test(f))
    .map((f) => {
      const meta = parseFileName(f)
      return meta ? { file: f, ...meta } : null
    })
    .filter(Boolean)
}

function formatMinute(minute) {
  const m = ((minute % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function directionOrder(line, startName, endName) {
  const start = line.stands.findIndex((s) => s.name === startName)
  const end = line.stands.findIndex((s) => s.name === endName)
  if (start < 0 || end < 0 || start === end) return null
  const order = line.stands.map((s, i) => i)
  if (start < end) return order.slice(start, end + 1)
  return order.slice(end, start + 1).reverse()
}

function buildNetwork(lines, groups, meta) {
  const stations = []
  const stationIndex = new Map()
  const sid = (name) => {
    if (!stationIndex.has(name)) {
      stationIndex.set(name, stations.length)
      stations.push(name)
    }
    return stationIndex.get(name)
  }
  const lineOut = []
  const lineIndex = new Map()
  const tripRows = []
  for (const group of groups) {
    if (!group.trips.length) continue
    const code = group.line.lineCode
    let li = lineIndex.get(code)
    if (li === undefined) {
      li = lineOut.length
      lineIndex.set(code, li)
      lineOut.push({
        id: `cc-${code}`,
        name: group.line.name,
        shortName: group.line.name.replace(/号线$/, ''),
        color: group.color || '#e60012',
        textColor: '#ffffff',
        mode: 'metro',
        loop: false,
        directions: [],
        source: {
          name: '长春 E 出行 H5',
          url: 'http://app.ccetravel.cn/',
          license: '使用许可未确认；本地导入，不随 PWA 分发原始响应',
          file: 'data/changchun/raw'
        },
        dataDate: meta.capturedAt?.slice(0, 10) ?? null,
        aggregateDate: meta.generatedAt.slice(0, 10),
        confidence: 'medium',
        status: 'review',
        stationCount: 0,
        bstStationCount: group.line.stands.length,
        tripCount: 0,
        passEntries: 0,
        dwellUnknown: 0,
        stationGaps: [],
        extraStations: [],
        missingAdjacency: [],
        notes: []
      })
    }
    const line = lineOut[li]
    const dirName = `方向${group.direction}`
    let di = line.directions.findIndex((d) => d.name === dirName)
    if (di < 0) {
      di = line.directions.length
      line.directions.push({ id: `d${di + 1}`, name: dirName, index: di })
    }
    for (const trip of group.trips) {
      if (trip.stops.length < 2) continue
      line.tripCount += 1
      const flat = []
      for (const stop of trip.stops) {
        flat.push(sid(group.stationOrder[stop.station].name), stop.minute)
      }
      tripRows.push([group.day, li, di, flat])
    }
    for (const s of group.stationOrder) if (!line.stationGaps.includes(s.name)) sid(s.name)
    for (const s of group.missingStations) if (!line.stationGaps.includes(s)) line.stationGaps.push(s)
    for (const g of group.gaps) if (!line.missingAdjacency.includes(g)) line.missingAdjacency.push(g)
    for (const n of group.notes) if (!line.notes.includes(n)) line.notes.push(n)
    line._ambiguousLegs = (line._ambiguousLegs ?? 0) + (group.ambiguousLegs ?? 0)
    line._legCount = (line._legCount ?? 0) + (group.legCount ?? 0)
    if (group.coverage < 1) line._incomplete = true
  }
  for (const line of lineOut) {
    const set = new Set()
    for (const t of tripRows) if (t[1] === lineOut.indexOf(line)) for (let i = 0; i < t[3].length; i += 2) set.add(stations[t[3][i]])
    line.stationCount = set.size
    if (line._ambiguousLegs > 0) {
      line.notes.push(
        `相邻站关联不唯一 ${line._ambiguousLegs}/${line._legCount} 段（${((line._ambiguousLegs / line._legCount) * 100).toFixed(1)}%），这些区段未写入车次`
      )
    }
    line.status =
      line._incomplete || line.missingAdjacency.length || line.stationGaps.length ? 'review' : 'supported'
    line.confidence = line.status === 'review' || line.notes.length ? 'medium' : 'high'
    delete line._incomplete
    delete line._ambiguousLegs
    delete line._legCount
  }
  const lineAt = stations.map(() => new Set())
  for (const t of tripRows) for (let i = 0; i < t[3].length; i += 2) lineAt[t[3][i]].add(t[1])
  const transfers = []
  for (let s = 0; s < stations.length; s++) {
    const ls = [...lineAt[s]]
    for (const a of ls) for (const b of ls) {
      if (a !== b) {
        transfers.push({
          s,
          from: a,
          to: b,
          sec: 180,
          source: 'estimate',
          confidence: 'low',
          fallback: true,
          note: '长春换乘时间未录入，按 180 秒默认估计'
        })
      }
    }
  }
  const ambLegs = lineOut.reduce((n, l) => n + (l.notes.some((x) => x.includes('关联不唯一')) ? 1 : 0), 0)
  return {
    meta: {
      schemaVersion: 2,
      title: '长春轨道交通逐班计划时刻',
      generatedAt: meta.generatedAt,
      aggregateUpdatedAt: meta.capturedAt?.slice(0, 10) ?? meta.generatedAt.slice(0, 10),
      aggregateUpdatedNote: '由长春 E 出行 H5 table2 响应离线导入；列车由相邻站时刻唯一匹配推断。',
      counts: {
        lines: lineOut.length,
        stations: stations.length,
        trips: tripRows.length,
        transferVariants: transfers.length,
        fallbackTransfers: transfers.length
      },
      warnings: [
        '长春数据来自 E 出行 H5；原始响应使用许可未确认，不随 PWA 分发。',
        'weekday=1/2 解释为工作日/双休日为实测推断，非官方枚举说明。',
        'table2 无列车 ID，车次由相邻站时刻唯一匹配推断；关联不唯一的区段已断开、未写入车次，因此部分班次缺失。',
        '车次条数是“已确认区段”，被截断的车次会拆成多段，不等于实际开行班次。',
        '换乘时间未录入，按 180 秒默认估计。',
        '时刻为计划时刻，不含实时延误、临客与临时调整。'
      ].concat(
        ambLegs > 0
          ? [`有 ${ambLegs} 条线的部分区段存在多解关联，已在 线路说明 中标注。`]
          : []
      )
    },
    lines: lineOut,
    stations,
    transfers,
    trips: tripRows
  }
}

function cmdBuild(flags) {
  const minRun = Number(flags['min-run'] ?? 1)
  const maxRun = Number(flags['max-run'] ?? DEFAULT_MAX_RUN)
  const minCoverage = Number(flags['min-coverage'] ?? 0.95)
  const minAssoc = Number(flags['min-assoc'] ?? 0.9)
  const maxAmbiguity = Number(flags['max-ambiguity'] ?? 0.1)
  const linesPath = findLinesFile()
  const linesPayload = parseLinesPayload(fs.readFileSync(linesPath, 'utf8'))
  const lineByCode = new Map(linesPayload.lines.map((l) => [l.lineCode, l]))
  const files = collectTableFiles()
  if (!files.length) throw new Error('没有 table2-*.json 样本')

  let captureManifest = null
  const captureFile = path.join(rawDir, 'capture-manifest.json')
  if (fs.existsSync(captureFile)) {
    try {
      captureManifest = JSON.parse(fs.readFileSync(captureFile, 'utf8'))
    } catch {
      captureManifest = null
    }
  }
  const captureMismatches = []
  if (captureManifest?.items) {
    for (const f of files) {
      const item = captureManifest.items.find((x) => x.file === f.file)
      if (!item) continue
      const actual = sha256(path.join(rawDir, f.file))
      if (item.sha256 && item.sha256 !== actual) captureMismatches.push(f.file)
    }
  }

  const parsed = []
  const skipped = []
  for (const f of files) {
    const text = fs.readFileSync(path.join(rawDir, f.file), 'utf8')
    const res = parseTable2(text, f)
    const line = lineByCode.get(f.lineCode)
    if (!line) {
      skipped.push({ file: f.file, reason: `线路 ${f.lineCode} 不在线路响应中` })
      continue
    }
    if (!res.dayType) {
      skipped.push({ file: f.file, reason: `weekday=${f.weekday} 无对应导入日类型`, evidence: res.evidence })
      continue
    }
    if (!res.ok) {
      skipped.push({ file: f.file, reason: '校验失败', errors: res.errors })
      continue
    }
    const stand = line.stands.find((s) => s.standCode === f.standCode)
    if (!stand) {
      skipped.push({ file: f.file, reason: `站码 ${f.standCode} 不在线路 ${f.lineCode}` })
      continue
    }
    if (stand.name !== res.standName) {
      res.warnings.push(`站名不一致：线路表 ${stand.name}，table2 ${res.standName}`)
    }
    const expectedStart = f.direction === 1 ? stand.downTerminus : stand.upTerminus
    const expectedEnd = f.direction === 1 ? stand.upTerminus : stand.downTerminus
    if (expectedStart && expectedEnd && (res.startSiteName !== expectedStart || res.endSiteName !== expectedEnd)) {
      res.warnings.push(
        `方向端点与线路表不一致：请求 direction=${f.direction}，table2 ${res.startSiteName}→${res.endSiteName}，线路表期望 ${expectedStart}→${expectedEnd}`
      )
    }
    parsed.push({ ...f, line, stand, result: res })
  }

  const groupsMap = new Map()
  for (const p of parsed) {
    const key = `${p.lineCode}|${p.direction}|${p.result.dayType}`
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key,
        line: p.line,
        direction: p.direction,
        day: p.result.dayType === 'weekday' ? 0 : 1,
        dayType: p.result.dayType,
        color: null,
        directions: ['方向1', '方向2'],
        responses: []
      })
    }
    const g = groupsMap.get(key)
    g.responses.push(p)
  }

  const groups = []
  const report = {
    generatedAt: new Date().toISOString(),
    rawDir,
    lines: [],
    skipped,
    weekdayEvidence: WEEKDAY_EVIDENCE,
    capture: {
      present: Boolean(captureManifest),
      capturedAt: captureManifest?.capturedAt ?? null,
      hashMismatches: captureMismatches
    },
    validation: parsed.map((p) => ({
      file: p.file,
      lineCode: p.lineCode,
      standCode: p.standCode,
      standName: p.result.standName,
      direction: p.direction,
      weekday: p.weekday,
      dayType: p.result.dayType,
      ok: p.result.ok,
      errors: p.result.errors,
      warnings: p.result.warnings,
      stats: p.result.stats
    }))
  }
  report.warnings = report.validation.flatMap((v) =>
    v.warnings.map((w) => ({ file: v.file, lineCode: v.lineCode, standCode: v.standCode, warning: w }))
  )
  for (const g of groupsMap.values()) {
    const first = g.responses[0].result
    const order = directionOrder(g.line, first.startSiteName, first.endSiteName)
    if (!order) {
      report.lines.push({ line: g.line.name, direction: g.direction, dayType: g.dayType, error: '无法根据响应端点确定站序' })
      continue
    }
    const byStand = new Map(g.responses.map((r) => [r.stand.standCode, r]))
    const orderedStands = order
      .map((i) => g.line.stands[i])
      .filter((s) => byStand.has(s.standCode))
    const stationOrder = orderedStands.map((s) => ({
      ...s,
      name: byStand.get(s.standCode).result.standName || s.name
    }))
    const gaps = []
    for (let i = 1; i < stationOrder.length; i++) {
      const a = order.indexOf(g.line.stands.indexOf(orderedStands[i - 1]))
      const b = order.indexOf(g.line.stands.indexOf(orderedStands[i]))
      if (b - a !== 1) gaps.push(`${stationOrder[i - 1].name}—${stationOrder[i].name}`)
    }
    const missingStations = g.line.stands.filter((s) => !byStand.has(s.standCode)).map((s) => s.name)
    const coverage = stationOrder.length / g.line.stands.length
    const directionIndex = g.direction === 1 ? 0 : 1
    const stations = stationOrder.map((s) => ({
      name: s.name,
      times: byStand.get(s.standCode).result.times.map((t) => t.minute)
    }))
    // 站序有缺口时两侧连站序都不连续，跨缺口配对必然错，因此整组不生成车次。
    const match = gaps.length || stations.length < 2 ? null : buildTrips(stations, { minRun, maxRun })
    const verification = match ? match.verification : 'insufficient'
    const notes = []
    if (coverage < 1) notes.push(`覆盖 ${stationOrder.length}/${g.line.stands.length} 站（${(coverage * 100).toFixed(1)}%），不是完整线路`)
    if (gaps.length) notes.push(`站序缺口：${gaps.join('、')}；缺口两侧不做跨站匹配`)
    if (match?.terminatedAtIntermediate) notes.push(`中途站终到车次 ${match.terminatedAtIntermediate} 个，已保留其区段`)
    if (match?.startedAtIntermediate) notes.push(`中途站始发车次 ${match.startedAtIntermediate} 个`)
    const group = {
      line: g.line,
      direction: g.direction,
      directionIndex,
      day: g.day,
      dayType: g.dayType,
      color: first.lineColour ?? null,
      directions: g.directions,
      stationOrder,
      stationTimes: stationOrder.map((s) => ({
        code: s.standCode,
        name: s.name,
        times: byStand.get(s.standCode).result.times.map((t) => t.minute)
      })),
      missingStations,
      gaps,
      coverage,
      verification,
      legCount: match?.legCount ?? 0,
      ambiguousLegs: match?.ambiguousLegs ?? 0,
      ambiguityRate: match ? match.ambiguityRate : 1,
      associationCoverage: match ? match.coverage : 0,
      trips: match?.trips ?? [],
      match,
      notes
    }
    groups.push(group)
    report.lines.push({
      lineCode: g.line.lineCode,
      line: g.line.name,
      direction: g.direction,
      dayType: g.dayType,
      stationsWithData: stationOrder.length,
      expectedStations: g.line.stands.length,
      coverage,
      stations: stationOrder.map((s) => ({ code: s.standCode, name: s.name, trains: byStand.get(s.standCode).result.stats.trains })),
      missingStations,
      gaps,
      verification,
      match: match
        ? {
            trains: match.trainCount,
            verification: match.verification,
            coverage: match.coverage,
            ambiguityRate: match.ambiguityRate,
            ambiguousLegs: match.ambiguousLegs,
            legCount: match.legCount,
            matchedPairs: match.matchedPairs,
            possiblePairs: match.possiblePairs,
            terminatedAtIntermediate: match.terminatedAtIntermediate,
            splitByAmbiguity: match.splitByAmbiguity,
            uncertainPairs: match.uncertainPairs,
            startedAtIntermediate: match.startedAtIntermediate,
            legs: match.legReports
          }
        : null,
      notes
    })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const version = timestamp
  const versionDir = path.join(versionsDir, version)
  fs.mkdirSync(path.join(versionDir, 'station-times'), { recursive: true })
  for (const g of groups) {
    const file = `${g.line.lineCode}-d${g.direction}-${g.dayType}.json`
    fs.writeFileSync(
      path.join(versionDir, 'station-times', file),
      JSON.stringify(
        {
          lineCode: g.line.lineCode,
          lineName: g.line.name,
          direction: g.direction,
          dayType: g.dayType,
          coverage: g.coverage,
          warnings: g.warnings ?? [],
          stations: g.stationTimes
        },
        null,
        2
      )
    )
  }

  const generatedAt = new Date().toISOString()
  const capturedAt = captureManifest?.capturedAt
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
    throw new Error('capture-manifest.json 缺少有效的 capturedAt，无法标注真实采集时间')
  }
  if (captureMismatches.length) {
    throw new Error(`原始响应哈希与 capture-manifest 不一致：${captureMismatches.join('、')}`)
  }
  const network = buildNetwork(linesPayload.lines, groups.filter((g) => g.trips.length), {
    generatedAt,
    capturedAt
  })
  fs.writeFileSync(path.join(versionDir, 'network.partial.json'), JSON.stringify(network))

  const rawHashes = files.map((f) => ({ file: f.file, sha256: sha256(path.join(rawDir, f.file)) }))
  const lineCodes = [...new Set(groups.map((g) => g.line.lineCode))]
  const expectedStations = lineCodes.reduce((n, code) => n + (lineByCode.get(code)?.stands.length ?? 0), 0)
  const coveredPairs = new Set(
    groups.flatMap((g) => g.stationOrder.map((s) => `${g.line.lineCode}:${s.standCode}`))
  )
  const coveredStations = coveredPairs.size
  const stationCoverage = expectedStations ? coveredStations / expectedStations : 0

  // 三个口径分开：站-线覆盖（有没有数据）、关联覆盖（对上多少）、歧义率（多少腿对不上唯一）。
  const legCount = groups.reduce((n, g) => n + g.legCount, 0)
  const ambiguousLegs = groups.reduce((n, g) => n + g.ambiguousLegs, 0)
  const matchedPairs = groups.reduce((n, g) => n + (g.match?.matchedPairs ?? 0), 0)
  const possiblePairs = groups.reduce((n, g) => n + (g.match?.possiblePairs ?? 0), 0)
  const associationCoverage = possiblePairs ? matchedPairs / possiblePairs : 0
  const ambiguityRate = legCount ? ambiguousLegs / legCount : 1
  const verificationCounts = { unique: 0, partial: 0, insufficient: 0 }
  for (const g of groups) verificationCounts[g.verification] += 1
  const uncertainPairs = groups.reduce((n, g) => n + (g.match?.uncertainPairs ?? 0), 0)
  const splitByAmbiguity = groups.reduce((n, g) => n + (g.match?.splitByAmbiguity ?? 0), 0)
  const startedAtIntermediate = groups.reduce((n, g) => n + (g.match?.startedAtIntermediate ?? 0), 0)
  const terminatedAtIntermediate = groups.reduce((n, g) => n + (g.match?.terminatedAtIntermediate ?? 0), 0)
  const fullLengthTrips = groups.reduce((n, g) => n + (g.match?.fullLengthTrips ?? 0), 0)

  // 门槛只看“是否值得开放查询”，不用任何“概率”措辞。
  // 歧义腿不进入正式车次，因此可开放但必须显式披露被排除的比例。
  const ready =
    groups.length > 0 &&
    stationCoverage >= minCoverage &&
    associationCoverage >= minAssoc &&
    ambiguityRate <= maxAmbiguity &&
    groups.every((g) => g.trips.length > 0 && g.coverage >= minCoverage && g.verification !== 'insufficient' && g.gaps.length === 0)
  if (ready) fs.writeFileSync(path.join(versionDir, 'network.json'), JSON.stringify(network))
  fs.writeFileSync(path.join(versionDir, 'match-report.json'), JSON.stringify(report, null, 2))

  const metadata = {
    version,
    generatedAt,
    capturedAt,
    status: ready ? 'ready' : 'partial',
    counts: {
      lines: new Set(groups.map((g) => g.line.lineCode)).size,
      stations: new Set(groups.flatMap((g) => g.stationOrder.map((s) => s.standCode))).size,
      trips: network.trips.length,
      fullLengthTrips,
      groups: groups.length,
      countsNote:
        'trips 是“已确认区段”条数：被关联不唯一的腿截断的车次会拆成多段，因此不等于实际开行班次；fullLengthTrips 是走完整条导入站序的区段数。'
    },
    coverageDetail: {
      coveredStations,
      expectedStations,
      stationCoverage,
      definition: '站-线覆盖率 = 已导入的线路-车站对 / 全部线路-车站对；只说明有没有数据，不代表关联正确性。'
    },
    association: {
      legCount,
      ambiguousLegs,
      uniqueLegs: legCount - ambiguousLegs,
      matchedPairs,
      possiblePairs,
      uncertainPairs,
      associationCoverage,
      ambiguityRate,
      splitByAmbiguity,
      terminatedAtIntermediate,
      startedAtIntermediate,
      verificationCounts,
      definition:
        '关联覆盖率 = 唯一匹配上的相邻站对数 / 该腿两侧较大班次数；歧义率 = 关联不唯一的腿数 / 腿数。两者都是数量口径，不是“配对正确的概率”。歧义腿不进入正式车次。'
    },
    gate: { stationCoverage: minCoverage, associationCoverage: minAssoc, maxAmbiguity, passed: ready },
    groups: groups.map((g) => ({
      lineCode: g.line.lineCode,
      line: g.line.name,
      direction: g.direction,
      dayType: g.dayType,
      coverage: g.coverage,
      verification: g.verification,
      legCount: g.legCount,
      ambiguousLegs: g.ambiguousLegs,
      ambiguityRate: g.ambiguityRate,
      associationCoverage: g.associationCoverage,
      trips: g.trips.length,
      fullLengthTrips: g.match?.fullLengthTrips ?? 0
    })),
    rawHashes,
    notes: [
      '未确认长春 E 出行数据再分发许可；raw/imported 仅本地开发。',
      'table2 无列车 ID，跨站车次由相邻站时刻唯一匹配推断；关联不唯一的腿已断开，不写入正式车次。',
      '因此班次是“已确认区段”，可能少于实际开行班次；缺口不会被补造。',
      'weekday=1/2 的日类型解释为实测推断。'
    ]
  }
  fs.writeFileSync(path.join(versionDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
  fs.mkdirSync(importedDir, { recursive: true })
  fs.writeFileSync(path.join(importedDir, 'current.json'), JSON.stringify(metadata, null, 2))
  writeAppNetwork(metadata, versionDir)
  writeStatusFile(metadata)
  console.log(JSON.stringify(metadata, null, 2))
  console.log(`\n版本目录：${path.relative(root, versionDir)}`)
  console.log(
    `站-线覆盖 ${(stationCoverage * 100).toFixed(1)}% · 关联覆盖 ${(associationCoverage * 100).toFixed(1)}% · 歧义腿 ${ambiguousLegs}/${legCount}（${(ambiguityRate * 100).toFixed(1)}%）· 车次 ${network.trips.length}`
  )
  if (!ready) console.log('状态 partial：覆盖或关联质量未达门槛，未生成正式 network.json，不进入 PWA 查询。')
}

function cmdStatus() {
  const file = path.join(importedDir, 'current.json')
  if (!fs.existsSync(file)) {
    console.log('尚未导入长春 table2 数据')
    return
  }
  console.log(fs.readFileSync(file, 'utf8'))
}

function writeAppNetwork(metadata, versionDir) {
  const target = path.join(root, 'apps/web/src/data/changchun-network.json')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const source = path.join(versionDir, 'network.json')
  if (metadata.status === 'ready' && fs.existsSync(source)) {
    fs.copyFileSync(source, target)
    return
  }
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        meta: {
          schemaVersion: 2,
          title: '长春轨道交通（尚未就绪）',
          generatedAt: metadata.generatedAt,
          aggregateUpdatedAt: metadata.capturedAt?.slice(0, 10) ?? metadata.generatedAt.slice(0, 10),
          aggregateUpdatedNote: '样本覆盖不足，未生成正式 network.json',
          counts: { lines: 0, stations: 0, trips: 0, transferVariants: 0, fallbackTransfers: 0 },
          warnings: ['长春数据尚未完成导入，不参与查询']
        },
        lines: [],
        stations: [],
        transfers: [],
        trips: []
      },
      null,
      2
    )
  )
}

function writeStatusFile(metadata) {
  const statusFile = path.join(root, 'apps/web/src/data/changchun-status.json')
  fs.mkdirSync(path.dirname(statusFile), { recursive: true })
  const association = metadata.association
  const note =
    metadata.status === 'ready'
      ? association && association.ambiguousLegs > 0
        ? `已开放查询；${association.ambiguousLegs}/${association.legCount} 段相邻站关联不唯一，这些区段未写入车次`
        : '已开放查询；全部相邻站关联唯一'
      : '未达就绪门槛，不参与查询'
  fs.writeFileSync(
    statusFile,
    JSON.stringify(
      {
        status: metadata.status,
        version: metadata.version,
        capturedAt: metadata.capturedAt,
        counts: metadata.counts,
        coverage: metadata.coverageDetail?.stationCoverage ?? 0,
        coverageDetail: metadata.coverageDetail,
        association,
        gate: metadata.gate,
        note
      },
      null,
      2
    )
  )
}

function cmdRollback(version) {
  if (!version) throw new Error('用法：rollback <version>')
  const file = path.join(versionsDir, version, 'metadata.json')
  if (!fs.existsSync(file)) throw new Error(`版本不存在：${version}`)
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.copyFileSync(file, path.join(importedDir, 'current.json'))
  writeStatusFile(metadata)
  writeAppNetwork(metadata, path.dirname(file))
  console.log(`已回退 current.json 到 ${version}`)
}

const { flags, positional } = parseArgs(process.argv.slice(2))
const cmd = positional.shift()
try {
  if (cmd === 'build' || !cmd) cmdBuild(flags)
  else if (cmd === 'status') cmdStatus()
  else if (cmd === 'rollback') cmdRollback(positional[0])
  else {
    console.log(`长春 table2 离线导入

  build [--min-coverage 0.95] [--min-assoc 0.9] [--max-ambiguity 0.1] [--min-run 1] [--max-run 5]
  status
  rollback <version>

只读 data/changchun/raw；不发起网络请求，采集时间取自 capture-manifest.json。
站-线覆盖、关联覆盖、歧义率分别判定；未达门槛时只生成 partial，不进入正式查询。`)
  }
} catch (e) {
  console.error('错误：' + (e instanceof Error ? e.message : String(e)))
  process.exit(1)
}
