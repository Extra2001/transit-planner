import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createNetwork, plan, getTransfer, buildOverrideMap, formatClock } from '../src/index'

const beijingFile = fileURLToPath(new URL('../../../cities/beijing/network.json', import.meta.url))
const network = createNetwork(JSON.parse(fs.readFileSync(beijingFile, 'utf8')))

const base = {
  day: 'weekday' as const,
  speed: 1,
  bufferSec: 30,
  sprint: 1.35,
  minSaveSec: 90
}

describe('全网数据完整性', () => {
  it('28 条线、425 站、19844 班', () => {
    expect(network.lines).toHaveLength(28)
    expect(network.stations).toHaveLength(425)
    expect(network.tripsById).toHaveLength(19844)
    expect(network.interchange.size).toBeGreaterThan(90)
  })

  it('每条线两个方向、两种日期类型均有班次', () => {
    for (const line of network.lines) {
      for (let dir = 0; dir < line.directions.length; dir++) {
        for (const day of [0, 1]) {
          const count = network.tripsByDay[day].filter(
            (t) => t.line === network.lines.indexOf(line) && t.dir === dir
          ).length
          expect(count, `${line.name} day${day} dir${dir}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('所有车次时刻单调、站序合法、跨午夜可大于 1440', () => {
    for (const trip of network.tripsById) {
      expect(trip.stops.length).toBeGreaterThanOrEqual(2)
      for (let i = 1; i < trip.stops.length; i++) {
        expect(trip.stops[i].minute).toBeGreaterThanOrEqual(trip.stops[i - 1].minute)
      }
    }
    expect(network.tripsById.some((t) => t.stops[t.stops.length - 1].minute >= 1440)).toBe(true)
  }, 20000)

  it('每个换乘站的有序线路对都有可用的换乘时间', () => {
    for (const s of network.interchange) {
      const ls = network.lineAt[s]
      for (const a of ls) {
        for (const b of ls) {
          if (a === b) continue
          const selection = getTransfer(network, s, a, b)
          expect(selection.record.sec, `${network.stations[s]} ${a}→${b}`).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('逐线记录数据版本与完整性状态', () => {
    for (const line of network.lines) {
      expect(line.source.license).toBeTruthy()
      expect(line.aggregateDate).toBe('2026-01-13')
      expect(['supported', 'review', 'unsupported']).toContain(line.status)
      expect(line.stationCount).toBeGreaterThan(0)
    }
    const l1 = network.lines.find((l) => l.id === 'l1')!
    expect(l1.stationGaps).toContain('苹果园')
    expect(l1.extraStations).toContain('八角游乐园')
    const l17 = network.lines.find((l) => l.id === 'l17')!
    expect(l17.stationGaps).toContain('望京西')
    const l6 = network.lines.find((l) => l.id === 'l6')!
    expect(l6.passEntries).toBeGreaterThan(0)
  })
})

describe('换乘模型', () => {
  it('保留西直门 2→4 的 30 秒，并区分 4→2 与 13 号线方向', () => {
    const s = network.stationIndex.get('西直门')!
    const l2 = network.lines.findIndex((l) => l.id === 'l2')
    const l4 = network.lines.findIndex((l) => l.id === 'l4')
    const l13 = network.lines.findIndex((l) => l.id === 'l13')
    expect(getTransfer(network, s, l2, l4).record.sec).toBe(30)
    expect(getTransfer(network, s, l4, l2).record.sec).toBe(150)
    expect(getTransfer(network, s, l2, l13).record.sec).toBe(270)
    expect(getTransfer(network, s, l13, l2).record.sec).toBe(390)
    expect(getTransfer(network, s, l2, l4).risk).toContain('0.5 分钟')
  })

  it('方向相关变体取保守上界', () => {
    const s = network.stationIndex.get('国家图书馆')!
    const l4 = network.lines.findIndex((l) => l.id === 'l4')
    const l9 = network.lines.findIndex((l) => l.id === 'l9')
    const sel = getTransfer(network, s, l4, l9)
    expect(sel.directionDependent).toBe(true)
    expect(sel.record.sec).toBe(60)
    expect(sel.variantCount).toBeGreaterThan(1)
  })

  it('个人实测覆盖优先于整理值', () => {
    const s = network.stationIndex.get('西直门')!
    const l2 = network.lines.findIndex((l) => l.id === 'l2')
    const l4 = network.lines.findIndex((l) => l.id === 'l4')
    const map = buildOverrideMap(
      [{ station: '西直门', fromLine: 'l2', toLine: 'l4', seconds: 600 }],
      network
    )
    const sel = getTransfer(network, s, l2, l4, map)
    expect(sel.record.sec).toBe(600)
    expect(sel.record.source).toBe('user')
    expect(sel.record.confidence).toBe('high')
  })
})

describe('路径与边界', () => {
  it('4 号线直达：西直门 → 北京南站', () => {
    const r = plan(network, { ...base, from: '西直门', to: '北京南站', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers).toHaveLength(0)
    expect(r.normal!.legs.filter((l) => l.type === 'ride')).toHaveLength(1)
  })

  it('1 号线全程：环球度假区 → 古城', () => {
    const r = plan(network, { ...base, from: '环球度假区', to: '古城', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.legs.filter((l) => l.type === 'ride')).toHaveLength(1)
    expect(r.normal!.transfers).toHaveLength(0)
  })

  it('多次换乘：天通苑北 → 北京南站', () => {
    const r = plan(network, { ...base, from: '天通苑北', to: '北京南站', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers.length).toBeGreaterThanOrEqual(1)
    expect(r.normal!.legs.some((l) => l.type === 'walk')).toBe(true)
  })


  it('28 条线双向均可从一端到达另一端', () => {
    for (const line of network.lines) {
      const idx = network.lines.indexOf(line)
      const trips = network.tripsByDay[0].filter((t) => t.line === idx)
      let longest = trips[0]
      for (const t of trips) if (t.stops.length > longest.stops.length) longest = t
      const a = network.stations[longest.stops[0].station]
      const b = network.stations[longest.stops[longest.stops.length - 1].station]
      for (const [from, to] of [[a, b], [b, a]] as const) {
        const r = plan(network, { ...base, from, to, time: '08:00' })
        expect(r.ok, `${line.name} ${from}→${to}`).toBe(true)
      }
    }
  })

  it('6 号线跨越越行区段仍可直达', () => {
    const r = plan(network, { ...base, from: '金安桥', to: '潞阳', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers).toHaveLength(0)
  })

  it('房山线→燕房线在阎村东换乘', () => {
    const r = plan(network, { ...base, from: '苏庄', to: '燕山', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers.length).toBeGreaterThanOrEqual(1)
    expect(r.normal!.legs.some((l) => l.type === 'walk' && network.stations[l.station] === '阎村东')).toBe(true)
  })

  it('环线相邻站：鼓楼大街→积水潭、积水潭→鼓楼大街可直达', () => {
    const a = plan(network, { ...base, from: '鼓楼大街', to: '积水潭', time: '08:00' })
    const b = plan(network, { ...base, from: '积水潭', to: '鼓楼大街', time: '08:00' })
    expect(a.ok && b.ok).toBe(true)
    expect(a.normal!.transfers).toHaveLength(0)
    expect(b.normal!.transfers).toHaveLength(0)
    expect(a.normal!.legs[0]).toMatchObject({ type: 'ride', line: network.lines.findIndex((l) => l.id === 'l2') })
  })

  it('机场线跨网：3 号航站楼 → 大兴机场', () => {
    const r = plan(network, { ...base, from: '3号航站楼', to: '大兴机场', time: '08:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.transfers.length).toBeGreaterThanOrEqual(2)
    expect(r.normal!.arrival).toBeGreaterThan(8 * 60 * 60)
  })

  it('跨午夜显示次日', () => {
    const r = plan(network, { ...base, from: '环球度假区', to: '古城', time: '22:50' })
    expect(r.ok).toBe(true)
    expect(r.normal!.arrival).toBeGreaterThan(24 * 60 * 60)
    expect(formatClock(r.normal!.arrival).nextDay).toBe(true)
  })

  it('凌晨 02:00 无车时明确失败', () => {
    const r = plan(network, { ...base, from: '西直门', to: '北京南站', time: '02:00' })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('没有可用班次')
  })

  it('双休日可用', () => {
    const r = plan(network, { ...base, day: 'weekend', from: '西直门', to: '东单', time: '10:00' })
    expect(r.ok).toBe(true)
    expect(r.normal!.arrival).toBeGreaterThan(10 * 60 * 60)
  })
})

describe('性能', () => {
  it('全网单次查询（含两套方案）低于 250ms', () => {
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) {
      plan(network, { ...base, from: '天通苑北', to: '北京南站', time: '08:00' })
    }
    const avg = (performance.now() - t0) / 10
    console.log('avg ms', avg.toFixed(1))
    expect(avg).toBeLessThan(250)
  })
})
