import type {
  DayType,
  Itinerary,
  Network,
  PlanOptions,
  TransferOverride
} from './types'
import { planAtSeconds } from './router'
import { parseClock } from './time'

/**
 * 门到门时间模型（秒）。
 *
 * 四段互不重叠：
 * - toPlatformSec：家 → 首乘站台（含进站、安检、闸机、站内步行）
 * - fromStationSec：到站站台 → 目的地（含出站、闸机、站外步行）
 * - safetySec：进站/换乘安全余量，加在每次上车前
 * - walkJitterSec：步行时间不确定性，只用于给出推荐窗口，不参与可行性判定
 */
export interface DoorModel {
  toPlatformSec: number
  fromStationSec: number
  safetySec: number
  walkJitterSec: number
}

export interface ArriveByOptions {
  from: string
  to: string
  /** HH:MM，早于 04:00 视为服务日次日 */
  deadline: string
  day: DayType
  door: DoorModel
  speed: number
  sprint?: number
  transferOverrides?: TransferOverride[]
  /** 从截止时间向前回溯的最大搜索时长，默认 4 小时 */
  maxSearchSec?: number
  /** 推荐窗口宽度，默认 120 秒 */
  windowSec?: number
  /** 备选方案搜索区间，默认 30 分钟 */
  searchWindowSec?: number
  /** 备选方案上限，默认 5 */
  maxCandidates?: number
}

export interface JourneyCandidate {
  /** 离家时刻（秒） */
  doorExit: number
  /** 到达首乘站台（秒，不含安全余量） */
  platformArrival: number
  /** 首乘发车（秒） */
  boardDepart: number
  /** 站台等待 = 首乘发车 − 到达站台 */
  platformWait: number
  /** 到达目的站站台（秒） */
  arrivalStation: number
  /** 到达最终目的地（秒） */
  arrivalDoor: number
  /** 门到门总耗时（秒） */
  duration: number
  /** 截止时间 − 到达目的地（秒），不会为负 */
  slack: number
  /** 换乘等待合计（秒） */
  transferWait: number
  /** 站外/进出站/换乘步行合计（秒，不含站台等待） */
  walkSec: number
  /** 若错过首乘，坐下一班的晚到秒数；无下一班则 null */
  missedDelay: number | null
  itinerary: Itinerary
  label?: 'earliest' | 'latest' | 'least-wait' | 'alternative'
}

export type RiskLevel = 'safe' | 'tight' | 'risky'

export interface DepartureWindow {
  /** 建议出门窗口起点（秒） */
  start: number
  /** 建议出门窗口终点（秒） */
  end: number
}

export interface ArriveByResult {
  ok: boolean
  reason?: string
  /** 理论最晚出门（可压线到达） */
  latest: JourneyCandidate | null
  /** 扣除步行不确定性后的推荐出门 */
  recommended: JourneyCandidate | null
  window: DepartureWindow | null
  risk: RiskLevel
  riskNote: string
  /** 按到达时间排序的备选方案（含 latest / recommended 去重后） */
  alternatives: JourneyCandidate[]
  /** 最早到达方案，用于对比解说 */
  earliest: JourneyCandidate | null
  warnings: string[]
  diagnostics: {
    evaluations: number
    searchSpanSec: number
    latestFeasible: boolean
  }
}

const DEFAULT_MAX_SEARCH = 4 * 3600
const DEFAULT_WINDOW = 120

function planOptions(opt: ArriveByOptions): PlanOptions {
  return {
    from: opt.from,
    to: opt.to,
    time: '00:00',
    day: opt.day,
    speed: opt.speed,
    bufferSec: opt.door.safetySec,
    sprint: 1,
    analyze: false,
    transferOverrides: opt.transferOverrides
  }
}

function legsOf(it: Itinerary) {
  return it.legs
}

/** 换乘等待合计：相邻两段乘车之间的站台等待 */
export function transferWaitSeconds(it: Itinerary): number {
  let wait = 0
  const legs = legsOf(it)
  for (let i = 0; i + 1 < legs.length; i++) {
    const here = legs[i]
    const next = legs[i + 1]
    if (here.type === 'ride' && next.type === 'walk') {
      const after = legs[i + 2]
      if (after && after.type === 'ride' && next.station === after.from) {
        wait += Math.max(0, after.depart - (here.arrive + next.seconds))
      }
    }
  }
  return wait
}

/** 步行合计（含进出站、换乘步行，不含站台等待） */
export function walkSeconds(it: Itinerary, door: DoorModel): number {
  let walk = door.toPlatformSec + door.fromStationSec
  for (const leg of it.legs) if (leg.type === 'walk') walk += leg.seconds
  return walk
}

function buildCandidate(
  net: Network,
  opt: ArriveByOptions,
  doorExit: number,
  deadlineSec: number,
  analyze: boolean
): JourneyCandidate | null {
  const start = doorExit + opt.door.toPlatformSec + opt.door.safetySec
  const base = planOptions(opt)
  const res = planAtSeconds(net, analyze ? { ...base, analyze: true } : base, start)
  if (!res.ok || !res.normal) return null
  const it = res.normal
  const arrivalDoor = it.arrival + opt.door.fromStationSec
  if (arrivalDoor > deadlineSec) return null
  const firstRide = it.legs.find((l) => l.type === 'ride')
  if (!firstRide) return null
  const boardDepart = firstRide.depart
  const platformArrival = doorExit + opt.door.toPlatformSec
  return {
    doorExit,
    platformArrival,
    boardDepart,
    platformWait: boardDepart - platformArrival,
    arrivalStation: it.arrival,
    arrivalDoor,
    duration: arrivalDoor - doorExit,
    slack: Number.isFinite(deadlineSec) ? deadlineSec - arrivalDoor : 0,
    transferWait: transferWaitSeconds(it),
    walkSec: walkSeconds(it, opt.door),
    missedDelay: null,
    itinerary: it
  }
}

function signature(c: JourneyCandidate): string {
  return c.itinerary.legs
    .map((l) => (l.type === 'ride' ? `r${l.trip}` : `w${l.station}:${l.fromLine}>${l.toLine}`))
    .join('|')
}

function dominant(a: JourneyCandidate, b: JourneyCandidate): boolean {
  const noWorse =
    a.arrivalDoor <= b.arrivalDoor &&
    a.doorExit >= b.doorExit &&
    a.platformWait + a.transferWait <= b.platformWait + b.transferWait
  const better =
    a.arrivalDoor < b.arrivalDoor ||
    a.doorExit > b.doorExit ||
    a.platformWait + a.transferWait < b.platformWait + b.transferWait
  return noWorse && better
}

/** 去掉被支配与重复的方案；保留到达时间排序 */
export function paretoFilter(cands: JourneyCandidate[]): JourneyCandidate[] {
  const seen = new Set<string>()
  const unique: JourneyCandidate[] = []
  for (const c of cands) {
    const key = `${signature(c)}@${Math.round(c.doorExit / 60)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(c)
  }
  return unique
    .filter((c) => !unique.some((o) => o !== c && dominant(o, c)))
    .sort((a, b) => a.arrivalDoor - b.arrivalDoor || b.doorExit - a.doorExit)
}

/** 首乘线路/方向在 origin 的下一班发车时刻 */
function nextDeparture(net: Network, day: number, station: number, tripId: number): number | null {
  const trip = net.tripsById[tripId]
  if (!trip) return null
  const occs = net.occByDay[day].get(`${trip.line}:${trip.dir}:${station}`)
  if (!occs) return null
  let best: number | null = null
  for (const occ of occs) {
    if (occ.trip === tripId) continue
    const t = net.tripsById[occ.trip].stops[occ.pos].minute * 60
    const mine = trip.stops.find((s) => s.station === station)?.minute
    if (mine === undefined || t <= mine * 60) continue
    if (best === null || t < best) best = t
  }
  return best
}

function annotateMissed(
  net: Network,
  opt: ArriveByOptions,
  c: JourneyCandidate,
  deadlineSec: number
): void {
  const first = c.itinerary.legs.find((l) => l.type === 'ride')
  if (!first) return
  const day = opt.day === 'weekday' ? 0 : 1
  const next = nextDeparture(net, day, first.from, first.trip)
  if (next === null) {
    c.missedDelay = null
    return
  }
  const later = buildCandidate(
    net,
    opt,
    next - opt.door.toPlatformSec - opt.door.safetySec - 1,
    Number.POSITIVE_INFINITY,
    false
  )
  c.missedDelay = later ? later.arrivalDoor - c.arrivalDoor : null
}

export interface CandidateSelection {
  earliest: JourneyCandidate | null
  latest: JourneyCandidate | null
  leastWait: JourneyCandidate | null
  alternatives: JourneyCandidate[]
}

/** 三种目标分别保留，再按到达时间补充有明显区别的备选 */
export function pickCandidates(cands: JourneyCandidate[], maxCand = 5): CandidateSelection {
  const pool = paretoFilter(cands)
  const earliest =
    [...cands].sort((a, b) => a.arrivalDoor - b.arrivalDoor || a.doorExit - b.doorExit)[0] ?? null
  const latest =
    [...cands].sort((a, b) => b.doorExit - a.doorExit || a.arrivalDoor - b.arrivalDoor)[0] ?? null
  const leastWait =
    [...cands].sort(
      (a, b) =>
        a.platformWait + a.transferWait - (b.platformWait + b.transferWait) ||
        b.doorExit - a.doorExit
    )[0] ?? null

  const picked: JourneyCandidate[] = []
  const push = (c: JourneyCandidate | null | undefined, label: JourneyCandidate['label']) => {
    if (!c || picked.length >= maxCand) return
    if (picked.some((p) => p === c || (signature(p) === signature(c) && p.doorExit === c.doorExit)))
      return
    c.label = label
    picked.push(c)
  }
  push(earliest, 'earliest')
  push(latest, 'latest')
  push(leastWait, 'least-wait')
  for (const c of pool) push(c, 'alternative')

  return {
    earliest,
    latest,
    leastWait,
    alternatives: picked.sort((a, b) => a.arrivalDoor - b.arrivalDoor || b.doorExit - a.doorExit)
  }
}

export interface DepartSearchOptions {
  from: string
  to: string
  /** HH:MM 出发时间 */
  start: string
  day: DayType
  door: DoorModel
  speed: number
  sprint?: number
  transferOverrides?: TransferOverride[]
  /** 搜索窗口，默认 30 分钟 */
  windowSec?: number
  maxCandidates?: number
}

/** 出发时间窗口内各方案（门到门模型不变，不设截止时间） */
export interface DepartSearchResult {
  ok: boolean
  reason?: string
  candidates: JourneyCandidate[]
  earliest: JourneyCandidate | null
  latest: JourneyCandidate | null
  leastWait: JourneyCandidate | null
  warnings: string[]
}

export function searchDepartures(net: Network, opt: DepartSearchOptions): DepartSearchResult {
  const warnings: string[] = []
  const startSec = parseClock(opt.start) * 60
  const windowSec = opt.windowSec ?? 1800
  const asArrive: ArriveByOptions = {
    from: opt.from,
    to: opt.to,
    deadline: opt.start,
    day: opt.day,
    door: opt.door,
    speed: opt.speed,
    sprint: opt.sprint,
    transferOverrides: opt.transferOverrides
  }
  const fromIdx = net.stationIndex.get(opt.from) ?? -1
  const day = opt.day === 'weekday' ? 0 : 1
  if (fromIdx < 0) {
    return { ok: false, reason: '出发站不在数据覆盖范围内。', candidates: [], earliest: null, latest: null, leastWait: null, warnings }
  }
  const boarded = new Set<string>()
  const cands: JourneyCandidate[] = []
  const minBoard = startSec + opt.door.toPlatformSec + opt.door.safetySec
  const maxBoard = minBoard + windowSec
  for (const line of net.lineAt[fromIdx] ?? []) {
    for (let dir = 0; dir < net.lines[line].directions.length; dir++) {
      const occs = net.occByDay[day].get(`${line}:${dir}:${fromIdx}`)
      if (!occs) continue
      for (const occ of occs) {
        const depart = net.tripsById[occ.trip].stops[occ.pos].minute * 60
        if (depart < minBoard || depart > maxBoard) continue
        const t = depart - opt.door.toPlatformSec - opt.door.safetySec - 1
        if (boarded.has(`${t}`)) continue
        const c = buildCandidate(net, asArrive, t, Number.POSITIVE_INFINITY, false)
        if (!c || Math.abs(c.boardDepart - depart) >= 1) continue
        boarded.add(`${t}`)
        cands.push(c)
      }
    }
  }
  if (!cands.length) {
    return { ok: false, reason: `未来 ${Math.round(windowSec / 60)} 分钟内没有可用班次。`, candidates: [], earliest: null, latest: null, leastWait: null, warnings }
  }
  const sel = pickCandidates(cands, opt.maxCandidates ?? 5)
  for (const c of sel.alternatives) annotateMissed(net, asArrive, c, Number.POSITIVE_INFINITY)
  return { ok: true, candidates: sel.alternatives, earliest: sel.earliest, latest: sel.latest, leastWait: sel.leastWait, warnings }
}

function riskOf(
  recommendedSlack: number,
  latestSlack: number,
  jitter: number
): { risk: RiskLevel; note: string } {
  const slack = recommendedSlack
  const tightLatest =
    latestSlack < 60
      ? `理论最晚出门会压线到达（余量不足 1 分钟），已按 ${Math.round(jitter / 60)} 分钟步行不确定性提前推荐。`
      : ''
  if (slack >= 300) {
    return { risk: 'safe', note: `推荐方案到达后仍有 ${Math.round(slack / 60)} 分钟余量。${tightLatest}` }
  }
  if (slack >= 120) {
    return {
      risk: 'tight',
      note: `到达后仅余 ${Math.round(slack / 60)} 分钟，可行但不宽裕。${tightLatest}`
    }
  }
  return {
    risk: 'risky',
    note: `推荐方案到达余量不足 2 分钟，无法覆盖步行不确定性；建议提前出门或调整截止时间。${tightLatest}`
  }
}

/**
 * 按到达时间规划。
 *
 * 正确性优先：以「离家时刻」为变量做二分（到达时刻随离家时刻单调不减，等待只会更差），
 * 每次判定调用一次 `planAtSeconds`，评估次数为 O(log 搜索窗口)，不做逐分钟暴力枚举。
 * 截止时间约束的是「站台到达 + 出站步行」后的最终目的地时刻，而不是列车终点。
 */
export function planArriveBy(net: Network, opt: ArriveByOptions): ArriveByResult {
  const deadlineSec = parseClock(opt.deadline) * 60
  const maxSearch = opt.maxSearchSec ?? DEFAULT_MAX_SEARCH
  const windowSec = opt.windowSec ?? DEFAULT_WINDOW
  const warnings: string[] = []
  let evaluations = 0

  const door = opt.door
  const lower = Math.max(0, deadlineSec - maxSearch)
  const diag = { evaluations: 0, searchSpanSec: 0, latestFeasible: false }

  if (net.stationIndex.get(opt.from) === net.stationIndex.get(opt.to)) {
    return failed('出发站与目的站相同，无需乘车。')
  }

  const evaluate = (t: number, limitSec: number): JourneyCandidate | null => {
    evaluations += 1
    return buildCandidate(net, opt, t, limitSec, false)
  }

  /**
   * 在 [lower, upper] 中找「到达时刻不晚于 limitSec」的最晚离家时刻。
   * 到达时刻随离家时刻单调不减（等待只会更差），因此可行集合是前缀，可二分。
   */
  function latestFeasible(limitSec: number): number | null {
    const upper = limitSec - door.fromStationSec - door.toPlatformSec - door.safetySec
    if (upper < lower) return null
    if (evaluate(upper, limitSec)) return upper
    if (!evaluate(lower, limitSec)) return null
    let lo = lower
    let hi = upper
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (evaluate(mid, limitSec)) lo = mid
      else hi = mid
    }
    return lo
  }

  const latestT = latestFeasible(deadlineSec)
  if (latestT === null) {
    return failed(
      `在 ${Math.round(maxSearch / 3600)} 小时搜索窗口内没有能在截止时间前到达的班次（可能已过末班车或数据未覆盖该方向）。`
    )
  }
  diag.latestFeasible = true

  // 推荐出门：把步行不确定性作为到达余量，绝不让推荐方案压线
  const jitter = door.walkJitterSec
  const recT = jitter > 0 ? (latestFeasible(deadlineSec - jitter) ?? latestT) : latestT

  return finish(latestT, recT)

  function failed(reason: string): ArriveByResult {
    diag.evaluations = evaluations
    return {
      ok: false,
      reason,
      latest: null,
      recommended: null,
      window: null,
      risk: 'risky',
      riskNote: '',
      alternatives: [],
      earliest: null,
      warnings,
      diagnostics: diag
    }
  }

  function finish(latestDoorExit: number, recDoor: number): ArriveByResult {
    const latest = buildCandidate(net, opt, latestDoorExit, deadlineSec, true)
    const recommended = buildCandidate(net, opt, recDoor, deadlineSec, true) ?? latest
    if (!latest || !recommended) return failed('截止时间附近没有可用的完整行程。')

    const win: DepartureWindow = {
      start: Math.max(lower, recommended.doorExit - windowSec),
      end: recommended.doorExit
    }
    const risk = riskOf(recommended.slack, latest.slack, jitter)

    const day = opt.day === 'weekday' ? 0 : 1
    const cands: JourneyCandidate[] = [latest, recommended]
    const fromIdx = net.stationIndex.get(opt.from) ?? -1
    const searchStart = Math.max(lower, recDoor - (opt.searchWindowSec ?? 1800))
    const minBoard = searchStart + door.toPlatformSec + door.safetySec
    const maxBoard = win.end + door.toPlatformSec + door.safetySec
    for (const line of net.lineAt[fromIdx] ?? []) {
      for (let dir = 0; dir < net.lines[line].directions.length; dir++) {
        const occs = net.occByDay[day].get(`${line}:${dir}:${fromIdx}`)
        if (!occs) continue
        for (const occ of occs) {
          const depart = net.tripsById[occ.trip].stops[occ.pos].minute * 60
          if (depart < minBoard || depart > maxBoard) continue
          // 严格早于发车 1 秒，保证能上这一班（路由器要求 depart > 开始时刻）
          const t = depart - door.toPlatformSec - door.safetySec - 1
          const c = evaluate(t, deadlineSec)
          if (c && Math.abs(c.boardDepart - depart) < 1) cands.push(c)
        }
      }
    }

    const sel = pickCandidates(cands, opt.maxCandidates ?? 5)
    for (const c of sel.alternatives) annotateMissed(net, opt, c, deadlineSec)

    diag.evaluations = evaluations
    diag.searchSpanSec = deadlineSec - lower
    return {
      ok: true,
      latest,
      recommended,
      window: win,
      risk: risk.risk,
      riskNote: risk.note,
      alternatives: sel.alternatives,
      earliest: sel.earliest,
      warnings,
      diagnostics: diag
    }
  }
}

/** 评估「某个离家时刻」对应的行程；不可行返回 null。用于对比与时间图。 */
export function evaluateDoorExit(
  net: Network,
  opt: ArriveByOptions,
  doorExitSec: number
): JourneyCandidate | null {
  return buildCandidate(net, opt, doorExitSec, parseClock(opt.deadline) * 60, true)
}
