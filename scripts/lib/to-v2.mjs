/**
 * v1 → v2 归一化：把「站名数组 + 紧凑车次」的历史格式补上稳定站点 ID、
 * 别名与换乘站的多线路站点关系，并补一份服务日历。
 *
 * 只加元数据，不改任何时刻、站序或线路顺序。
 */

export const DEFAULT_SERVICES = [
  { id: 'weekday', label: '工作日', dayType: 0, days: [1, 2, 3, 4, 5] },
  { id: 'weekend', label: '双休日', dayType: 1, days: [6, 7] }
]

export function stationLinesFromTrips(stationNames, trips) {
  const map = new Map()
  for (const trip of trips) {
    const [, lineIdx, , flat] = trip
    for (let k = 0; k < flat.length; k += 2) {
      const name = stationNames[flat[k]]
      if (name === undefined) continue
      if (!map.has(name)) map.set(name, new Set())
      map.get(name).add(lineIdx)
    }
  }
  return map
}

export function toV2(data, { city, services = DEFAULT_SERVICES } = {}) {
  if (!data || !Array.isArray(data.trips)) throw new Error('toV2 需要含 trips 的网络数据')
  if (Array.isArray(data.stations) && typeof data.stations[0] === 'object') {
    return { ...data, services: data.services ?? services, city: data.city ?? city }
  }
  const stationNames = data.stations ?? []
  const lineIds = (data.lines ?? []).map((l) => l.id)
  const byName = stationLinesFromTrips(stationNames, data.trips)
  const stations = stationNames.map((name) => {
    const lines = [...(byName.get(name) ?? [])].map((i) => lineIds[i]).filter(Boolean)
    return {
      id: `${city}:station:${name}`,
      name,
      stops: lines.map((line) => ({ line }))
    }
  })
  return {
    schemaVersion: 2,
    city,
    meta: data.meta,
    stations,
    lines: data.lines,
    transfers: data.transfers ?? [],
    trips: data.trips,
    services
  }
}
