import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createNetwork, plan, validateNetworkData, type NetworkInput } from '../src/index'

/**
 * 合成第三城夹具：证明「新增城市 = manifest + 数据 + 适配器」，
 * 且核心/前端不需要为它改一行代码。
 */
const root = fileURLToPath(new URL('../../..', import.meta.url))
const demoDir = path.join(root, 'cities/demo')
const demoManifest = JSON.parse(fs.readFileSync(path.join(demoDir, 'city.json'), 'utf8'))
const demoData = JSON.parse(fs.readFileSync(path.join(demoDir, 'network.json'), 'utf8')) as NetworkInput
const net = createNetwork(demoData)

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('合成第三城：manifest 完整', () => {
  it('必填字段齐全', () => {
    for (const key of ['id', 'name', 'shortName', 'dataUrl', 'dataVersion']) {
      expect(typeof demoManifest[key]).toBe('string')
    }
    expect(demoManifest.license.redistribution).toBe('allowed')
    expect(demoManifest.provenance.synthetic).toBe(true)
    expect(demoManifest.defaults.from).toBe('甲站')
    expect(demoManifest.notices.join('')).toContain('合成')
  })

  it('数据符合统一 schema', () => {
    expect(validateNetworkData(demoData)).toEqual([])
  })
})

describe('合成第三城：能表达特殊运行形态', () => {
  const trips = (demoData as { trips: [number, number, number, number[]][] }).trips

  it('环线：同一车次首尾同站', () => {
    expect(trips.some((t) => t[1] === 1 && t[3][0] === t[3][t[3].length - 2])).toBe(true)
  })

  it('短交路：存在只跑 3 站的车次', () => {
    expect(trips.some((t) => t[1] === 0 && t[3].length === 6)).toBe(true)
  })

  it('跳站：存在跨过乙站的 1 号线车次', () => {
    expect(trips.some((t) => t[1] === 0 && !t[3].includes(net.stationIndex.get('乙站')!))).toBe(
      true
    )
  })

  it('跨午夜：存在 >1440 分钟的到站', () => {
    expect(trips.some((t) => t[3].some((v, i) => i % 2 === 1 && v > 1440))).toBe(true)
  })

  it('换乘站多线路站点关系与稳定 ID', () => {
    expect(net.data.stationIds).toHaveLength(6)
    expect(net.data.stationIds).toContain('demo:station:bing')
    expect(net.data.stationAliases?.['丙站']).toEqual(['丙'])
    const bing = net.stationIndex.get('丙站')!
    expect(net.lineAt[bing]).toHaveLength(2)
  })

  it('服务日历存在且与 dayType 对应', () => {
    const services = (demoData as { services: { id: string; dayType: number }[] }).services
    expect(services.map((s) => s.dayType).sort()).toEqual([0, 1])
  })

  it('甲站 → 己站 可查询并需要换乘', () => {
    const r = plan(net, {
      from: '甲站',
      to: '己站',
      time: '08:00',
      day: 'weekday',
      speed: 1,
      bufferSec: 30,
      sprint: 1.35
    })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers.length).toBeGreaterThanOrEqual(1)
  })

  it('双休日班次少于工作日（服务日历生效）', () => {
    const byDay = net.tripsByDay
    expect(byDay[0].length).toBeGreaterThan(byDay[1].length)
  })
})

describe('合成第三城：不需要改核心与前端', () => {
  it('@transit/core 源码不含 demo 特判', () => {
    const files = walk(path.join(root, 'packages/core/src'))
    const hits = files.filter((f) => fs.readFileSync(f, 'utf8').includes('demo'))
    expect(hits).toEqual([])
  })

  it('apps/web 源码不含 demo 特判', () => {
    const files = walk(path.join(root, 'apps/web/src'))
    const hits = files.filter((f) => /['"`]demo['"`]|\.id === 'demo'/.test(fs.readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})
