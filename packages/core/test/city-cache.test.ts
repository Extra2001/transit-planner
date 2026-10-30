import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseCacheEntry,
  sha256Hex,
  staleCacheEntries,
  verifyDataDigest
} from '../src/index'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const base = 'https://example.test/cities/'
const opts = { cityId: 'beijing', dataVersion: '2026-01-13' }

describe('缓存键解析', () => {
  it('解析城市与版本', () => {
    expect(parseCacheEntry(`${base}beijing/network.json?v=2026-01-13`)).toEqual({
      cityId: 'beijing',
      version: '2026-01-13'
    })
  })

  it('无版本号时为 null', () => {
    expect(parseCacheEntry(`${base}beijing/network.json`)).toEqual({
      cityId: 'beijing',
      version: null
    })
  })

  it('非城市 URL 不误判', () => {
    expect(parseCacheEntry('https://example.test/assets/index.js?v=1')).toEqual({
      cityId: null,
      version: '1'
    })
  })
})

describe('离线缓存清理选择', () => {
  it('同城旧版本删除，当前版本保留', () => {
    const urls = [
      `${base}beijing/network.json?v=2026-01-13`,
      `${base}beijing/network.json?v=2025-12-01`,
      `${base}beijing/status.json?v=2025-12-01`
    ]
    expect(staleCacheEntries(urls, opts)).toEqual([
      `${base}beijing/network.json?v=2025-12-01`,
      `${base}beijing/status.json?v=2025-12-01`
    ])
  })

  it('其他城市的当前版本不动', () => {
    const urls = [
      `${base}beijing/network.json?v=2026-01-13`,
      `${base}changchun/network.json?v=2026-10-30`,
      `${base}demo/network.json?v=2026-01-01`
    ]
    expect(staleCacheEntries(urls, opts)).toEqual([])
  })

  it('无版本号的旧格式条目删除', () => {
    expect(staleCacheEntries([`${base}beijing/network.json`], opts)).toEqual([
      `${base}beijing/network.json`
    ])
  })

  it('已下线城市删除', () => {
    const urls = [`${base}removed/network.json?v=1`]
    expect(staleCacheEntries(urls, { ...opts, knownCityIds: ['beijing', 'demo'] })).toEqual(urls)
    expect(staleCacheEntries(urls, opts)).toEqual([])
  })

  it('非城市数据条目删除', () => {
    const urls = ['https://example.test/assets/index.js?v=1']
    expect(staleCacheEntries(urls, opts)).toEqual(urls)
  })
})

describe('数据完整性摘要', () => {
  it('sha256 与已知向量一致', async () => {
    const bytes = new TextEncoder().encode('abc')
    expect(await sha256Hex(bytes)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('校验通过/失败/格式非法', async () => {
    const bytes = new TextEncoder().encode('abc')
    const good = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    expect(await verifyDataDigest(bytes, good)).toBe(true)
    expect(await verifyDataDigest(bytes, good.toUpperCase())).toBe(true)
    expect(await verifyDataDigest(bytes, good.replace(/^b/, 'c'))).toBe(false)
    expect(await verifyDataDigest(bytes, undefined)).toBe(false)
    expect(await verifyDataDigest(bytes, 'not-a-hash')).toBe(false)
  })

  it('已发布城市的 status.json 摘要与实际文件一致', async () => {
    const citiesDir = path.join(root, 'cities')
    for (const entry of fs.readdirSync(citiesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const statusFile = path.join(citiesDir, entry.name, 'status.json')
      const networkFile = path.join(citiesDir, entry.name, 'network.json')
      if (!fs.existsSync(statusFile) || !fs.existsSync(networkFile)) continue
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
      const bytes = fs.readFileSync(networkFile)
      expect(status.dataSha256, `${entry.name} 缺少 dataSha256`).toMatch(/^[0-9a-f]{64}$/)
      expect(await verifyDataDigest(bytes, status.dataSha256), `${entry.name} 摘要不匹配`).toBe(true)
      expect(status.byteSize).toBe(bytes.byteLength)
    }
  })
})
