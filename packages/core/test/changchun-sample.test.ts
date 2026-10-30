import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createNetwork, plan, type NetworkData } from '../src/index'

function latestNetwork(): string | null {
  const root = fileURLToPath(new URL('../../../data/changchun/imported/versions', import.meta.url))
  if (!fs.existsSync(root)) return null
  const versions = fs
    .readdirSync(root)
    .map((v) => ({
      dir: path.join(root, v),
      time: v
    }))
    .sort((a, b) => a.time.localeCompare(b.time))
  for (let i = versions.length - 1; i >= 0; i--) {
    for (const name of ['network.json', 'network.partial.json']) {
      const p = path.join(versions[i].dir, name)
      if (fs.existsSync(p)) {
        try {
          const data = JSON.parse(fs.readFileSync(p, 'utf8')) as NetworkData
          if (data.lines?.length && data.trips?.length) return p
        } catch {
          /* try next */
        }
      }
    }
  }
  return null
}

const file = latestNetwork()

if (!file) {
  describe.skip('长春 table2 全量网络（没有本地导入数据）', () => {
    it('跳过', () => {})
  })
} else {
  const net = createNetwork(JSON.parse(fs.readFileSync(file, 'utf8')) as NetworkData)

  describe('长春 table2 全量网络复用北京核心', () => {

  it('8 条线、142 个唯一车站、4,845 班', () => {
    expect(net.lines).toHaveLength(8)
    expect(net.stations.length).toBe(142)
    expect(net.tripsById.length).toBeGreaterThan(4800)
    expect(net.interchange.size).toBeGreaterThan(20)
  })

  it('长春站 → 长影世纪城 可查询并换乘', () => {
    const r = plan(net, {
      from: '长春站',
      to: '长影世纪城',
      time: '08:00',
      day: 'weekday',
      speed: 1,
      bufferSec: 30,
      sprint: 1.35
    })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers.length).toBeGreaterThanOrEqual(1)
    expect(r.normal!.arrival).toBeGreaterThanOrEqual(8 * 60 * 60)
    expect(r.normal!.arrival).toBeLessThan(10 * 60 * 60)
  })

  it('8 条线双向端点可达', () => {
    for (const line of net.lines) {
      const idx = net.lines.indexOf(line)
      const trips = net.tripsByDay[0].filter((t) => t.line === idx)
      let longest = trips[0]
      for (const t of trips) if (t.stops.length > longest.stops.length) longest = t
      const a = net.stations[longest.stops[0].station]
      const b = net.stations[longest.stops[longest.stops.length - 1].station]
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const r = plan(net, {
          from,
          to,
          time: '08:00',
          day: 'weekday',
          speed: 1,
          bufferSec: 30,
          sprint: 1.35
        })
        expect(r.ok, `${line.name} ${from}→${to}`).toBe(true)
      }
    }
  })
  })
}
