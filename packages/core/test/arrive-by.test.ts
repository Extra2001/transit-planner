import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createNetwork,
  searchDepartures,
  evaluateDoorExit,
  plan,
  planArriveBy,
  parseClock,
  type ArriveByOptions,
  type DoorModel,
  type LineInfo,
  type Network,
  type RawTrip
} from '../src/index'

const root = fileURLToPath(new URL('../../..', import.meta.url))

function minute(hhmm: string): number {
  return parseClock(hhmm)
}

const NO_DOOR: DoorModel = {
  toPlatformSec: 0,
  fromStationSec: 0,
  safetySec: 0,
  walkJitterSec: 0
}

function line(id: string, dirs = 1): LineInfo {
  return {
    id,
    name: id,
    shortName: id,
    color: '#0a7',
    textColor: '#fff',
    mode: 'metro',
    loop: false,
    directions: Array.from({ length: dirs }, (_, i) => ({ id: String(i), name: `方向${i}`, index: i })),
    source: { name: 'test', url: '', license: 'MIT', file: 'test' },
    dataDate: null,
    aggregateDate: '2026-01-01',
    confidence: 'high',
    status: 'supported',
    stationCount: 0,
    bstStationCount: 0,
    tripCount: 0,
    passEntries: 0,
    dwellUnknown: 0,
    stationGaps: [],
    extraStations: [],
    missingAdjacency: [],
    notes: []
  } as LineInfo
}

function makeNet(spec: {
  stations: string[]
  lines: LineInfo[]
  trips: RawTrip[]
  transfers?: { s: number; from: number; to: number; sec: number }[]
}): Network {
  return createNetwork({
    meta: {
      schemaVersion: 1,
      title: 'test',
      generatedAt: '2026-01-01',
      aggregateUpdatedAt: '2026-01-01',
      aggregateUpdatedNote: '',
      counts: {},
      warnings: []
    },
    stations: spec.stations,
    lines: spec.lines,
    transfers: (spec.transfers ?? []).map((t) => ({
      s: t.s,
      from: t.from,
      to: t.to,
      sec: t.sec,
      source: 'official' as const,
      confidence: 'high' as const
    })),
    trips: spec.trips
  } as never)
}

function opts(over: Partial<ArriveByOptions> = {}): ArriveByOptions {
  return {
    from: 'A',
    to: 'D',
    deadline: '08:32',
    day: 'weekday',
    door: NO_DOOR,
    speed: 1,
    ...over
  }
}

/** A—B—C—D，每 10 分钟一班，全程 12 分钟 */
function simpleLine(): Network {
  const trips: RawTrip[] = []
  for (let i = 0; i < 12; i++) {
    const start = 8 * 60 + i * 10
    trips.push([0, 0, 0, [0, start, 1, start + 4, 2, start + 8, 3, start + 12]])
  }
  return makeNet({ stations: ['A', 'B', 'C', 'D'], lines: [line('L1')], trips })
}

describe('门到门时间模型', () => {
  it('进站与出站步行计入门到门耗时', () => {
    const net = simpleLine()
    const door: DoorModel = {
      toPlatformSec: 600,
      fromStationSec: 300,
      safetySec: 120,
      walkJitterSec: 0
    }
    const res = planArriveBy(net, opts({ door, deadline: '08:37' }))
    expect(res.ok).toBe(true)
    const latest = res.latest!
    expect(latest.boardDepart).toBe(minute('08:20') * 60)
    expect(latest.doorExit + door.toPlatformSec + door.safetySec).toBeLessThan(latest.boardDepart)
    expect(latest.arrivalDoor).toBe(latest.arrivalStation + 300)
    expect(latest.duration).toBe(latest.arrivalDoor - latest.doorExit)
    expect(latest.arrivalDoor).toBeLessThanOrEqual(minute('08:37') * 60)
    expect(latest.slack).toBe(minute('08:37') * 60 - latest.arrivalDoor)
  })

  it('同一班车，晚出门只是减少站台等待，到达不变', () => {
    const net = simpleLine()
    const early = evaluateDoorExit(net, opts({ deadline: '08:37' }), minute('08:00') * 60)!
    const late = evaluateDoorExit(net, opts({ deadline: '08:37' }), minute('08:07') * 60)!
    expect(early.boardDepart).toBe(late.boardDepart)
    expect(early.arrivalDoor).toBe(late.arrivalDoor)
    expect(early.platformWait).toBeGreaterThan(late.platformWait)
    expect(early.platformWait - late.platformWait).toBe(7 * 60)
    expect(late.duration).toBeLessThan(early.duration)
  })
})

describe('到达时间约束', () => {
  it('截止时间恰好可达', () => {
    const net = simpleLine()
    const res = planArriveBy(net, opts({ deadline: '08:32' }))
    expect(res.ok).toBe(true)
    expect(res.latest!.arrivalDoor).toBe(minute('08:32') * 60)
  })

  it('提前一分钟即不可达', () => {
    const net = simpleLine()
    const res = planArriveBy(net, opts({ deadline: '08:11' }))
    expect(res.ok).toBe(false)
    expect(res.latest).toBeNull()
    expect(res.alternatives).toEqual([])
  })

  it('截止时间约束目的地，而不是列车终点', () => {
    const net = simpleLine()
    const res = planArriveBy(
      net,
      opts({ to: 'B', deadline: '08:16', door: { ...NO_DOOR, fromStationSec: 120 } })
    )
    expect(res.ok).toBe(true)
    // B 站 08:10 到，+2 分钟出站 = 08:12
    expect(res.latest!.arrivalStation).toBe(minute('08:14') * 60)
    expect(res.latest!.arrivalDoor).toBe(minute('08:16') * 60)
  })

  it('首班车之前无解；最晚出门受末班车约束', () => {
    const net = simpleLine()
    expect(planArriveBy(net, opts({ deadline: '08:05' })).ok).toBe(false)
    const late = planArriveBy(net, opts({ deadline: '12:00', maxSearchSec: 5 * 3600 }))
    expect(late.ok).toBe(true)
    expect(late.latest!.boardDepart).toBe(minute('09:50') * 60)
  })
})

describe('换乘与步行', () => {
  function twoLines(transferSec: number): Network {
    const trips: RawTrip[] = [
      [0, 0, 0, [0, minute('08:00'), 1, minute('08:06')]],
      [0, 1, 0, [1, minute('08:09'), 2, minute('08:19')]]
    ]
    return makeNet({
      stations: ['A', 'B', 'C'],
      lines: [line('L1'), line('L2')],
      trips,
      transfers: [{ s: 1, from: 0, to: 1, sec: transferSec }]
    })
  }

  it('换乘步行在余量内可行', () => {
    const net = twoLines(60)
    const res = planArriveBy(
      net,
      opts({ to: 'C', deadline: '08:25', door: { ...NO_DOOR, safetySec: 30 } })
    )
    expect(res.ok).toBe(true)
    expect(res.latest!.arrivalStation).toBe(minute('08:19') * 60)
    expect(res.latest!.transferWait).toBeGreaterThanOrEqual(60)
  })

  it('换乘步行增加导致原方案不可行', () => {
    const net = twoLines(600)
    const res = planArriveBy(
      net,
      opts({ to: 'C', deadline: '08:25', door: { ...NO_DOOR, safetySec: 30 } })
    )
    expect(res.ok).toBe(false)
    expect(res.latest).toBeNull()
  })
})

describe('最晚出门与推荐窗口', () => {
  it('理论最晚出门与安全推荐出门不同', () => {
    const net = simpleLine()
    const res = planArriveBy(
      net,
      opts({ deadline: '08:40', door: { ...NO_DOOR, walkJitterSec: 180 } })
    )
    expect(res.ok).toBe(true)
    // 推荐方案必须留出完整的步行不确定性，因此可能改乘更早一班
    expect(res.recommended!.slack).toBeGreaterThanOrEqual(180)
    expect(res.recommended!.doorExit).toBeLessThanOrEqual(res.latest!.doorExit)
    expect(res.window!.end).toBe(res.recommended!.doorExit)
    expect(res.window!.end - res.window!.start).toBe(120)
    expect(res.risk).toBe('safe')
  })

  it('理论最晚方案压线时会提示，推荐方案仍有完整余量', () => {
    const net = simpleLine()
    const res = planArriveBy(
      net,
      opts({ deadline: '08:32', door: { ...NO_DOOR, walkJitterSec: 600 } })
    )
    expect(res.ok).toBe(true)
    expect(res.latest!.slack).toBe(0)
    expect(res.recommended!.slack).toBeGreaterThanOrEqual(600)
    expect(res.riskNote).toContain('压线')
  })

  it('只有一班车、余量无法补足时给出 risky 与建议', () => {
    const net = makeNet({
      stations: ['A', 'B', 'C', 'D'],
      lines: [line('L1')],
      trips: [[0, 0, 0, [0, 8 * 60, 1, 8 * 60 + 4, 2, 8 * 60 + 8, 3, 8 * 60 + 12]]]
    })
    const res = planArriveBy(
      net,
      opts({ deadline: '08:12', door: { ...NO_DOOR, walkJitterSec: 600 } })
    )
    expect(res.ok).toBe(true)
    expect(res.risk).toBe('risky')
    expect(res.riskNote).toContain('建议')
  })
})

describe('优化目标与备选方案', () => {
  /** 快车 08:00 发（10 分钟到），慢车 08:15 发（10 分钟到） */
  function expressNetwork(): Network {
    const trips: RawTrip[] = []
    for (let i = 0; i < 4; i++) {
      const fast = 8 * 60 + i * 30
      trips.push([0, 0, 0, [0, fast, 3, fast + 6]])
      const slow = fast + 15
      trips.push([0, 1, 0, [0, slow, 3, slow + 10]])
    }
    return makeNet({ stations: ['A', 'B', 'C', 'D'], lines: [line('L1'), line('L2')], trips })
  }

  it('最早到达、最晚出门、等待最少分开给出', () => {
    const net = expressNetwork()
    const res = planArriveBy(net, opts({ deadline: '08:40', windowSec: 900 }))
    expect(res.ok).toBe(true)
    const earliest = res.earliest!
    const latest = res.latest!
    expect(earliest.arrivalDoor).toBeLessThanOrEqual(latest.arrivalDoor)
    // 慢车 08:15 出发也能在 08:40 前到 → 最晚出门晚于最早方案
    expect(latest.boardDepart).toBeGreaterThan(earliest.boardDepart)
    expect(res.alternatives.length).toBeGreaterThanOrEqual(2)
    expect(res.alternatives.some((c) => c.label === 'earliest')).toBe(true)
    expect(res.alternatives.some((c) => c.label === 'latest')).toBe(true)
  })

  it('错过首乘会被量化成晚到分钟数', () => {
    const net = simpleLine()
    const res = planArriveBy(net, opts({ deadline: '08:40' }))
    expect(res.ok).toBe(true)
    expect(res.latest!.missedDelay).toBe(10 * 60)
  })

  it('备选方案之间首乘或到达时间有明显区别', () => {
    const net = expressNetwork()
    const res = planArriveBy(net, opts({ deadline: '08:40', windowSec: 900 }))
    const alts = res.alternatives
    expect(alts.length).toBeGreaterThanOrEqual(2)
    const firstTrips = alts.map((c) => {
      const ride = c.itinerary.legs.find((l) => l.type === 'ride')
      return ride ? ride.trip : -1
    })
    expect(new Set(firstTrips).size).toBeGreaterThanOrEqual(2)
  })

  it('同站出发到达直接说明无需乘车', () => {
    const net = simpleLine()
    const res = planArriveBy(net, { ...opts(), to: 'A' })
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('相同')
  })
})

describe('跨午夜、短交路与多次换乘', () => {
  it('跨午夜服务日可行', () => {
    const net = makeNet({
      stations: ['A', 'B', 'C'],
      lines: [line('N')],
      trips: [[0, 0, 0, [0, 1430, 1, 1440, 2, 1450]]]
    })
    const res = planArriveBy(net, { ...opts(), to: 'C', deadline: '00:15' })
    expect(res.ok).toBe(true)
    expect(res.latest!.arrivalStation).toBe(1450 * 60)
    expect(res.latest!.arrivalDoor).toBeLessThanOrEqual(minute('00:15') * 60)
  })

  it('短交路列车不会被坐过终点', () => {
    const net = makeNet({
      stations: ['A', 'B', 'C', 'D'],
      lines: [line('S')],
      trips: [
        [0, 0, 0, [0, minute('08:00'), 1, minute('08:05')]],
        [0, 0, 0, [0, minute('08:10'), 3, minute('08:25')]]
      ]
    })
    const res = planArriveBy(net, { ...opts(), deadline: '08:30' })
    expect(res.ok).toBe(true)
    const legs = res.latest!.itinerary.legs.filter((l) => l.type === 'ride')
    expect(legs.length).toBe(1)
    expect(legs[0].to).toBe(3)
  })

  it('三次乘车与两次换乘', () => {
    const net = makeNet({
      stations: ['A', 'B', 'C', 'D'],
      lines: [line('L1'), line('L2'), line('L3')],
      trips: [
        [0, 0, 0, [0, minute('08:00'), 1, minute('08:05')]],
        [0, 1, 0, [1, minute('08:08'), 2, minute('08:14')]],
        [0, 2, 0, [2, minute('08:16'), 3, minute('08:22')]]
      ],
      transfers: [
        { s: 1, from: 0, to: 1, sec: 60 },
        { s: 2, from: 1, to: 2, sec: 60 }
      ]
    })
    const res = planArriveBy(net, opts({ deadline: '08:30' }))
    expect(res.ok).toBe(true)
    const rides = res.latest!.itinerary.legs.filter((l) => l.type === 'ride')
    expect(rides.length).toBe(3)
    expect(res.latest!.itinerary.legs.filter((l) => l.type === 'walk').length).toBe(2)
  })
})

describe('不确定关联不得拼成连续车次', () => {
  it('同一线路被截断的两段不会合成一次乘车', () => {
    // A→B 与 C→D 是两段，B→C 区段没有车次（模拟关联不确定被截断）
    const net = makeNet({
      stations: ['A', 'B', 'C', 'D'],
      lines: [line('X')],
      trips: [
        [0, 0, 0, [0, minute('08:00'), 1, minute('08:04')]],
        [0, 0, 0, [2, minute('08:06'), 3, minute('08:10')]]
      ]
    })
    const res = planArriveBy(net, { ...opts(), deadline: '08:30' })
    expect(res.ok).toBe(false)
  })
})

describe('长春真实数据（本地存在时）', () => {
  const file = path.join(root, 'cities/changchun/network.json')
  const available = fs.existsSync(file)

  it.skipIf(!available)('已发布网络保留不确定说明，且行程不跨越缺失区段', () => {
    const net = createNetwork(JSON.parse(fs.readFileSync(file, 'utf8')))
    expect(net.data.uncertainty?.ambiguousLegs ?? 0).toBeGreaterThan(0)
    const res = plan(net, {
      from: net.stations[0],
      to: net.stations[net.stations.length - 1],
      time: '08:00',
      day: 'weekday',
      speed: 1,
      bufferSec: 60,
      sprint: 1
    })
    if (!res.ok || !res.normal) return
    for (const leg of res.normal.legs) {
      if (leg.type !== 'ride') continue
      const trip = net.tripsById[leg.trip]
      const fromPos = trip.stops.findIndex((s) => s.station === leg.from)
      const toPos = trip.stops.findIndex((s) => s.station === leg.to)
      expect(fromPos).toBeGreaterThanOrEqual(0)
      expect(toPos).toBeGreaterThan(fromPos)
    }
  })
})

describe('出发时间窗口', () => {
  function network(): Network {
    const trips: RawTrip[] = []
    for (let i = 0; i < 6; i++) {
      const fast = 8 * 60 + i * 20
      trips.push([0, 0, 0, [0, fast, 3, fast + 6]])
      trips.push([0, 1, 0, [0, fast + 10, 3, fast + 18]])
    }
    return makeNet({ stations: ['A', 'B', 'C', 'D'], lines: [line('L1'), line('L2')], trips })
  }

  const base = () => ({
    from: 'A',
    to: 'D',
    start: '08:00',
    day: 'weekday' as const,
    speed: 1,
    door: { ...NO_DOOR, toPlatformSec: 300 }
  })

  it('窗口内给出多种目标，最早到达与最晚出门不同', () => {
    const res = searchDepartures(network(), base())
    expect(res.ok).toBe(true)
    expect(res.candidates.length).toBeGreaterThanOrEqual(2)
    expect(res.earliest!.arrivalDoor).toBeLessThan(res.latest!.arrivalDoor)
    expect(res.latest!.doorExit).toBeGreaterThan(res.earliest!.doorExit)
  })

  it('窗口限制生效', () => {
    const short = searchDepartures(network(), { ...base(), windowSec: 300 })
    expect(short.ok).toBe(true)
    for (const c of short.candidates) expect(c.boardDepart).toBeLessThanOrEqual(8 * 3600 + 300 + 300)
  })

  it('无班次时不编造', () => {
    const res = searchDepartures(network(), { ...base(), start: '23:00' })
    expect(res.ok).toBe(false)
    expect(res.candidates).toEqual([])
  })
})

describe('搜索边界', () => {
  it('无解时不编造方案', () => {
    const net = simpleLine()
    const res = planArriveBy(net, opts({ from: 'D', to: 'A', deadline: '08:32' }))
    expect(res.ok).toBe(false)
    expect(res.reason).toBeTruthy()
    expect(res.latest).toBeNull()
    expect(res.recommended).toBeNull()
  })

  it('评估次数有界（不逐分钟暴力）', () => {
    const net = simpleLine()
    const res = planArriveBy(net, opts({ deadline: '08:32', maxSearchSec: 6 * 3600 }))
    expect(res.ok).toBe(true)
    expect(res.diagnostics.evaluations).toBeLessThan(120)
  })
})
