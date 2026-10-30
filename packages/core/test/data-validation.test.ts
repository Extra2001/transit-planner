import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createNetwork, validateNetworkData, type NetworkInput } from '../src/index'

const citiesDir = fileURLToPath(new URL('../../../cities', import.meta.url))

function manifests(): { id: string; file: string; redistribution: string }[] {
  if (!fs.existsSync(citiesDir)) return []
  return fs
    .readdirSync(citiesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(citiesDir, d.name, 'city.json')))
    .map((d) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(citiesDir, d.name, 'city.json'), 'utf8'))
      return {
        id: manifest.id,
        file: path.join(citiesDir, d.name, 'network.json'),
        redistribution: manifest.license?.redistribution ?? 'unclear'
      }
    })
}

describe('城市数据 schema', () => {
  const list = manifests()
  it('至少有一个城市 manifest', () => {
    expect(list.length).toBeGreaterThan(0)
  })

  for (const city of list) {
    it(`${city.id}：数据结构合法`, () => {
      if (!fs.existsSync(city.file)) {
        // 许可未确认的城市数据不入库，本机没有就跳过（CI 即此情况）
        expect(city.redistribution).not.toBe('allowed')
        return
      }
      const data = JSON.parse(fs.readFileSync(city.file, 'utf8')) as NetworkInput
      expect(validateNetworkData(data)).toEqual([])
      const net = createNetwork(data)
      expect(net.stations.length).toBeGreaterThan(0)
      expect(net.tripsById.length).toBeGreaterThan(0)
      expect(net.lines.length).toBeGreaterThan(0)
    })
  }
})
