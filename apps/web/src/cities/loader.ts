import { createNetwork, type CityManifest, type Network } from '@transit/core'

export interface CityStatusFile {
  status: string
  version: string
  capturedAt: string
  counts: {
    lines: number
    stations: number
    trips: number
    fullLengthTrips?: number
    groups?: number
  }
  coverage: number
  association?: {
    legCount: number
    ambiguousLegs: number
    uncertainPairs: number
    associationCoverage: number
    ambiguityRate: number
    verificationCounts: { unique: number; partial: number; insufficient: number }
  }
  note?: string
}

export class CityDataUnavailable extends Error {
  constructor(readonly cityId: string, readonly reason: 'missing' | 'network' | 'invalid') {
    super(
      reason === 'missing'
        ? `${cityId} 的数据未随本次发布分发（许可未确认或未启用本地数据）`
        : `${cityId} 数据加载失败`
    )
  }
}

const networkCache = new Map<string, Promise<Network>>()
const statusCache = new Map<string, Promise<CityStatusFile | null>>()

function assetUrl(path: string, version?: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const clean = path.replace(/^\.?\//, '')
  const query = version ? `?v=${encodeURIComponent(version)}` : ''
  return `${base}${clean}${query}`
}

function statusPath(manifest: CityManifest): string {
  return manifest.dataUrl.replace(/[^/]+$/, 'status.json')
}

export type ProbeResult = 'ok' | 'missing' | 'unreachable'

/**
 * 探测数据文件是否存在，避免对未分发的城市发起整包请求。
 * unreachable 表示现在拿到不到响应（离线/网络故障），不代表城市未分发，
 * 仍应尝试从 Service Worker 缓存读取。
 */
export async function probeCity(manifest: CityManifest): Promise<ProbeResult> {
  try {
    const res = await fetch(assetUrl(manifest.dataUrl, manifest.dataVersion), { method: 'HEAD' })
    if (res.ok) return 'ok'
    return res.status >= 400 && res.status < 500 ? 'missing' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

export function loadCityStatus(manifest: CityManifest): Promise<CityStatusFile | null> {
  const key = `${manifest.id}@${manifest.dataVersion}`
  let pending = statusCache.get(key)
  if (!pending) {
    pending = fetch(assetUrl(statusPath(manifest), manifest.dataVersion))
      .then((res) => (res.ok ? (res.json() as Promise<CityStatusFile>) : null))
      .catch(() => null)
    statusCache.set(key, pending)
  }
  return pending
}

export function loadCityNetwork(manifest: CityManifest): Promise<Network> {
  const key = `${manifest.id}@${manifest.dataVersion}`
  let pending = networkCache.get(key)
  if (!pending) {
    pending = fetch(assetUrl(manifest.dataUrl, manifest.dataVersion))
      .then(async (res) => {
        if (!res.ok) throw new CityDataUnavailable(manifest.id, res.status === 404 ? 'missing' : 'network')
        const json = await res.json()
        try {
          return createNetwork(json)
        } catch (e) {
          throw new CityDataUnavailable(manifest.id, 'invalid')
        }
      })
      .catch((e) => {
        networkCache.delete(key)
        throw e
      })
    networkCache.set(key, pending)
  }
  return pending
}

/** 显式把城市数据写入 CacheStorage，供离线使用；失败时返回 false。 */
export async function cacheCityOffline(manifest: CityManifest): Promise<boolean> {
  if (!('caches' in globalThis)) return false
  try {
    const url = assetUrl(manifest.dataUrl, manifest.dataVersion)
    const res = await fetch(url)
    if (!res.ok) return false
    const cache = await caches.open('transit-city-data')
    await cache.put(url, res.clone())
    await loadCityStatus(manifest).then(async (status) => {
      if (!status) return
      const statusUrl = assetUrl(statusPath(manifest), manifest.dataVersion)
      const sres = await fetch(statusUrl)
      if (sres.ok) await cache.put(statusUrl, sres)
    })
    return true
  } catch {
    return false
  }
}

export function isCityCached(manifest: CityManifest): Promise<boolean> {
  if (!('caches' in globalThis)) return Promise.resolve(false)
  return caches
    .open('transit-city-data')
    .then((cache) => cache.match(assetUrl(manifest.dataUrl, manifest.dataVersion)))
    .then((hit) => Boolean(hit))
    .catch(() => false)
}
