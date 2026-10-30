/**
 * 长春 E 出行 table2 解析与跨站车次匹配。
 *
 * 协议（实测）：
 *   POST /micro/other/train/time/get/table2
 *   {lineCode, standCode, direction, weekday}
 *   data.list[].startInterval = 小时，paramsList[].time = 分钟（两位字符串）
 *
 * weekday 实测 0、3–7 返回空 list，1/2 有数据；1 比 2 班次密（176 vs 139）。
 * 因此把 1/2 分别解释为工作日/双休日，但标记为推断，需 App/官方文案复核。
 */
export const WEEKDAYS = {
  1: { dayType: 'weekday', label: '工作日', inferred: true },
  2: { dayType: 'weekend', label: '双休日', inferred: true }
}

const WEEKDAY_EVIDENCE = {
  tested: [0, 1, 2, 3, 4, 5, 6, 7],
  nonEmpty: [1, 2],
  empty: [0, 3, 4, 5, 6, 7],
  counts: { 1: 176, 2: 139 },
  note: '1/2 有数据且 1 班次更密；0、3–7 为空。按工作日/双休日解释是推断，不是官方枚举说明。'
}

function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null) return obj[n]
    const lower = n.toLowerCase()
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === lower) return obj[k]
    }
  }
  return undefined
}

function asArray(v) {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

function findLineArray(value) {
  if (Array.isArray(value)) {
    if (value.some((v) => v && typeof v === 'object' && (pick(v, ['linecode', 'lineCode']) || pick(v, ['standList', 'stands'])))) {
      return value
    }
    for (const v of value) {
      const found = findLineArray(v)
      if (found) return found
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  for (const v of Object.values(value)) {
    const found = findLineArray(v)
    if (found) return found
  }
  return null
}

export function parseLinesPayload(text, meta = {}) {
  const trimmed = String(text).replace(/^\uFEFF/, '').trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error('线路/时刻响应必须是 JSON；该接口实际返回 JSON，不再支持 XML 解析')
  }
  const payload = JSON.parse(trimmed)
  const linesRaw = findLineArray(payload)
  if (!linesRaw) throw new Error('线路响应中找不到 lines/standList')
  const lines = linesRaw.map((raw, index) => {
    const lineCode = String(pick(raw, ['linecode', 'lineCode', 'code']) ?? '').padStart(2, '0')
    const name = String(pick(raw, ['cname', 'name', 'lineName']) ?? '')
    const standsRaw = asArray(pick(raw, ['standList', 'stands', 'standlist']))
    const stands = standsRaw.map((s, order) => ({
      standCode: String(pick(s, ['standcode', 'standCode']) ?? ''),
      name: String(pick(s, ['cname', 'name', 'standName']) ?? ''),
      order,
      upTerminus: String(pick(s, ['upstand', 'upStand']) ?? ''),
      downTerminus: String(pick(s, ['downstand', 'downStand']) ?? ''),
      isTransfer: String(pick(s, ['istransfer', 'isTransfer']) ?? '0') === '1',
      transferInfo: String(pick(s, ['transferinfo', 'transferInfo']) ?? ''),
      upFirst: pick(s, ['upfirstdate', 'upFirstDate']) ?? null,
      upLast: pick(s, ['uplastdate', 'upLastDate']) ?? null,
      downFirst: pick(s, ['downfirstdate', 'downFirstDate']) ?? null,
      downLast: pick(s, ['downlastdate', 'downLastDate']) ?? null
    }))
    return {
      index,
      lineCode,
      name,
      firstStand: String(pick(raw, ['firststand', 'firstStand']) ?? ''),
      endStand: String(pick(raw, ['endstand', 'endStand']) ?? ''),
      upFirst: pick(raw, ['upfirstdate']) ?? null,
      upLast: pick(raw, ['uplastdate']) ?? null,
      downFirst: pick(raw, ['downfirstdate']) ?? null,
      downLast: pick(raw, ['downlastdate']) ?? null,
      stands
    }
  })
  return { lines, source: meta }
}

function parseHHMM(text) {
  if (text === undefined || text === null) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function fmt(minute) {
  const m = ((minute % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function median(nums) {
  if (!nums.length) return null
  const a = [...nums].sort((x, y) => x - y)
  const mid = a.length >> 1
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

export function parseTable2(text, meta = {}) {
  const trimmed = String(text).replace(/^\uFEFF/, '').trim()
  if (!trimmed.startsWith('{')) throw new Error('table2 响应必须是 JSON 对象')
  const payload = JSON.parse(trimmed)

  const errors = []
  const warnings = []
  const okFlag = payload?.success === true || payload?.code === '200' || payload?.code === 200
  if (!okFlag) errors.push(`接口未返回成功：${payload?.message ?? payload?.code ?? 'unknown'}`)
  const data = payload?.data
  if (!data) {
    return {
      ok: false,
      errors: [...errors, '缺少 data'],
      warnings,
      weekday: meta.weekday,
      dayType: WEEKDAYS[meta.weekday]?.dayType ?? null,
      times: [],
      stats: { trains: 0 }
    }
  }

  const describeDate = Number(data.describeDate)
  const dayType = WEEKDAYS[describeDate]?.dayType ?? null
  if (meta.weekday !== undefined && Number(meta.weekday) !== describeDate) {
    errors.push(`请求 weekday=${meta.weekday}，响应 describeDate=${describeDate}`)
  }
  if (!dayType) {
    if (describeDate === 0 || describeDate >= 3) {
      warnings.push(`weekday=${describeDate} 返回空/无对应日类型；该值不作为可导入日期`)
    } else {
      errors.push(`未知 describeDate=${describeDate}`)
    }
  }

  const list = asArray(data.list)
  const times = []
  let hourGroups = 0
  let endMismatch = 0
  let lastRawMinute = -1
  for (const group of list) {
    const hourRaw = pick(group, ['startInterval', 'startinterval'])
    const endRaw = pick(group, ['endInterval', 'endinterval'])
    const hour = Number(hourRaw)
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      errors.push(`非法 startInterval=${hourRaw}`)
      continue
    }
    if (endRaw !== undefined && Number(endRaw) !== hour) {
      endMismatch++
      warnings.push(`startInterval=${hour} 与 endInterval=${endRaw} 不同，按 startInterval 解释`)
    }
    const params = asArray(pick(group, ['paramsList', 'paramslist']))
    if (params.length) hourGroups++
    for (const p of params) {
      const rawTime = String(pick(p, ['time']) ?? '')
      if (!/^\d{1,2}$/.test(rawTime)) {
        errors.push(`非法 time=${rawTime}`)
        continue
      }
      const minute = Number(rawTime)
      if (minute > 59) {
        errors.push(`time 超过 59：${rawTime}（hour=${hour}）`)
        continue
      }
      const type = pick(p, ['type'])
      if (type !== null && type !== undefined && type !== '') {
        warnings.push(`存在特殊 type=${type} 的时刻 ${hour}:${rawTime}`)
      }
      const absolute = hour * 60 + minute
      if (lastRawMinute >= 0 && absolute < lastRawMinute) {
        errors.push(`原始时间顺序错误：${fmt(lastRawMinute)} 之后出现 ${fmt(absolute)}`)
      }
      lastRawMinute = absolute
      times.push({ minute: absolute, type: type ?? null, hour, minuteOfHour: minute })
    }
  }

  times.sort((a, b) => a.minute - b.minute)
  for (let i = 1; i < times.length; i++) {
    if (times[i].minute === times[i - 1].minute) {
      errors.push(`重复时刻：${fmt(times[i].minute)}`)
    }
  }

  // 跨午夜：首班早于 04:00 视为服务日次日
  let offset = 0
  for (let i = 0; i < times.length; i++) {
    if (i === 0 && times[i].minute < 240) times[i].minute += 1440
    while (i > 0 && times[i].minute + offset < times[i - 1].minute) offset += 1440
    times[i].minute += offset
  }
  for (let i = 1; i < times.length; i++) {
    if (times[i].minute <= times[i - 1].minute) {
      errors.push(`时刻未严格递增：${fmt(times[i - 1].minute)} → ${fmt(times[i].minute)}`)
      break
    }
  }

  const first = parseHHMM(data.firstDate)
  const last = parseHHMM(data.lastDate)
  if (times.length) {
    const computedFirst = times[0].minute
    const computedLast = times[times.length - 1].minute
    const compareFirst = first === null ? null : first < 240 ? first + 1440 : first
    const compareLast = last === null ? null : last < 240 ? last + 1440 : last
    if (compareFirst !== null && Math.abs(computedFirst - compareFirst) > 1) {
      warnings.push(`首班字段与 list 不一致：响应 ${data.firstDate}，按 list 计算 ${fmt(computedFirst)}；以 list 为准`)
    }
    if (compareLast !== null && Math.abs(computedLast - compareLast) > 1) {
      warnings.push(`末班字段与 list 不一致：响应 ${data.lastDate}，按 list 计算 ${fmt(computedLast)}；以 list 为准`)
    }
  } else if (dayType) {
    errors.push(`weekday=${meta.weekday} 有日类型但 list 为空`)
  }

  const diffs = []
  for (let i = 1; i < times.length; i++) diffs.push(times[i].minute - times[i - 1].minute)
  const med = median(diffs)
  if (med !== null && med < 1) warnings.push(`中位间隔 ${med} 分钟，偏短`)
  if (med !== null && med > 30) warnings.push(`中位间隔 ${med} 分钟，偏长`)
  if (diffs.some((d) => d > 60)) warnings.push('存在超过 60 分钟的间隔，请核对停运时段')

  const direction = Number(data.directionType)
  if (meta.direction !== undefined && Number(meta.direction) !== direction) {
    errors.push(`请求 direction=${meta.direction}，响应 directionType=${direction}`)
  }
  if (!data.startSiteName || !data.endSiteName) errors.push('缺少方向端点 startSiteName/endSiteName')

  return {
    ok: errors.length === 0,
    lineCode: String(meta.lineCode ?? '').padStart(2, '0'),
    lineName: String(data.lineName ?? ''),
    standCode: String(meta.standCode ?? ''),
    standName: String(data.standName ?? ''),
    direction,
    weekday: describeDate,
    dayType,
    weekdayInferred: dayType ? WEEKDAYS[describeDate]?.inferred : false,
    startSiteName: String(data.startSiteName ?? ''),
    endSiteName: String(data.endSiteName ?? ''),
    firstDate: data.firstDate ?? null,
    lastDate: data.lastDate ?? null,
    times,
    errors,
    warnings,
    stats: {
      trains: times.length,
      hours: hourGroups,
      endMismatch,
      medianHeadway: med,
      minHeadway: diffs.length ? Math.min(...diffs) : null,
      maxHeadway: diffs.length ? Math.max(...diffs) : null
    },
    evidence: WEEKDAY_EVIDENCE
  }
}

/** 相邻站时刻匹配：最大基数、单调、区间运行时间约束。 */
export function matchTimes(aTimes, bTimes, opts = {}) {
  const minRun = opts.minRun ?? 1
  const maxRun = opts.maxRun ?? 15
  const n = aTimes.length
  const m = bTimes.length
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1))
  const ways = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1))
  ways[0][0] = 1
  for (let j = 1; j <= m; j++) ways[0][j] = 1
  for (let i = 1; i <= n; i++) ways[i][0] = 1

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const skipA = dp[i - 1][j]
      const skipB = dp[i][j - 1]
      const d = bTimes[j - 1] - aTimes[i - 1]
      const can = d >= minRun && d <= maxRun
      const match = can ? dp[i - 1][j - 1] + 1 : -1
      const best = Math.max(skipA, skipB, match)
      dp[i][j] = best
      let w = 0
      if (best === skipA) w += ways[i - 1][j]
      if (best === skipB) w += ways[i][j - 1]
      if (best === match && match >= 0) w += ways[i - 1][j - 1]
      ways[i][j] = Math.min(2, w)
    }
  }

  const pairs = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    const d = bTimes[j - 1] - aTimes[i - 1]
    const can = d >= minRun && d <= maxRun
    if (can && dp[i][j] === dp[i - 1][j - 1] + 1) {
      pairs.push([i - 1, j - 1, d])
      i--
      j--
    } else if (dp[i][j] === dp[i - 1][j]) {
      i--
    } else {
      j--
    }
  }
  pairs.reverse()
  const matchedA = new Set(pairs.map((p) => p[0]))
  const matchedB = new Set(pairs.map((p) => p[1]))
  return {
    pairs,
    unmatchedA: [...Array(n).keys()].filter((x) => !matchedA.has(x)),
    unmatchedB: [...Array(m).keys()].filter((x) => !matchedB.has(x)),
    matched: pairs.length,
    ambiguity: ways[n][m] > 1,
    confidence: pairs.length / Math.max(n, m, 1)
  }
}

/** 把多站时刻链成车次；不唯一/不完整时保留歧义标记。 */
export function buildTrips(stations, opts = {}) {
  if (!stations.length) return { trips: [], confidence: 0, errors: ['没有车站时刻'] }
  const minRun = opts.minRun ?? 1
  const maxRun = opts.maxRun ?? 15
  let trains = stations[0].times.map((t, i) => ({
    id: `T${i + 1}`,
    stops: [{ station: 0, minute: t }]
  }))
  let matchedTotal = 0
  let ambiguityPairs = 0
  let possibleTotal = stations[0].times.length
  const legReports = []

  for (let si = 1; si < stations.length; si++) {
    const prevTimes = trains.map((t) => t.stops[t.stops.length - 1].minute)
    const nextTimes = stations[si].times
    const m = matchTimes(prevTimes, nextTimes, { minRun, maxRun })
    matchedTotal += m.matched
    possibleTotal = Math.max(possibleTotal, nextTimes.length)
    if (m.ambiguity) ambiguityPairs++
    legReports.push({
      from: stations[si - 1].name,
      to: stations[si].name,
      matched: m.matched,
      prev: prevTimes.length,
      next: nextTimes.length,
      unmatchedPrev: m.unmatchedA.length,
      unmatchedNext: m.unmatchedB.length,
      ambiguity: m.ambiguity,
      confidence: m.confidence
    })
    const usedNext = new Set()
    const nextTrains = []
    for (const [pi, ni] of m.pairs) {
      trains[pi].stops.push({ station: si, minute: nextTimes[ni] })
      usedNext.add(ni)
      nextTrains.push(trains[pi])
    }
    for (let ni = 0; ni < nextTimes.length; ni++) {
      if (usedNext.has(ni)) continue
      nextTrains.push({ id: `T${si}-${ni + 1}`, stops: [{ station: si, minute: nextTimes[ni] }] })
    }
    nextTrains.sort((a, b) => a.stops[a.stops.length - 1].minute - b.stops[b.stops.length - 1].minute)
    trains = nextTrains
  }

  const confidence = possibleTotal ? matchedTotal / Math.max(possibleTotal * (stations.length - 1), 1) : 0
  return {
    trips: trains,
    confidence,
    ambiguityPairs,
    legReports,
    errors: [],
    stationCount: stations.length,
    trainCount: trains.length
  }
}

export { WEEKDAY_EVIDENCE }
