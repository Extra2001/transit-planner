#!/usr/bin/env node
/**
 * 合成示例城市的适配器：生成 cities/demo/network.json（v2 格式）。
 *
 * 这个城市存在的意义是证明「新增城市 = manifest + 数据 + 适配器」：
 * 核心、前端、路由都不需要为它改一行代码。
 *
 * 它同时覆盖了几个容易出错的形态：
 *   - 环线（demo-2 回到起点车站）
 *   - 短交路（只跑前 3 站）
 *   - 跳站（不停乙站）
 *   - 跨午夜（23:50 发车，到站 >1440 分钟）
 *   - 换乘站多线路站点关系（丙站同时属于 demo-1 / demo-2）
 *   - 服务日历（工作日 / 双休日）
 */
import { publishCity, readManifest } from '../../scripts/lib/publish-city.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const stations = [
  { id: 'demo:station:jia', name: '甲站', aliases: ['甲'], stops: [{ line: 'demo-1' }] },
  { id: 'demo:station:yi', name: '乙站', stops: [{ line: 'demo-1' }] },
  {
    id: 'demo:station:bing',
    name: '丙站',
    aliases: ['丙'],
    stops: [{ line: 'demo-1' }, { line: 'demo-2' }]
  },
  { id: 'demo:station:ding', name: '丁站', stops: [{ line: 'demo-1' }] },
  { id: 'demo:station:wu', name: '戊站', stops: [{ line: 'demo-2' }] },
  { id: 'demo:station:ji', name: '己站', stops: [{ line: 'demo-2' }] }
]

function line(id, name, shortName, color, loop, directions, stationCount) {
  return {
    id,
    name,
    shortName,
    color,
    textColor: '#fff',
    mode: 'metro',
    loop,
    directions: directions.map((n, i) => ({ id: `${id}-${i}`, name: n, index: i })),
    source: {
      name: '合成示例',
      url: 'https://example.invalid/demo',
      license: 'CC0-1.0',
      file: 'tools/demo-city/generate.mjs'
    },
    dataDate: '2026-01-01',
    aggregateDate: '2026-01-01',
    confidence: 'high',
    status: 'supported',
    stationCount,
    bstStationCount: stationCount,
    tripCount: 0,
    passEntries: 0,
    dwellUnknown: 0,
    stationGaps: [],
    extraStations: [],
    missingAdjacency: [],
    notes: ['合成数据，仅用于测试新增城市流程']
  }
}

const trips = []
const add = (dayType, lineIndex, dir, flat) => trips.push([dayType, lineIndex, dir, flat])

// 工作日 1 号线：08:00 起每 10 分钟一班，双向
for (let k = 0; k < 5; k++) {
  const t = 480 + k * 10
  add(0, 0, 0, [0, t, 1, t + 3, 2, t + 6, 3, t + 9])
  add(0, 0, 1, [3, t, 2, t + 3, 1, t + 6, 0, t + 9])
}
add(0, 0, 0, [0, 530, 2, 536, 3, 539]) // 跳站：不停乙站
add(0, 0, 0, [0, 520, 1, 523, 2, 526]) // 短交路：只到丙站
add(0, 0, 1, [3, 1439, 2, 1442, 1, 1445, 0, 1448]) // 跨午夜：到站 > 1440 分钟

// 2 号线环线：丙 → 戊 → 己 → 丙
for (let k = 0; k < 4; k++) {
  const t = 480 + k * 12
  add(0, 1, 0, [2, t, 4, t + 4, 5, t + 8, 2, t + 12])
  add(0, 1, 1, [2, t, 5, t + 4, 4, t + 8, 2, t + 12])
}

// 双休日：间隔更长
for (let k = 0; k < 3; k++) {
  const t = 480 + k * 15
  add(1, 0, 0, [0, t, 1, t + 3, 2, t + 6, 3, t + 9])
  add(1, 0, 1, [3, t, 2, t + 3, 1, t + 6, 0, t + 9])
  add(1, 1, 0, [2, t, 4, t + 4, 5, t + 8, 2, t + 12])
  add(1, 1, 1, [2, t, 5, t + 4, 4, t + 8, 2, t + 12])
}

const lines = [
  line('demo-1', '示例1线', '1', '#0ea5e9', false, ['上行', '下行'], 4),
  line('demo-2', '示例2线', '2', '#f97316', true, ['外环', '内环'], 3)
]
for (const [index, ln] of lines.entries()) {
  ln.tripCount = trips.filter((t) => t[1] === index).length
}

const data = {
  schemaVersion: 2,
  city: 'demo',
  meta: {
    schemaVersion: 2,
    title: '合成示例城市（测试用）',
    generatedAt: '2026-01-01T00:00:00Z',
    aggregateUpdatedAt: '2026-01-01',
    aggregateUpdatedNote: '人工合成，不含真实运营信息',
    counts: {
      lines: lines.length,
      stations: stations.length,
      trips: trips.length,
      transferVariants: 2,
      fallbackTransfers: 0
    },
    warnings: ['合成数据，不能用于真实出行']
  },
  stations,
  lines,
  transfers: [
    { s: 2, from: 0, to: 1, sec: 120, source: 'estimate', confidence: 'high', note: '合成换乘' },
    { s: 2, from: 1, to: 0, sec: 120, source: 'estimate', confidence: 'high', note: '合成换乘' }
  ],
  trips,
  services: [
    { id: 'weekday', label: '工作日', dayType: 0, days: [1, 2, 3, 4, 5] },
    { id: 'weekend', label: '双休日', dayType: 1, days: [6, 7] }
  ]
}

const published = publishCity({
  cityId: 'demo',
  network: data,
  manifest: readManifest(root, 'demo'),
  root,
  status: {
    status: 'ready',
    capturedAt: '2026-01-01',
    counts: data.meta.counts,
    coverage: 1,
    coverageDetail: { coveredStations: stations.length, expectedStations: stations.length, stationCoverage: 1 },
    note: '合成数据，仅用于演示城市接入方式，不能用于真实出行。'
  }
})
console.log(
  `写出 ${path.relative(root, published.networkFile)} 与 status.json：${trips.length} 班、${stations.length} 站、${lines.length} 线`
)
