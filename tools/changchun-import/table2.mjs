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

/**
 * 相邻站运行时间搜索窗口上界。
 *
 * 实测（长春 8 线 640 条腿）相邻站时刻差主峰为 1–4 分钟；窗口取 5 分钟给取整留余量。
 * 放得更宽会引入 8–9 分钟的错位对齐（与发车间隔同余），把大量本来可确定的配对变成多解。
 */
export const DEFAULT_MAX_RUN = 5

/** 相邻站时刻匹配：最大基数、单调、区间运行时间约束。 */
function createSolver(aTimes, bTimes, minRun, maxRun) {
  const n = aTimes.length
  const m = bTimes.length
  const W = m + 1
  const dp = new Int16Array((n + 1) * W)
  const ways = new Uint8Array((n + 1) * W)

  return function solve(forbid) {
    dp.fill(0)
    ways.fill(0)
    ways[0] = 1
    for (let j = 1; j <= m; j++) ways[j] = 1
    for (let i = 1; i <= n; i++) ways[i * W] = 1

    for (let i = 1; i <= n; i++) {
      const row = i * W
      const prevRow = (i - 1) * W
      const ai = aTimes[i - 1]
      for (let j = 1; j <= m; j++) {
        const skipA = dp[prevRow + j]
        const skipB = dp[row + j - 1]
        const d = bTimes[j - 1] - ai
        const blocked = forbid !== null && forbid[0] === i - 1 && forbid[1] === j - 1
        const can = !blocked && d >= minRun && d <= maxRun
        const take = can ? dp[prevRow + j - 1] + 1 : -1
        let best = skipA > skipB ? skipA : skipB
        if (take > best) best = take
        dp[row + j] = best
        let w = 0
        if (best === skipA) w += ways[prevRow + j]
        if (best === skipB) w += ways[row + j - 1]
        if (best === take && take >= 0) w += ways[prevRow + j - 1]
        ways[row + j] = w > 2 ? 2 : w
      }
    }

    const pairs = []
    let i = n
    let j = m
    while (i > 0 && j > 0) {
      const d = bTimes[j - 1] - aTimes[i - 1]
      const blocked = forbid !== null && forbid[0] === i - 1 && forbid[1] === j - 1
      const can = !blocked && d >= minRun && d <= maxRun
      if (can && dp[i * W + j] === dp[(i - 1) * W + j - 1] + 1) {
        pairs.push([i - 1, j - 1, d])
        i--
        j--
      } else if (dp[i * W + j] === dp[(i - 1) * W + j]) {
        i--
      } else {
        j--
      }
    }
    pairs.reverse()
    return { pairs, optimal: dp[n * W + m], ways: ways[n * W + m] }
  }
}

/**
 * 相邻站时刻匹配：最大基数、单调、区间运行时间约束。
 *
 * `certain` 只保留“出现在每一个最大基数匹配里”的配对：
 * 把该配对禁用后最大基数会下降，才认为关联被数据唯一确定。
 * 其余配对不写入车次，因此不会出现“随便挑一个合理配对”的情况；
 * 未确认的配对只截断车次，不整段删除，两侧已确认区段仍可用。
 */
export function matchTimes(aTimes, bTimes, opts = {}) {
  const minRun = opts.minRun ?? 1
  const maxRun = opts.maxRun ?? DEFAULT_MAX_RUN
  const n = aTimes.length
  const m = bTimes.length
  if (!n || !m) {
    return {
      pairs: [],
      certain: [],
      uncertainPairs: 0,
      unmatchedA: [...Array(n).keys()],
      unmatchedB: [...Array(m).keys()],
      matched: 0,
      optimal: 0,
      ambiguity: false,
      unique: true,
      coverage: 0,
      pathCountCapped: 0
    }
  }
  const solve = createSolver(aTimes, bTimes, minRun, maxRun)
  const base = solve(null)
  // 路径计数会把“先跳 A 再跳 B”和“先跳 B 再跳 A”算成两条，只能当快速筛子，
  // 不能当唯一性证明；唯一性以逐对确定性为准。
  const ambiguousByCount = base.optimal > 0 && base.ways > 1
  let certain = base.pairs
  let unique = !ambiguousByCount
  if (ambiguousByCount) {
    if (opts.certainty === false) {
      // 没有要求做确定性判定时，一律不返回配对，避免把多解当成已确认。
      certain = []
      unique = false
    } else {
      certain = base.pairs.filter((p) => solve([p[0], p[1]]).optimal < base.optimal)
      unique = certain.length === base.pairs.length && base.pairs.length === base.optimal
    }
  }
  const certainA = new Set(certain.map((p) => p[0]))
  const certainB = new Set(certain.map((p) => p[1]))
  return {
    pairs: base.pairs,
    certain,
    uncertainPairs: base.pairs.length - certain.length,
    unmatchedA: [...Array(n).keys()].filter((x) => !certainA.has(x)),
    unmatchedB: [...Array(m).keys()].filter((x) => !certainB.has(x)),
    matched: certain.length,
    optimal: base.optimal,
    ambiguity: !unique,
    unique,
    /** 已确认配对 / 该腿两侧较大班次数，是数量口径，不是“关联正确概率” */
    coverage: certain.length / Math.max(n, m, 1),
    pathCountCapped: base.ways
  }
}

/**
 * 把多站时刻链成车次。
 *
 * 规则：
 * - 只有相邻站匹配唯一（ways=1）时才连接；
 * - 匹配不唯一的腿直接断开，不把任一边的 pair 写入正式车次；
 * - 中间终到的车次进入 completed，不丢弃；
 * - 中间始发的车次新建 active，继续向后续站延伸；
 * - 最终 trips 只保留至少 2 站的已确认区段。
 *
 * 每个区段带 startReason/endReason，用于区分“真实中途始发/终到”与“因歧义断开”：
 * origin | terminus | unmatched | ambiguity | empty。
 */
export function buildTrips(stations, opts = {}) {
  if (!stations.length) {
    return {
      trips: [],
      allTrips: [],
      coverage: 0,
      ambiguityRate: 0,
      ambiguousLegs: 0,
      uniqueLegs: 0,
      matchedPairs: 0,
      possiblePairs: 0,
      uncertainPairs: 0,
      verification: 'insufficient',
      terminatedAtIntermediate: 0,
      splitByAmbiguity: 0,
      startedAtIntermediate: 0,
      restartedAfterAmbiguity: 0,
      singletonCount: 0,
      fullLengthTrips: 0,
      legReports: [],
      errors: ['没有车站时刻'],
      stationCount: 0,
      legCount: 0,
      trainCount: 0
    }
  }
  const minRun = opts.minRun ?? 1
  const maxRun = opts.maxRun ?? DEFAULT_MAX_RUN
  let nextId = 1
  const newTrip = (station, minute, startReason) => ({
    id: `T${nextId++}`,
    stops: [{ station, minute }],
    startReason
  })
  const endTrip = (trip, reason) => {
    trip.endReason = reason
    return trip
  }

  let active = stations[0].times.map((t) => newTrip(0, t, 'origin'))
  const completed = []
  let matchedPairs = 0
  let possiblePairs = 0
  let ambiguousLegs = 0
  let uniqueLegs = 0
  let uncertainPairs = 0
  const legReports = []

  for (let si = 1; si < stations.length; si++) {
    const prevTimes = active.map((t) => t.stops[t.stops.length - 1].minute)
    const nextTimes = stations[si].times
    const possible = Math.max(prevTimes.length, nextTimes.length)
    possiblePairs += possible

    if (!prevTimes.length || !nextTimes.length) {
      // 任一侧没有时刻就不做关联，避免把“无数据”当成“已确认”。
      ambiguousLegs++
      legReports.push({
        from: stations[si - 1].name,
        to: stations[si].name,
        prev: prevTimes.length,
        next: nextTimes.length,
        unique: false,
        optimal: 0,
        pathCountCapped: 0,
        matched: 0,
        uncertainPairs: 0,
        unmatchedPrev: prevTimes.length,
        unmatchedNext: nextTimes.length,
        ambiguity: true,
        coverage: 0,
        reason: 'empty'
      })
      completed.push(...active.map((t) => endTrip(t, 'empty')))
      active = nextTimes.map((t) => newTrip(si, t, 'empty'))
      continue
    }

    const m = matchTimes(prevTimes, nextTimes, { minRun, maxRun, certainty: true })
    const legAmbiguous = !m.unique
    if (legAmbiguous) ambiguousLegs++
    else uniqueLegs++
    matchedPairs += m.matched
    uncertainPairs += m.uncertainPairs
    legReports.push({
      from: stations[si - 1].name,
      to: stations[si].name,
      prev: prevTimes.length,
      next: nextTimes.length,
      unique: m.unique,
      optimal: m.optimal,
      pathCountCapped: m.pathCountCapped,
      matched: m.matched,
      uncertainPairs: m.uncertainPairs,
      unmatchedPrev: m.unmatchedA.length,
      unmatchedNext: m.unmatchedB.length,
      ambiguity: legAmbiguous,
      coverage: m.matched / Math.max(possible, 1)
    })

    const reason = legAmbiguous ? 'ambiguity' : 'unmatched'
    const usedNext = new Set()
    const nextActive = []
    for (const [pi, ni] of m.certain) {
      active[pi].stops.push({ station: si, minute: nextTimes[ni] })
      usedNext.add(ni)
      nextActive.push(active[pi])
    }
    for (const pi of m.unmatchedA) completed.push(endTrip(active[pi], reason))
    for (let ni = 0; ni < nextTimes.length; ni++) {
      if (usedNext.has(ni)) continue
      nextActive.push(newTrip(si, nextTimes[ni], reason))
    }
    nextActive.sort(
      (a, b) => a.stops[a.stops.length - 1].minute - b.stops[b.stops.length - 1].minute
    )
    active = nextActive
  }

  const allTrips = [...completed, ...active.map((t) => endTrip(t, 'terminus'))]
  const trips = allTrips.filter((t) => t.stops.length >= 2)
  const legs = stations.length - 1
  const ambiguityRate = legs ? ambiguousLegs / legs : 0
  const coverage = possiblePairs ? matchedPairs / possiblePairs : 0
  const verification =
    legs === 0 ? 'insufficient' : ambiguousLegs === 0 ? 'unique' : 'partial'
  const longEnough = (t) => t.stops.length >= 2
  return {
    trips,
    allTrips,
    coverage,
    ambiguityRate,
    ambiguousLegs,
    uniqueLegs,
    matchedPairs,
    possiblePairs,
    uncertainPairs,
    verification,
    /** 唯一匹配腿上没有对上、但在本区间已确认的区段（真实中途终到） */
    terminatedAtIntermediate: completed.filter((t) => longEnough(t) && t.endReason === 'unmatched').length,
    /** 因相邻站关联不确定而被迫截断的已确认区段 */
    splitByAmbiguity: completed.filter((t) => longEnough(t) && t.endReason === 'ambiguity').length,
    /** 唯一匹配腿上新出现的、无前置关联的车次（真实中途始发） */
    startedAtIntermediate: allTrips.filter((t) => t.startReason === 'unmatched').length,
    /** 关联不确定的腿之后重新开始的车次 */
    restartedAfterAmbiguity: allTrips.filter((t) => t.startReason === 'ambiguity').length,
    singletonCount: allTrips.filter((t) => !longEnough(t)).length,
    /** 走完整条导入站序的车次（被不确定关联截断的不计入） */
    fullLengthTrips: trips.filter((t) => t.stops.length === stations.length).length,
    legReports,
    errors: [],
    stationCount: stations.length,
    legCount: legs,
    trainCount: trips.length
  }
}

export { WEEKDAY_EVIDENCE }
