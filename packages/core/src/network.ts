import type {
  Network,
  NetworkData,
  Occurrence,
  TransferRecord,
  Trip,
  TripStop
} from './types'

export const DEFAULT_TRANSFER_SECONDS = 180

export function createNetwork(data: NetworkData): Network {
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

  // 站点—线路关系
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

  const transferMap = new Map<string, TransferRecord>()
  for (const rec of data.transfers) {
    transferMap.set(`${rec.s}:${rec.from}:${rec.to}`, rec)
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

export function getTransfer(
  net: Network,
  station: number,
  fromLine: number,
  toLine: number
): TransferRecord {
  const found = net.transferMap.get(`${station}:${fromLine}:${toLine}`)
  if (found) return found
  return {
    s: station,
    from: fromLine,
    to: toLine,
    sec: DEFAULT_TRANSFER_SECONDS,
    est: true,
    fallback: true
  }
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
