import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNetwork, plan } from '../src/index'

function latestSample(): string | null {
  const root = path.resolve('data/changchun/imported/versions')
  if (!fs.existsSync(root)) return null
  const versions = fs
    .readdirSync(root)
    .map((v) => path.join(root, v, 'network.partial.json'))
    .filter((p) => fs.existsSync(p))
    .sort()
  return versions.length ? versions[versions.length - 1] : null
}

describe('长春 table2 样本复用北京核心', () => {
  it('2 站/173 班 partial 网络可以创建并查询', () => {
    const file = latestSample()
    if (!file) {
      console.log('SKIP: 没有 data/changchun/imported 样本')
      return
    }
    const net = createNetwork(JSON.parse(fs.readFileSync(file, 'utf8')))
    expect(net.stations).toEqual(['北环城路', '庆丰路'])
    expect(net.tripsById).toHaveLength(173)
    const r = plan(net, {
      from: '北环城路',
      to: '庆丰路',
      time: '08:00',
      day: 'weekday',
      speed: 1,
      bufferSec: 30,
      sprint: 1.35
    })
    expect(r.ok).toBe(true)
    expect(r.normal!.legs.filter((l) => l.type === 'ride')).toHaveLength(1)
    expect(r.normal!.arrival).toBeGreaterThanOrEqual(8 * 60 * 60)
    expect(r.normal!.arrival).toBeLessThan(8 * 60 * 60 + 10 * 60)
  })
})
