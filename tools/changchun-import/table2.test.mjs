import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseLinesPayload, parseTable2, matchTimes, buildTrips } from './table2.mjs'

const raw = path.resolve('data/changchun/raw')
const required = ['lines.json', 'table2-01-0121-1-1.json', 'table2-01-0121-2-1.json', 'table2-01-0122-2-1.json']
if (!required.every((f) => fs.existsSync(path.join(raw, f)))) {
  console.log('SKIP: 缺少 data/changchun/raw 样本（原始响应不随仓库分发）')
  process.exit(0)
}

const lines = parseLinesPayload(fs.readFileSync(path.join(raw, 'lines.json'), 'utf8'))
assert.equal(lines.lines.length, 8)
const l1 = lines.lines.find((l) => l.lineCode === '01')
assert.ok(l1)
assert.equal(l1.stands.length, 15)
assert.equal(l1.stands[0].standCode, '0121')
assert.equal(l1.stands[0].name, '北环城路')

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
assert.equal(weekday.firstDate, '5:46')
assert.equal(weekday.lastDate, '23:20')
assert.equal(weekday.errors.length, 0)

const weekend = req(2)
assert.equal(weekend.ok, true)
assert.equal(weekend.dayType, 'weekend')
assert.equal(weekend.stats.trains, 139)

for (const w of [0, 3, 4, 5, 6, 7]) {
  const r = req(w)
  assert.equal(r.times.length, 0)
  assert.equal(r.dayType, null)
}

const a = req(1, '0121', 2)
const b = req(1, '0122', 2)
assert.equal(a.stats.trains, 173)
assert.equal(b.stats.trains, 173)
assert.equal(a.startSiteName, '北环城路')
assert.equal(a.endSiteName, '红嘴子')
assert.equal(a.direction, 2)

const m = matchTimes(a.times.map((t) => t.minute), b.times.map((t) => t.minute), { minRun: 1, maxRun: 15 })
assert.equal(m.matched, 173)
assert.equal(m.ambiguity, false)
assert.equal(m.confidence, 1)
assert.deepEqual(m.pairs.slice(0, 3), [
  [0, 0, 1],
  [1, 1, 3],
  [2, 2, 2]
])

const built = buildTrips(
  [
    { name: a.standName, times: a.times.map((t) => t.minute) },
    { name: b.standName, times: b.times.map((t) => t.minute) }
  ],
  { minRun: 1, maxRun: 15 }
)
assert.equal(built.trainCount, 173)
assert.equal(built.confidence, 1)
assert.equal(built.ambiguityPairs, 0)
assert.deepEqual(built.trips[0], {
  id: 'T1',
  stops: [
    { station: 0, minute: 340 },
    { station: 1, minute: 341 }
  ]
})

assert.throws(() => parseLinesPayload('<lines/>'), /JSON/)
console.log('changchun table2 tests passed')
