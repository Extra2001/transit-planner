import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseLinesPayload, parseTable2, matchTimes, buildTrips } from './table2.mjs'

// ---------- 构造性测试：匹配唯一性 ----------
const unique = matchTimes([0, 10, 20], [2, 12, 22], { minRun: 1, maxRun: 3 })
assert.equal(unique.matched, 3)
assert.equal(unique.unique, true)
assert.deepEqual(unique.pairs.map((p) => [p[0], p[1]]), [
  [0, 0],
  [1, 1],
  [2, 2]
])

const ambiguous = matchTimes([0], [3, 4], { minRun: 1, maxRun: 5 })
assert.equal(ambiguous.optimal, 1)
assert.equal(ambiguous.matched, 0)
assert.equal(ambiguous.certain.length, 0)
assert.equal(ambiguous.uncertainPairs, 1)
assert.equal(ambiguous.unique, false)
assert.equal(ambiguous.pathCountCapped, 2)

const noAssociation = matchTimes([0], [20], { minRun: 1, maxRun: 3 })
assert.equal(noAssociation.matched, 0)
assert.equal(noAssociation.unique, true)

// 路径计数会把“先跳 A 再跳 B / 先跳 B 再跳 A”算两遍，
// 但实际最大匹配唯一，不得据此判成多解。
const countedButUnique = matchTimes([0, 10], [1, 30], { minRun: 1, maxRun: 5 })
assert.equal(countedButUnique.optimal, 1)
assert.deepEqual(countedButUnique.certain, [[0, 0, 1]])
assert.equal(countedButUnique.uncertainPairs, 0)
assert.equal(countedButUnique.unique, true)

// 两种同样合理的匹配：不得跨腿写入正式车次
const ambiguousTrips = buildTrips(
  [
    { name: 'A', times: [0] },
    { name: 'B', times: [3, 4] }
  ],
  { minRun: 1, maxRun: 5 }
)
assert.equal(ambiguousTrips.trips.length, 0)
assert.equal(ambiguousTrips.allTrips.length, 3)
assert.equal(ambiguousTrips.ambiguityRate, 1)
assert.equal(ambiguousTrips.coverage, 0)
assert.equal(ambiguousTrips.verification, 'partial')

// 唯一匹配：三站车次完整
const uniqueTrips = buildTrips(
  [
    { name: 'A', times: [0, 10, 20] },
    { name: 'B', times: [2, 12, 22] },
    { name: 'C', times: [4, 14, 24] }
  ],
  { minRun: 1, maxRun: 3 }
)
assert.equal(uniqueTrips.trips.length, 3)
assert.equal(uniqueTrips.ambiguityRate, 0)
assert.equal(uniqueTrips.coverage, 1)
assert.equal(uniqueTrips.verification, 'unique')
assert.deepEqual(uniqueTrips.trips[0].stops, [
  { station: 0, minute: 0 },
  { station: 1, minute: 2 },
  { station: 2, minute: 4 }
])

// 中途始发：B 站多出的 22 分车次从 B 开始，A→B 的确认车次仍保留
const midStart = buildTrips(
  [
    { name: 'A', times: [0, 10] },
    { name: 'B', times: [2, 12, 22] },
    { name: 'C', times: [4, 14, 24] }
  ],
  { minRun: 1, maxRun: 3 }
)
assert.equal(midStart.trips.length, 3)
assert.equal(midStart.startedAtIntermediate, 1)
assert.ok(midStart.trips.some((t) => t.stops[0].station === 1 && t.stops[0].minute === 22))
assert.ok(midStart.trips.some((t) => t.stops[0].station === 0 && t.stops.at(-1).minute === 4))

// 中途终到：20→22 的车次在 B 结束，不能被下一步丢进黑洞
const midEnd = buildTrips(
  [
    { name: 'A', times: [0, 10, 20] },
    { name: 'B', times: [2, 12, 22] },
    { name: 'C', times: [4, 14] }
  ],
  { minRun: 1, maxRun: 3 }
)
assert.equal(midEnd.terminatedAtIntermediate, 1)
assert.equal(midEnd.trips.length, 3)
assert.ok(midEnd.trips.some((t) => t.stops.length === 2 && t.stops.at(-1).minute === 22))
assert.ok(midEnd.trips.some((t) => t.stops.length === 3 && t.stops.at(-1).minute === 4))
assert.ok(midEnd.trips.some((t) => t.stops.length === 3 && t.stops.at(-1).minute === 14))

// 不同交路：B 站有始发车、C 站有终到车，已确认区段均应保留
const shortTurns = buildTrips(
  [
    { name: 'A', times: [0, 10, 20] },
    { name: 'B', times: [2, 12, 22, 32] },
    { name: 'C', times: [4, 14, 24, 34] }
  ],
  { minRun: 1, maxRun: 3 }
)
assert.equal(shortTurns.ambiguityRate, 0)
assert.ok(shortTurns.trips.some((t) => t.stops[0].station === 1 && t.stops[0].minute === 32))
assert.ok(shortTurns.trips.some((t) => t.stops[0].station === 0 && t.stops.length === 3))

// 相邻站缺失班次：唯一匹配但仍应暴露覆盖缺口，不补造车次
const missing = buildTrips(
  [
    { name: 'A', times: [0, 10, 20] },
    { name: 'B', times: [2, 12] },
    { name: 'C', times: [4, 14, 24] }
  ],
  { minRun: 1, maxRun: 3 }
)
assert.equal(missing.ambiguityRate, 0)
assert.equal(missing.coverage, 4 / 6)
assert.equal(missing.trips.length, 2)
assert.ok(missing.allTrips.some((t) => t.stops.length === 1 && t.stops[0].minute === 20))
assert.ok(missing.allTrips.some((t) => t.stops.length === 1 && t.stops[0].minute === 24))

// 歧义腿两侧的已确认区段可以保留，但不得跨歧义腿连接
const splitAtAmbiguity = buildTrips(
  [
    { name: 'A', times: [0] },
    { name: 'B', times: [3, 4] },
    { name: 'C', times: [6, 7] }
  ],
  { minRun: 1, maxRun: 5 }
)
assert.equal(splitAtAmbiguity.ambiguityRate, 0.5)
assert.equal(splitAtAmbiguity.trips.length, 2)
assert.ok(splitAtAmbiguity.trips.every((t) => t.stops[0].station === 1))
assert.ok(!splitAtAmbiguity.trips.some((t) => t.stops.some((s) => s.station === 0)))

// 真实中途终到与歧义截断必须分开计数，不能互相冒充
const mixedEndings = buildTrips(
  [
    { name: 'A', times: [0, 10, 20] },
    { name: 'B', times: [2, 12, 22] },
    { name: 'C', times: [4, 14] },
    { name: 'D', times: [6, 7] }
  ],
  { minRun: 1, maxRun: 3 }
)
assert.equal(mixedEndings.legCount, 3)
assert.equal(mixedEndings.ambiguityRate, 1 / 3)
assert.equal(mixedEndings.terminatedAtIntermediate, 1)
assert.equal(mixedEndings.splitByAmbiguity, 2)
assert.equal(mixedEndings.restartedAfterAmbiguity, 2)
assert.equal(mixedEndings.startedAtIntermediate, 0)
assert.equal(mixedEndings.trips.length, 3)
assert.ok(mixedEndings.trips.some((t) => t.stops.length === 2 && t.stops.at(-1).minute === 22))
assert.ok(!mixedEndings.trips.some((t) => t.stops.some((s) => s.station === 3)))

// 某站没有时刻：整条腿视为无关联，不生成跨站车次
const emptyStation = buildTrips(
  [
    { name: 'A', times: [0, 10] },
    { name: 'B', times: [] },
    { name: 'C', times: [4, 14] }
  ],
  { minRun: 1, maxRun: 3 }
)
assert.equal(emptyStation.trips.length, 0)
assert.equal(emptyStation.ambiguityRate, 1)
assert.equal(emptyStation.coverage, 0)
assert.equal(emptyStation.legReports[0].reason, 'empty')
assert.ok(emptyStation.allTrips.every((t) => t.stops.length === 1))

// ---------- 真实样本（可选） ----------
const raw = path.resolve('data/changchun/raw')
const required = ['lines.json', 'table2-01-0121-1-1.json', 'table2-01-0121-2-1.json', 'table2-01-0122-2-1.json']
if (required.every((f) => fs.existsSync(path.join(raw, f)))) {
  const lines = parseLinesPayload(fs.readFileSync(path.join(raw, 'lines.json'), 'utf8'))
  assert.equal(lines.lines.length, 8)
  const l1 = lines.lines.find((l) => l.lineCode === '01')
  assert.equal(l1.stands.length, 15)
  assert.equal(l1.stands[0].standCode, '0121')

  const req = (weekday, stand = '0121', direction = 1) =>
    parseTable2(fs.readFileSync(path.join(raw, `table2-01-${stand}-${direction}-${weekday}.json`), 'utf8'), {
      lineCode: '01',
      standCode: stand,
      direction,
      weekday
    })

  const weekday = req(1)
  assert.equal(weekday.ok, true)
  assert.equal(weekday.dayType, 'weekday')
  assert.equal(weekday.stats.trains, 176)
  assert.equal(weekday.errors.length, 0)

  const weekend = req(2)
  assert.equal(weekend.ok, true)
  assert.equal(weekend.dayType, 'weekend')
  assert.equal(weekend.stats.trains, 139)

  const a = req(1, '0121', 2)
  const b = req(1, '0122', 2)
  const m = matchTimes(a.times.map((t) => t.minute), b.times.map((t) => t.minute), { minRun: 1, maxRun: 15 })
  assert.equal(m.matched, 173)
  assert.equal(m.unique, true)

  const built = buildTrips(
    [
      { name: a.standName, times: a.times.map((t) => t.minute) },
      { name: b.standName, times: b.times.map((t) => t.minute) }
    ],
    { minRun: 1, maxRun: 15 }
  )
  assert.equal(built.trainCount, 173)
  assert.equal(built.coverage, 1)
  assert.equal(built.ambiguityRate, 0)
  assert.equal(built.verification, 'unique')
} else {
  console.log('SKIP real sample: data/changchun/raw not present')
}

console.log('changchun table2 tests passed')
