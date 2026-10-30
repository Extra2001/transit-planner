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
import { parseLinesPayload, parseTable2, buildTrips, WEEKDAY_EVIDENCE } from './table2.mjs'

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
  const trips = []
  for (const group of groups) {
    if (!group.trips.length) continue
    const lineIdx = lineOut.length
    lineOut.push({
      id: `cc-${group.line.lineCode}`,
      name: group.line.name,
      shortName: group.line.name.replace(/号线$/, ''),
      color: group.color || '#e60012',
      textColor: '#ffffff',
      mode: 'metro',
      loop: false,
      directions: group.directions.map((name, i) => ({ id: `d${i + 1}`, name, index: i })),
      source: {
        name: '长春 E 出行 H5（用户授权样本）',
        url: 'http://app.ccetravel.cn/',
        license: '未确认；本地开发样本，不随 PWA 分发',
        file: 'data/changchun/raw'
      },
      dataDate: meta.capturedAt?.slice(0, 10) ?? null,
      aggregateDate: meta.generatedAt.slice(0, 10),
      confidence: group.quality >= 0.95 ? 'high' : group.quality >= 0.8 ? 'medium' : 'low',
      status: group.coverage >= 0.8 && group.quality >= 0.95 ? 'supported' : 'review',
      stationCount: group.stationOrder.length,
      bstStationCount: group.line.stands.length,
      tripCount: group.trips.length,
      passEntries: 0,
      dwellUnknown: 0,
      stationGaps: group.missingStations,
      extraStations: [],
      missingAdjacency: group.gaps,
      notes: group.notes
    })
    for (const trip of group.trips) {
      const flat = []
      for (const stop of trip.stops) {
        flat.push(sid(group.stationOrder[stop.station].name), stop.minute)
      }
      trips.push([group.day, lineIdx, group.directionIndex, flat])
    }
  }
  const lineAt = stations.map(() => new Set())
  for (const t of trips) for (let i = 0; i < t[3].length; i += 2) lineAt[t[3][i]].add(t[1])
  const transfers = []
  for (let s = 0; s < stations.length; s++) {
    const ls = [...lineAt[s]]
    for (const a of ls) for (const b of ls) {
      if (a !== b) transfers.push({ s, from: a, to: b, sec: 180, source: 'estimate', confidence: 'low', fallback: true, note: '长春换乘时间未录入，按 180 秒默认估计' })
    }
  }
  for (const line of lineOut) line.tripCount = trips.filter((t) => t[1] === lineOut.indexOf(line)).length
  return {
    meta: {
      schemaVersion: 2,
      title: '长春轨道交通逐班计划时刻（样本导入）',
      generatedAt: meta.generatedAt,
      aggregateUpdatedAt: meta.capturedAt?.slice(0, 10) ?? meta.generatedAt.slice(0, 10),
      aggregateUpdatedNote: '由长春 E 出行 H5 table2 响应离线导入；仅样本，未做全站采集。',
      counts: { lines: lineOut.length, stations: stations.length, trips: trips.length, transferVariants: transfers.length, fallbackTransfers: transfers.length },
      warnings: [
        '长春数据来自用户授权样本/低频验证请求；使用许可未确认，原始响应不随 PWA 分发。',
        'weekday=1/2 解释为工作日/双休日为实测推断，非官方枚举说明。',
        '车次匹配仅在相邻站时刻可唯一对齐时采用；不唯一处保留歧义，不用于精确赶车。',
        '换乘时间未录入，按 180 秒默认估计。'
      ]
    },
    lines: lineOut,
    stations,
    transfers,
    trips
  }
}

function cmdBuild(flags) {
  const minRun = Number(flags['min-run'] ?? 1)
  const maxRun = Number(flags['max-run'] ?? 15)
  const minCoverage = Number(flags['min-coverage'] ?? 0.8)
  const minQuality = Number(flags['min-quality'] ?? 0.95)
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
    const stationOrder = order.map((i) => g.line.stands[i]).filter((s) => byStand.has(s.standCode))
    const gaps = []
    for (let i = 1; i < stationOrder.length; i++) {
      const a = order.indexOf(g.line.stands.indexOf(stationOrder[i - 1]))
      const b = order.indexOf(g.line.stands.indexOf(stationOrder[i]))
      if (b - a !== 1) gaps.push(`${stationOrder[i - 1].name}—${stationOrder[i].name}`)
    }
    const missingStations = g.line.stands.filter((s) => !byStand.has(s.standCode)).map((s) => s.name)
    const coverage = stationOrder.length / g.line.stands.length
    const directionIndex = g.direction === 1 ? 0 : 1
    const stations = stationOrder.map((s) => ({
      name: s.name,
      times: byStand.get(s.standCode).result.times.map((t) => t.minute)
    }))
    let match = null
    if (gaps.length) {
      // 缺口两侧不跨站匹配；整组只保留逐站时刻，不生成车次
      match = null
    } else if (stations.length >= 2) {
      match = buildTrips(stations, { minRun, maxRun })
    }
    const quality = match ? Math.max(0, Math.min(1, match.confidence - match.ambiguityPairs * 0.1)) : 0
    const notes = []
    if (coverage < 1) notes.push(`覆盖 ${stationOrder.length}/${g.line.stands.length} 站（${(coverage * 100).toFixed(1)}%），不是完整线路`)
    if (gaps.length) notes.push(`站序缺口：${gaps.join('、')}；缺口两侧不做跨站匹配`)
    if (match?.ambiguityPairs) notes.push(`有 ${match.ambiguityPairs} 个相邻站匹配不唯一，保留歧义`)
    if (match && match.confidence < 0.95) notes.push(`车次匹配置信度 ${(match.confidence * 100).toFixed(1)}%，不用于精确赶车`)
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
      quality,
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
      match: match
        ? {
            trains: match.trainCount,
            confidence: match.confidence,
            ambiguityPairs: match.ambiguityPairs,
            legs: match.legReports
          }
        : null,
      quality,
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

  const network = buildNetwork(linesPayload.lines, groups.filter((g) => g.trips.length), {
    generatedAt: new Date().toISOString(),
    capturedAt: '2026-10-30T06:09:00Z'
  })
  fs.writeFileSync(path.join(versionDir, 'network.partial.json'), JSON.stringify(network))
  const ready = groups.length > 0 && groups.every((g) => g.coverage >= minCoverage && g.quality >= minQuality && g.trips.length > 0)
  if (ready) fs.writeFileSync(path.join(versionDir, 'network.json'), JSON.stringify(network))
  fs.writeFileSync(path.join(versionDir, 'match-report.json'), JSON.stringify(report, null, 2))

  const rawHashes = files.map((f) => ({ file: f.file, sha256: sha256(path.join(rawDir, f.file)) }))
  const lineCodes = [...new Set(groups.map((g) => g.line.lineCode))]
  const expectedStations = lineCodes.reduce((n, code) => n + (lineByCode.get(code)?.stands.length ?? 0), 0)
  const coveredStations = new Set(groups.flatMap((g) => g.stationOrder.map((s) => s.standCode))).size
  const stationCoverage = expectedStations ? coveredStations / expectedStations : 0
  const groupMaxCoverage = groups.length ? Math.max(...groups.map((g) => g.coverage)) : 0
  if (captureMismatches.length) {
    throw new Error(`原始响应哈希与 capture-manifest 不一致：${captureMismatches.join('、')}`)
  }
  const metadata = {
    version,
    generatedAt: new Date().toISOString(),
    capturedAt: '2026-10-30T06:09:00Z',
    status: ready ? 'ready' : 'partial',
    counts: {
      lines: new Set(groups.map((g) => g.line.lineCode)).size,
      stations: new Set(groups.flatMap((g) => g.stationOrder.map((s) => s.standCode))).size,
      trips: groups.reduce((n, g) => n + g.trips.length, 0),
      groups: groups.length
    },
    coverageDetail: {
      coveredStations,
      expectedStations,
      stationCoverage,
      groupMaxCoverage,
      definition: '站覆盖率 = 已导入的不同车站数 / 该线路全部车站数；不是班次覆盖率。'
    },
    groups: groups.map((g) => ({
      lineCode: g.line.lineCode,
      line: g.line.name,
      direction: g.direction,
      dayType: g.dayType,
      coverage: g.coverage,
      quality: g.quality,
      trips: g.trips.length
    })),
    rawHashes,
    notes: [
      '未确认长春 E 出行数据再分发许可；raw/imported 仅本地开发。',
      '仅少量样本；覆盖不足时 status=partial，不进入正式查询。',
      'weekday=1/2 的日类型解释为实测推断。'
    ]
  }
  fs.writeFileSync(path.join(versionDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
  fs.mkdirSync(importedDir, { recursive: true })
  fs.writeFileSync(path.join(importedDir, 'current.json'), JSON.stringify(metadata, null, 2))
  // 给 PWA 的精简状态（不含时刻、不可用于路径）
  const statusFile = path.join(root, 'apps/web/src/data/changchun-status.json')
  fs.mkdirSync(path.dirname(statusFile), { recursive: true })
  fs.writeFileSync(
    statusFile,
    JSON.stringify(
      {
        status: metadata.status,
        version,
        capturedAt: metadata.capturedAt,
        counts: metadata.counts,
        coverage: metadata.coverageDetail?.stationCoverage ?? 0,
        coverageDetail: metadata.coverageDetail,
        note: metadata.status === 'ready' ? '已具备构建时导入条件' : '样本不足，未开放查询'
      },
      null,
      2
    )
  )
  console.log(JSON.stringify(metadata, null, 2))
  console.log(`\n版本目录：${path.relative(root, versionDir)}`)
  if (!ready) console.log('状态 partial：覆盖/匹配可信度不足，未生成正式 network.json，不进入 PWA 查询。')
}

function cmdStatus() {
  const file = path.join(importedDir, 'current.json')
  if (!fs.existsSync(file)) {
    console.log('尚未导入长春 table2 数据')
    return
  }
  console.log(fs.readFileSync(file, 'utf8'))
}

function writeStatusFile(metadata) {
  const statusFile = path.join(root, 'apps/web/src/data/changchun-status.json')
  fs.mkdirSync(path.dirname(statusFile), { recursive: true })
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
        note: metadata.status === 'ready' ? '已具备构建时导入条件' : '样本不足，未开放查询'
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

  build [--min-coverage 0.8] [--min-quality 0.95] [--min-run 1] [--max-run 15]
  status
  rollback <version>

只读 data/changchun/raw；不发起网络请求。覆盖不足时只生成 partial，不进入正式查询。`)
  }
} catch (e) {
  console.error('错误：' + (e instanceof Error ? e.message : String(e)))
  process.exit(1)
}
