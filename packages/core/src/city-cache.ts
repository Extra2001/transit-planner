/**
 * 城市数据的缓存键解析、缓存清理选择与完整性校验。
 *
 * 这里保持纯函数（不触碰 DOM/CacheStorage），浏览器侧 loader 负责真正删除条目；
 * 这样规则可以在 Node 环境直接测试。
 */

export interface CacheEntryInfo {
  cityId: string | null
  version: string | null
}

/** 从缓存 URL 中解析城市与数据版本：/cities/beijing/network.json?v=2026-01-13 */
export function parseCacheEntry(url: string): CacheEntryInfo {
  const cityMatch = /\/cities\/([^/?#]+)\//.exec(url)
  const versionMatch = /[?&]v=([^&#]+)/.exec(url)
  return {
    cityId: cityMatch ? decodeURIComponent(cityMatch[1]) : null,
    version: versionMatch ? decodeURIComponent(versionMatch[1]) : null
  }
}

export interface CachePruneOptions {
  /** 当前正在加载的城市 */
  cityId: string
  /** 该城市当前 manifest 的 dataVersion */
  dataVersion: string
  /** 注册表里仍然存在的城市；给出时会连带清理已下线城市 */
  knownCityIds?: string[]
}

/**
 * 选出应删除的缓存条目：
 *   - 不属于城市数据的 URL；
 *   - 城市已从注册表下线；
 *   - 没有版本号的旧格式条目；
 *   - 同一城市但版本不是当前 dataVersion 的旧版本。
 * 其他城市的当前版本不动，避免切换城市时互相清空。
 */
export function staleCacheEntries(urls: string[], options: CachePruneOptions): string[] {
  const known = options.knownCityIds ? new Set(options.knownCityIds) : null
  return urls.filter((url) => {
    const { cityId, version } = parseCacheEntry(url)
    if (!cityId) return true
    if (known && !known.has(cityId)) return true
    if (!version) return true
    if (cityId === options.cityId) return version !== options.dataVersion
    return false
  })
}

/**
 * 判定探测结果。
 *
 * 开发服务器的 SPA 回退会把不存在的路径返回 200 + text/html，
 * 因此不能只看状态码：200 但不是 JSON，视为「未分发」。
 */
export function classifyProbe(
  status: number,
  contentType: string | null
): 'ok' | 'missing' | 'unreachable' {
  if (status >= 200 && status < 300) {
    if (contentType && !contentType.includes('json')) return 'missing'
    return 'ok'
  }
  return status >= 400 && status < 500 ? 'missing' : 'unreachable'
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 校验数据摘要；expected 缺失或格式非法时返回 false，由调用方决定是否强制。 */
export async function verifyDataDigest(
  data: ArrayBuffer | Uint8Array,
  expectedHex: string | undefined | null
): Promise<boolean> {
  if (!expectedHex || !HEX_SHA256.test(expectedHex)) return false
  return (await sha256Hex(data)) === expectedHex.toLowerCase()
}
