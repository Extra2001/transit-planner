import {
  classifyProbe,
  createNetwork,
  staleCacheEntries,
  verifyDataDigest,
  type CityManifest,
  type Network,
  type NetworkInput
} from '@transit/core'
import { cities as registeredCities } from './registry'

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
  dataSha256?: string
  byteSize?: number
}

const CITY_CACHE = 'transit-city-data'

export class CityDataUnavailable extends Error {
  constructor(
    readonly cityId: string,
    readonly reason: 'missing' | 'network' | 'invalid' | 'integrity'
  ) {
    super(
      reason === 'missing'
        ? `${cityId} 的数据未随本次发布分发（许可未确认或未启用本地数据）`
        : reason === 'integrity'
          ? `${cityId} 数据校验失败，文件可能损坏或版本不匹配，请重新下载`
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
    return classifyProbe(res.status, res.headers.get('content-type'))
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
    pending = Promise.all([
      fetch(assetUrl(manifest.dataUrl, manifest.dataVersion)),
      loadCityStatus(manifest)
    ])
      .then(async ([res, status]) => {
        if (!res.ok) throw new CityDataUnavailable(manifest.id, res.status === 404 ? 'missing' : 'network')
        const buffer = await res.arrayBuffer()
        // status.json 与数据同批发布；有摘要时先校验字节，再解析
        if (status?.dataSha256 && !(await verifyDataDigest(buffer, status.dataSha256))) {
          throw new CityDataUnavailable(manifest.id, 'integrity')
        }
        let json: NetworkInput
        try {
          json = JSON.parse(new TextDecoder().decode(buffer)) as NetworkInput
        } catch {
          throw new CityDataUnavailable(manifest.id, 'invalid')
        }
        const network = await Promise.resolve().then(() => createNetwork(json))
        void pruneCityCache(manifest)
        return network
      })
      .catch((e) => {
        networkCache.delete(key)
        throw e
      })
    networkCache.set(key, pending)
  }
  return pending
}

/**
 * 清理过期城市缓存：其他城市的当前版本保留，同城旧版本与已下线城市删除。
 * 失败不影响主流程（例如存储不可用）。
 */
export async function pruneCityCache(manifest: CityManifest): Promise<number> {
  if (!('caches' in globalThis)) return 0
  try {
    const cache = await caches.open(CITY_CACHE)
    const requests = await cache.keys()
    const stale = new Set(
      staleCacheEntries(
        requests.map((r) => r.url),
        {
          cityId: manifest.id,
          dataVersion: manifest.dataVersion,
          knownCityIds: registeredCities.map((c) => c.id)
        }
      )
    )
    let removed = 0
    for (const request of requests) {
      if (!stale.has(request.url)) continue
      if (await cache.delete(request)) removed += 1
    }
    return removed
  } catch {
    return 0
  }
}

/** 显式把城市数据写入 CacheStorage，供离线使用；失败时返回 false。 */
export async function cacheCityOffline(manifest: CityManifest): Promise<boolean> {
  if (!('caches' in globalThis)) return false
  try {
    const url = assetUrl(manifest.dataUrl, manifest.dataVersion)
    const res = await fetch(url)
    if (!res.ok) return false
    const buffer = await res.arrayBuffer()
    const status = await loadCityStatus(manifest)
    if (status?.dataSha256 && !(await verifyDataDigest(buffer, status.dataSha256))) return false
    const cache = await caches.open(CITY_CACHE)
    await cache.put(
      url,
      new Response(buffer, { headers: { 'content-type': 'application/json; charset=utf-8' } })
    )
    if (status) {
      const statusUrl = assetUrl(statusPath(manifest), manifest.dataVersion)
      const sres = await fetch(statusUrl)
      if (sres.ok) await cache.put(statusUrl, sres)
    }
    await pruneCityCache(manifest)
    return true
  } catch {
    return false
  }
}

export function isCityCached(manifest: CityManifest): Promise<boolean> {
  if (!('caches' in globalThis)) return Promise.resolve(false)
  return caches
    .open(CITY_CACHE)
    .then((cache) => cache.match(assetUrl(manifest.dataUrl, manifest.dataVersion)))
    .then((hit) => Boolean(hit))
    .catch(() => false)
}
