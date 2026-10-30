import type {
  Network,
  NetworkData,
  Occurrence,
  TransferOverride,
  TransferRecord,
  Trip,
  TripStop
} from './types'
import type { NetworkInput } from './schema'
import { migrateNetworkData } from './schema'

export const DEFAULT_TRANSFER_SECONDS = 180

export function transferKey(station: string, fromLine: string, toLine: string): string {
  return `${station}|${fromLine}|${toLine}`
}

export interface TransferSelection {
  record: TransferRecord
  directionDependent: boolean
  variantCount: number
  risk?: string
}

export function createNetwork(input: NetworkInput): Network {
  const data = migrateNetworkData(input)
  const stationIndex = new Map<string, number>()
  data.stations.forEach((name, i) => {
    if (stationIndex.has(name)) throw new Error(`站点重复：${name}`)
    stationIndex.set(name, i)
  })

  const lineAt: number[][] = data.stations.map(() => [])
  const tripsByDay: Trip[][] = [[], []]
  const tripsById: Trip[] = []
  const occByDay: Map<string, Occurrence[]>[] = [new Map(), new Map()]

  data.trips.forEach((raw, id) => {
    const [dayType, line, dir, flat] = raw
    if (dayType !== 0 && dayType !== 1) throw new Error(`未知日期类型：${dayType}`)
    if (flat.length % 2 !== 0 || flat.length < 4) throw new Error(`车次 ${id} 站序格式错误`)
    const stops: TripStop[] = []
    for (let i = 0; i < flat.length; i += 2) {
      const station = flat[i]
      const minute = flat[i + 1]
      if (!data.stations[station]) throw new Error(`车次 ${id} 站点下标越界`)
      stops.push({ station, minute })
    }
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].minute < stops[i - 1].minute) {
        throw new Error(`车次 ${id} 时刻倒序：${stops[i - 1].minute} → ${stops[i].minute}`)
      }
    }
    const trip: Trip = { id, dayType, line, dir, stops }
    tripsById[id] = trip
    tripsByDay[dayType].push(trip)
    const occMap = occByDay[dayType]
    stops.forEach((stop, pos) => {
      const key = `${line}:${dir}:${stop.station}`
      let arr = occMap.get(key)
      if (!arr) {
        arr = []
        occMap.set(key, arr)
      }
      arr.push({ trip: id, pos, minute: stop.minute })
    })
  })

  for (const occMap of occByDay) {
    for (const arr of occMap.values()) arr.sort((a, b) => a.minute - b.minute || a.trip - b.trip)
  }

  for (let day = 0; day < 2; day++) {
    for (const trip of tripsByDay[day]) {
      for (const stop of trip.stops) {
        const arr = lineAt[stop.station]
        if (!arr.includes(trip.line)) arr.push(trip.line)
      }
    }
  }
  for (const arr of lineAt) arr.sort((a, b) => a - b)

  const interchange = new Set<number>()
  lineAt.forEach((lines, s) => {
    if (lines.length >= 2) interchange.add(s)
  })

  const transferMap = new Map<string, TransferRecord[]>()
  for (const rec of data.transfers) {
    const key = `${rec.s}:${rec.from}:${rec.to}`
    let arr = transferMap.get(key)
    if (!arr) {
      arr = []
      transferMap.set(key, arr)
    }
    arr.push(rec)
  }

  return {
    data,
    lines: data.lines,
    stations: data.stations,
    stationIndex,
    lineAt,
    interchange,
    transferMap,
    tripsByDay,
    tripsById,
    occByDay
  }
}

/** 同一线路对可能有方向/时段多个变体；路由取保守上界。 */
export function getTransfer(
  net: Network,
  station: number,
  fromLine: number,
  toLine: number,
  overrides?: Map<string, TransferRecord>
): TransferSelection {
  const variants = net.transferMap.get(`${station}:${fromLine}:${toLine}`) ?? []
  const stationName = net.stations[station]
  const key = transferKey(stationName, net.lines[fromLine].id, net.lines[toLine].id)
  const override = overrides?.get(key)
  if (override) {
    return {
      record: override,
      directionDependent: false,
      variantCount: variants.length,
      risk: override.sec < 30 ? `个人实测仅 ${override.sec} 秒，仍偏乐观，请确认。` : undefined
    }
  }

  if (variants.length === 0) {
    return {
      record: {
        s: station,
        from: fromLine,
        to: toLine,
        sec: DEFAULT_TRANSFER_SECONDS,
        source: 'estimate',
        confidence: 'low',
        fallback: true,
        note: '无整理值，按 180 秒默认估计'
      },
      directionDependent: false,
      variantCount: 0,
      risk: '该换乘没有整理值，按 180 秒默认估计。'
    }
  }

  let chosen = variants[0]
  for (const v of variants) if (v.sec > chosen.sec) chosen = v
  const directionDependent = variants.some(
    (v) => v.fromDirection !== undefined || v.toDirection !== undefined
  )
  let risk: string | undefined
  if (chosen.caution) {
    risk = chosen.caution
  } else if (chosen.sec <= 30) {
    risk = `换乘记录仅 ${chosen.sec} 秒，可能明显偏乐观；已保留原值，未自动改写。`
  } else if (chosen.fallback) {
    risk = '该线路对缺少整理值，按 180 秒默认估计。'
  }

  return { record: chosen, directionDependent, variantCount: variants.length, risk }
}

export function buildOverrideMap(
  overrides: TransferOverride[] | undefined,
  net: Network
): Map<string, TransferRecord> | undefined {
  if (!overrides?.length) return undefined
  const map = new Map<string, TransferRecord>()
  for (const o of overrides) {
    const s = net.stationIndex.get(o.station)
    const from = net.lines.findIndex((l) => l.id === o.fromLine)
    const to = net.lines.findIndex((l) => l.id === o.toLine)
    if (s === undefined || from < 0 || to < 0) continue
    map.set(transferKey(o.station, o.fromLine, o.toLine), {
      s,
      from,
      to,
      sec: Math.max(0, Math.round(o.seconds)),
      source: 'user',
      confidence: 'high',
      note: o.note || '个人实测',
      fallback: false
    })
  }
  return map
}

export function findOccurrenceIndex(occs: Occurrence[], minute: number): number {
  let lo = 0
  let hi = occs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (occs[mid].minute < minute) lo = mid + 1
    else hi = mid
  }
  return lo
}
