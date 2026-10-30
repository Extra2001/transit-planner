import type { NetworkData, RawTrip, ServiceDef, StationInput } from './types'

/** 允许的输入：v1（站名数组）或 v2（站点对象数组）。 */
export type NetworkInput = NetworkData | NetworkDataV2

export interface NetworkDataV2 {
  schemaVersion: 2
  city?: string
  meta: NetworkData['meta']
  stations: StationInput[]
  lines: NetworkData['lines']
  transfers: NetworkData['transfers']
  trips: RawTrip[]
  services?: ServiceDef[]
}

const DAY_TYPES = new Set([0, 1])

/**
 * 校验并迁移为内部使用的 v1 扁平结构。
 *
 * 迁移只做「结构归一」，不改任何时刻：站点对象拆成名称数组，
 * 稳定 ID / 别名 / 服务日历作为并列字段保留在 NetworkData 上。
 */
export function migrateNetworkData(input: NetworkInput): NetworkData {
  const errors = validateNetworkData(input)
  if (errors.length) {
    const head = errors.slice(0, 5).join('；')
    throw new Error(`网络数据校验失败（${errors.length} 项）：${head}`)
  }
  const data = input as NetworkDataV2
  if (!Array.isArray(data.stations) || typeof data.stations[0] === 'string') {
    const v1 = input as NetworkData
    const city = v1.city ?? 'city'
    return withStationIdentity(v1, {
      names: v1.stations,
      ids: v1.stationIds ?? v1.stations.map((n) => `${city}:station:${n}`),
      aliases: v1.stationAliases ?? {}
    })
  }
  const names = data.stations.map((s) => s.name)
  const ids = data.stations.map((s, i) => s.id || `${data.city ?? 'city'}:station:${s.name}#${i}`)
  const aliases: Record<string, string[]> = {}
  for (const s of data.stations) if (s.aliases?.length) aliases[s.name] = s.aliases
  return withStationIdentity(
    {
      meta: data.meta,
      stations: names,
      lines: data.lines,
      transfers: data.transfers,
      trips: data.trips
    },
    { names, ids, aliases, services: data.services, city: data.city }
  )
}

function withStationIdentity(
  base: NetworkData,
  extra: {
    names: string[]
    ids: string[]
    aliases: Record<string, string[]>
    services?: ServiceDef[]
    city?: string
  }
): NetworkData {
  return {
    ...base,
    stationIds: extra.ids,
    stationAliases: extra.aliases,
    services: extra.services,
    city: extra.city ?? base.city
  }
}

/** 返回所有问题；空数组表示通过。错误信息面向维护者，不做本地化包装。 */
export function validateNetworkData(input: NetworkInput): string[] {
  const errors: string[] = []
  if (!input || typeof input !== 'object') return ['数据不是对象']
  const data = input as NetworkDataV2
  if (!data.meta || typeof data.meta !== 'object') errors.push('缺少 meta')
  if (!Array.isArray(data.lines) || !data.lines.length) errors.push('缺少 lines')
  if (!Array.isArray(data.trips) || !data.trips.length) errors.push('缺少 trips')
  if (!Array.isArray(data.transfers)) errors.push('缺少 transfers')

  const v2 = Array.isArray(data.stations) && typeof data.stations[0] === 'object'
  const stationCount = Array.isArray(data.stations) ? data.stations.length : 0
  if (!stationCount) errors.push('缺少 stations')

  if (v2) {
    const seenId = new Set<string>()
    const seenName = new Set<string>()
    for (const s of data.stations as StationInput[]) {
      if (!s || typeof s.name !== 'string' || !s.name) {
        errors.push('站点缺少 name')
        continue
      }
      if (seenName.has(s.name)) errors.push(`站点重复：${s.name}`)
      seenName.add(s.name)
      if (s.id) {
        if (seenId.has(s.id)) errors.push(`站点 ID 重复：${s.id}`)
        seenId.add(s.id)
      }
      if (s.aliases && !Array.isArray(s.aliases)) errors.push(`站点 ${s.name} 的 aliases 不是数组`)
    }
  } else {
    const seen = new Set<string>()
    for (const name of data.stations as unknown as string[]) {
      if (typeof name !== 'string' || !name) errors.push('站点名称必须是非空字符串')
      else if (seen.has(name)) errors.push(`站点重复：${name}`)
      else seen.add(name)
    }
  }

  const lineIds = new Set<string>()
  if (Array.isArray(data.lines)) {
    for (const line of data.lines) {
      if (!line?.id) errors.push('线路缺少 id')
      else if (lineIds.has(line.id)) errors.push(`线路 id 重复：${line.id}`)
      else lineIds.add(line.id)
      if (!Array.isArray(line?.directions) || !line.directions.length) {
        errors.push(`线路 ${line?.id ?? '?'} 缺少 directions`)
      }
    }
  }

  if (Array.isArray(data.transfers)) {
    for (const [i, t] of data.transfers.entries()) {
      if (typeof t?.s !== 'number' || t.s < 0 || t.s >= stationCount) {
        errors.push(`换乘记录 ${i} 的站点下标越界`)
      }
      if (typeof t?.sec !== 'number' || t.sec < 0) errors.push(`换乘记录 ${i} 的秒数非法`)
    }
  }

  if (Array.isArray(data.trips)) {
    for (const [i, trip] of data.trips.entries()) {
      if (!Array.isArray(trip) || trip.length < 4) {
        errors.push(`车次 ${i} 结构非法`)
        continue
      }
      const [dayType, line, dir, flat] = trip
      if (!DAY_TYPES.has(dayType)) errors.push(`车次 ${i} 日期类型非法：${dayType}`)
      if (!Number.isInteger(line) || line < 0 || line >= (data.lines?.length ?? 0)) {
        errors.push(`车次 ${i} 线路下标越界`)
      }
      const directionCount = data.lines?.[line]?.directions?.length ?? 0
      if (!Number.isInteger(dir) || dir < 0 || dir >= directionCount) {
        errors.push(`车次 ${i} 方向下标越界`)
      }
      if (!Array.isArray(flat) || flat.length % 2 !== 0) {
        errors.push(`车次 ${i} 站序不是偶数长度`)
        continue
      }
      if (flat.length < 4) errors.push(`车次 ${i} 站数少于 2`)
      let prev = -Infinity
      for (let k = 0; k < flat.length; k += 2) {
        const station = flat[k]
        const minute = flat[k + 1]
        if (!Number.isInteger(station) || station < 0 || station >= stationCount) {
          errors.push(`车次 ${i} 站点下标越界`)
          break
        }
        if (typeof minute !== 'number' || !Number.isFinite(minute)) {
          errors.push(`车次 ${i} 时刻非法`)
          break
        }
        if (minute < prev) {
          errors.push(`车次 ${i} 时刻倒序`)
          break
        }
        prev = minute
      }
    }
  }

  return errors
}
