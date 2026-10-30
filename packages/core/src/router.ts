import type {
  Itinerary,
  Leg,
  Network,
  PlanOptions,
  PlanResult,
  TransferAdvice,
  Trip
} from './types'
import { findOccurrenceIndex, getTransfer } from './network'
import { formatClock, parseClock } from './time'

interface WalkOptions {
  speed: number
  sprint: number
  bufferSec: number
}

interface EdgeRide {
  type: 'ride'
  trip: number
  boardPos: number
  alightPos: number
  line: number
  dir: number
  boardS: number
  alightS: number
  depart: number
  arrive: number
}

interface EdgeWalk {
  type: 'walk'
  station: number
  fromLine: number
  toLine: number
  seconds: number
  baseSeconds: number
  estimated: boolean
  fallback: boolean
}

type Edge = EdgeRide | EdgeWalk

interface PrevEntry {
  parent: number
  edge: Edge
}

interface RunResult {
  dist: Float64Array
  prev: (PrevEntry | undefined)[]
  transfers: Uint16Array
  goalKey: number
}

class MinHeap {
  private items: { key: number; t: number }[] = []

  get size(): number {
    return this.items.length
  }

  push(key: number, t: number): void {
    const a = this.items
    a.push({ key, t })
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].t <= a[i].t) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }

  pop(): { key: number; t: number } | undefined {
    const a = this.items
    if (a.length === 0) return undefined
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].t < a[m].t) m = l
        if (r < a.length && a[r].t < a[m].t) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

function walkSeconds(baseSeconds: number, opt: WalkOptions): number {
  return Math.round(baseSeconds / (opt.speed * opt.sprint)) + opt.bufferSec
}

function runDijkstra(
  net: Network,
  day: number,
  fromIdx: number,
  toIdx: number,
  startSec: number,
  opt: WalkOptions
): RunResult | null {
  const L = net.lines.length
  const N = net.stations.length * L
  const dist = new Float64Array(N).fill(Number.POSITIVE_INFINITY)
  const prev: (PrevEntry | undefined)[] = new Array(N)
  const transfers = new Uint16Array(N)
  const heap = new MinHeap()

  const relax = (
    key: number,
    time: number,
    transferCount: number,
    parent: number,
    edge: Edge
  ): void => {
    if (
      time < dist[key] ||
      (time === dist[key] && transferCount < transfers[key])
    ) {
      dist[key] = time
      transfers[key] = transferCount
      prev[key] = { parent, edge }
      heap.push(key, time)
    }
  }

  for (const line of net.lineAt[fromIdx]) {
    relax(fromIdx * L + line, startSec, 0, -1, {
      type: 'walk',
      station: fromIdx,
      fromLine: line,
      toLine: line,
      seconds: 0,
      baseSeconds: 0,
      estimated: false,
      fallback: false
    })
  }

  while (heap.size > 0) {
    const item = heap.pop()!
    const key = item.key
    if (item.t > dist[key]) continue
    const station = Math.floor(key / L)
    const line = key % L

    if (station === toIdx) {
      return { dist, prev, transfers, goalKey: key }
    }

    const occMap = net.occByDay[day]

    // 乘车：同站同线同方向，取到达后最早可上的若干班
    for (let dir = 0; dir < net.lines[line].directions.length; dir++) {
      const occs = occMap.get(`${line}:${dir}:${station}`)
      if (!occs || occs.length === 0) continue
      const startIdx = findOccurrenceIndex(occs, item.t / 60)
      const end = Math.min(occs.length, startIdx + 24)
      for (let k = startIdx; k < end; k++) {
        const occ = occs[k]
        const trip = net.tripsById[occ.trip]
        const boardMinute = trip.stops[occ.pos].minute
        if (boardMinute * 60 <= item.t) continue
        for (let j = occ.pos + 1; j < trip.stops.length; j++) {
          const stop = trip.stops[j]
          const arrive = stop.minute * 60
          const nk = stop.station * L + line
          relax(nk, arrive, transfers[key], key, {
            type: 'ride',
            trip: trip.id,
            boardPos: occ.pos,
            alightPos: j,
            line,
            dir,
            boardS: station,
            alightS: stop.station,
            depart: boardMinute * 60,
            arrive
          })
        }
      }
    }

    // 换乘：站内步行到另一条线路
    for (const other of net.lineAt[station]) {
      if (other === line) continue
      const rec = getTransfer(net, station, line, other)
      const seconds = walkSeconds(rec.sec, opt)
      relax(station * L + other, item.t + seconds, transfers[key] + 1, key, {
        type: 'walk',
        station,
        fromLine: line,
        toLine: other,
        seconds,
        baseSeconds: rec.sec,
        estimated: Boolean(rec.est),
        fallback: Boolean(rec.fallback)
      })
    }
  }

  return null
}

function reconstruct(net: Network, run: RunResult, startSec: number): Itinerary {
  const edges: Edge[] = []
  let key = run.goalKey
  while (run.prev[key]) {
    const entry = run.prev[key]!
    edges.push(entry.edge)
    key = entry.parent
  }
  edges.reverse()

  const legs: Leg[] = []
  for (const edge of edges) {
    if (edge.type === 'walk') {
      if (edge.seconds === 0) continue
      legs.push({
        type: 'walk',
        station: edge.station,
        fromLine: edge.fromLine,
        toLine: edge.toLine,
        seconds: edge.seconds,
        baseSeconds: edge.baseSeconds,
        estimated: edge.estimated,
        fallback: edge.fallback
      })
    } else {
      legs.push({
        type: 'ride',
        line: edge.line,
        dir: edge.dir,
        from: edge.boardS,
        to: edge.alightS,
        depart: edge.depart,
        arrive: edge.arrive,
        trip: edge.trip
      })
    }
  }

  return {
    arrival: run.dist[run.goalKey],
    duration: run.dist[run.goalKey] - startSec,
    legs,
    transfers: [],
    warnings: []
  }
}

function findTripOccurrence(
  net: Network,
  day: number,
  line: number,
  dir: number,
  station: number,
  tripId: number,
  minute: number
): number {
  const occs = net.occByDay[day].get(`${line}:${dir}:${station}`)
  if (!occs) return -1
  let idx = findOccurrenceIndex(occs, minute)
  for (let k = Math.max(0, idx - 3); k < Math.min(occs.length, idx + 4); k++) {
    if (occs[k].trip === tripId) return k
  }
  // 同一分钟多班时再线性兜底
  for (let k = 0; k < occs.length; k++) if (occs[k].trip === tripId) return k
  return -1
}

function tripArrivalAt(
  net: Network,
  day: number,
  tripId: number,
  fromPos: number,
  alightStation: number
): number | null {
  const trip = net.tripsById[tripId]
  for (let j = fromPos + 1; j < trip.stops.length; j++) {
    if (trip.stops[j].station === alightStation) return trip.stops[j].minute * 60
  }
  return null
}

function transferAdvice(
  net: Network,
  day: number,
  legs: Leg[],
  opt: WalkOptions,
  sprintFactor: number,
  normalArrival: number,
  toIdx: number
): TransferAdvice[] {
  const advice: TransferAdvice[] = []
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    if (leg.type !== 'walk') continue
    const before = legs[i - 1]
    const after = legs[i + 1]
    if (!before || before.type !== 'ride' || !after || after.type !== 'ride') continue
    if (before.to !== leg.station || after.from !== leg.station) continue

    const occs = net.occByDay[day].get(`${after.line}:${after.dir}:${leg.station}`)
    const idx = occs
      ? findTripOccurrence(net, day, after.line, after.dir, leg.station, after.trip, after.depart / 60)
      : -1

    const margin = after.depart - (before.arrive + leg.seconds)
    let sprintCatch: TransferAdvice['sprintCatch'] = null
    let nextTrain: TransferAdvice['nextTrain'] = null

    if (occs && idx >= 0) {
      const catchThreshold =
        before.arrive + Math.round(leg.baseSeconds / (opt.speed * sprintFactor)) + opt.bufferSec

      // 最近一班“跑才赶得上”的前车
      for (let k = idx - 1; k >= Math.max(0, idx - 30); k--) {
        const occ = occs[k]
        const depart = occ.minute * 60
        if (depart <= catchThreshold) break
        const arriveAtAlight = tripArrivalAt(net, day, occ.trip, occ.pos, after.to)
        if (arriveAtAlight === null) continue
        const onward = runDijkstra(
          net,
          day,
          after.to,
          toIdx,
          arriveAtAlight,
          { ...opt }
        )
        if (!onward) continue
        const finalArrival = onward.dist[onward.goalKey]
        const gain = normalArrival - finalArrival
        if (gain > 0) {
          sprintCatch = { depart, arriveAtAlight, gainSeconds: gain }
          break
        }
      }

      // 下一班可坐车次
      for (let k = idx + 1; k < Math.min(occs.length, idx + 30); k++) {
        const occ = occs[k]
        const arriveAtAlight = tripArrivalAt(net, day, occ.trip, occ.pos, after.to)
        if (arriveAtAlight === null) continue
        const onward = runDijkstra(net, day, after.to, toIdx, arriveAtAlight, { ...opt })
        if (!onward) continue
        nextTrain = {
          depart: occ.minute * 60,
          arriveAtAlight,
          lossSeconds: onward.dist[onward.goalKey] - normalArrival
        }
        break
      }
    }

    advice.push({
      station: leg.station,
      fromLine: leg.fromLine,
      toLine: leg.toLine,
      walkSeconds: leg.seconds,
      baseSeconds: leg.baseSeconds,
      estimated: leg.estimated,
      marginSeconds: margin,
      sprintCatch,
      nextTrain
    })
  }
  return advice
}

function itineraryWarnings(net: Network, legs: Leg[]): string[] {
  const warnings: string[] = []
  for (const leg of legs) {
    if (leg.type === 'walk' && leg.fallback) {
      warnings.push(
        `${net.stations[leg.station]} 缺少 ${net.lines[leg.fromLine].name}→${net.lines[leg.toLine].name} 的换乘步行整理值，按 180 秒估计。`
      )
    }
  }
  return warnings
}

export function plan(net: Network, options: PlanOptions): PlanResult {
  const warnings: string[] = [...(net.data.meta.warnings ?? [])]
  const day = options.day === 'weekday' ? 0 : 1
  const fromIdx = net.stationIndex.get(options.from)
  const toIdx = net.stationIndex.get(options.to)
  if (fromIdx === undefined || toIdx === undefined) {
    return {
      ok: false,
      reason: '出发站或目的站不在当前原型覆盖范围内。',
      savingSeconds: 0,
      worthRunning: false,
      minSaveSeconds: options.minSaveSec ?? 90,
      warnings
    }
  }
  const startSec = parseClock(options.time) * 60
  const minSave = options.minSaveSec ?? 90

  if (fromIdx === toIdx) {
    return {
      ok: true,
      normal: {
        arrival: startSec,
        duration: 0,
        legs: [],
        transfers: [],
        warnings: []
      },
      fast: null,
      savingSeconds: 0,
      worthRunning: false,
      minSaveSeconds: minSave,
      summary: '出发站与目的站相同。',
      warnings
    }
  }

  const normalOpt: WalkOptions = {
    speed: options.speed,
    sprint: 1,
    bufferSec: options.bufferSec
  }
  const normalRun = runDijkstra(net, day, fromIdx, toIdx, startSec, normalOpt)
  if (!normalRun) {
    return {
      ok: false,
      reason: '该时刻没有可用班次（可能已过末班车，或数据未覆盖该方向）。',
      savingSeconds: 0,
      worthRunning: false,
      minSaveSeconds: minSave,
      warnings
    }
  }

  const normal = reconstruct(net, normalRun, startSec)
  normal.warnings = itineraryWarnings(net, normal.legs)
  if (options.analyze !== false) {
    normal.transfers = transferAdvice(net, day, normal.legs, normalOpt, options.sprint, normal.arrival, toIdx)
  }

  let fast: Itinerary | null = null
  let savingSeconds = 0
  if (options.sprint > 1.0001) {
    const fastOpt: WalkOptions = {
      speed: options.speed,
      sprint: options.sprint,
      bufferSec: options.bufferSec
    }
    const fastRun = runDijkstra(net, day, fromIdx, toIdx, startSec, fastOpt)
    if (fastRun) {
      const candidate = reconstruct(net, fastRun, startSec)
      candidate.warnings = itineraryWarnings(net, candidate.legs)
      if (options.analyze !== false) {
        candidate.transfers = transferAdvice(net, day, candidate.legs, fastOpt, options.sprint, candidate.arrival, toIdx)
      }
      savingSeconds = normal.arrival - candidate.arrival
      if (savingSeconds > 0) fast = candidate
    }
  }

  const worthRunning = savingSeconds >= minSave
  let summary = '正常步速已是最早到达，无需赶车。'
  if (savingSeconds > 0) {
    const text = `${Math.round(savingSeconds / 60)} 分 ${String(savingSeconds % 60).padStart(2, '0')} 秒`
    summary = worthRunning
      ? `在部分换乘点加快脚步可提前 ${text} 到达，值得争取。`
      : `加快脚步仅能提前 ${text}，收益不足，建议按正常步速。`
  }

  warnings.push(...normal.warnings)
  const fallbackNames = normal.transfers.filter((t) => t.estimated).map((t) => net.stations[t.station])
  if (fallbackNames.length) {
    warnings.push(`含估计换乘时间：${[...new Set(fallbackNames)].join('、')}（非运营方实测）。`)
  }

  return {
    ok: true,
    normal,
    fast,
    savingSeconds,
    worthRunning,
    minSaveSeconds: minSave,
    summary,
    warnings
  }
}

export function describeArrival(seconds: number): string {
  const { text, nextDay } = formatClock(seconds)
  return nextDay ? `次日 ${text}` : text
}
