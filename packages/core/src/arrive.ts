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
    slack: deadlineSec - arrivalDoor,
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

function riskOf(
  latestSlack: number,
  recommendedSlack: number,
  jitter: number
): { risk: RiskLevel; note: string } {
  const slack = recommendedSlack
  if (latestSlack < jitter) {
    return {
      risk: 'risky',
      note: `理论最晚方案到达余量 ${Math.round(latestSlack / 60)} 分钟，覆盖不了 ${Math.round(jitter / 60)} 分钟步行不确定性，建议改用推荐时间。`
    }
  }
  if (slack < jitter) {
    return {
      risk: 'risky',
      note: `到达余量 ${Math.round(slack / 60)} 分钟小于步行不确定性 ${Math.round(jitter / 60)} 分钟，建议再提前。`
    }
  }
  if (slack >= 300) return { risk: 'safe', note: `到达后仍有 ${Math.round(slack / 60)} 分钟余量。` }
  if (slack >= 120) return { risk: 'tight', note: `仅余 ${Math.round(slack / 60)} 分钟，按计划可行但不宽裕。` }
  return { risk: 'risky', note: `到达余量不足 2 分钟，属于压线方案。` }
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
  const upper = deadlineSec - door.fromStationSec - door.toPlatformSec - door.safetySec
  const lower = Math.max(0, deadlineSec - maxSearch)
  const diag = { evaluations: 0, searchSpanSec: upper - lower, latestFeasible: false }

  if (net.stationIndex.get(opt.from) === net.stationIndex.get(opt.to)) {
    return failed('出发站与目的站相同，无需乘车。')
  }

  const evaluate = (t: number): JourneyCandidate | null => {
    evaluations += 1
    return buildCandidate(net, opt, t, deadlineSec, false)
  }

  if (upper < lower) {
    return failed('截止时间早于门到门所需的最短时间，无法规划。')
  }

  if (!evaluate(upper)) {
    // 上界不可行：二分找最晚可行；若下界也不可行则无解
    if (!evaluate(lower)) {
      return failed(
        `在 ${Math.round(maxSearch / 3600)} 小时搜索窗口内没有能在截止时间前到达的班次（可能已过末班车或数据未覆盖该方向）。`
      )
    }
    let lo = lower
    let hi = upper
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (evaluate(mid)) lo = mid
      else hi = mid
    }
    diag.latestFeasible = true
    return finish(lo)
  }

  diag.latestFeasible = true
  return finish(upper)

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

  function finish(latestDoorExit: number): ArriveByResult {
    const latest = buildCandidate(net, opt, latestDoorExit, deadlineSec, true)
    if (!latest) return failed('截止时间附近没有可用的完整行程。')

    // 推荐出门：扣除步行不确定性，绝不把压线方案当推荐
    const recRaw = latestDoorExit - door.walkJitterSec
    const recDoor = Math.max(lower, recRaw)
    const recommended = buildCandidate(net, opt, recDoor, deadlineSec, true) ?? latest
    const win: DepartureWindow = {
      start: Math.max(lower, recommended.doorExit - windowSec),
      end: recommended.doorExit
    }
    const risk = riskOf(latest.slack, recommended.slack, door.walkJitterSec)

    // 窗口内候选：以真实首乘发车为锚点，避免逐分钟枚举
    const day = opt.day === 'weekday' ? 0 : 1
    const cands: JourneyCandidate[] = [latest, recommended]
    const fromIdx = net.stationIndex.get(opt.from) ?? -1
    const linesAtOrigin = net.lineAt[fromIdx] ?? []
    const minBoard = win.start + door.toPlatformSec + door.safetySec
    const maxBoard = win.end + door.toPlatformSec + door.safetySec
    for (const line of linesAtOrigin) {
      for (let dir = 0; dir < net.lines[line].directions.length; dir++) {
        const occs = net.occByDay[day].get(`${line}:${dir}:${fromIdx}`)
        if (!occs) continue
        for (const occ of occs) {
          const departMin = net.tripsById[occ.trip].stops[occ.pos].minute
          const depart = departMin * 60
          if (depart < minBoard || depart > maxBoard) continue
          // 严格早于发车 1 秒，保证能上这一班（路由器要求 depart > 开始时刻）
          const t = depart - door.toPlatformSec - door.safetySec - 1
          const c = evaluate(t)
          if (c && Math.abs(c.boardDepart - depart) < 1) cands.push(c)
        }
      }
    }

    const filtered = paretoFilter(cands)
    // 目标明确分开：最早到达 / 最晚出门 / 站外等待最少
    const earliest =
      [...cands].sort((a, b) => a.arrivalDoor - b.arrivalDoor || b.doorExit - a.doorExit)[0] ?? null
    const latestPick =
      [...cands].sort((a, b) => b.doorExit - a.doorExit || a.arrivalDoor - b.arrivalDoor)[0] ?? null
    const leastWait =
      [...cands].sort(
        (a, b) =>
          a.platformWait + a.transferWait - (b.platformWait + b.transferWait) ||
          b.doorExit - a.doorExit
      )[0] ?? null

    const maxCand = opt.maxCandidates ?? 5
    const picked: JourneyCandidate[] = []
    const push = (c: JourneyCandidate | null | undefined, label: JourneyCandidate['label']) => {
      if (!c || picked.length >= maxCand) return
      if (picked.some((p) => p === c || (signature(p) === signature(c) && p.doorExit === c.doorExit)))
        return
      c.label = label
      picked.push(c)
    }
    push(earliest, 'earliest')
    push(latestPick, 'latest')
    push(leastWait, 'least-wait')
    for (const c of filtered) push(c, 'alternative')

    for (const c of picked) annotateMissed(net, opt, c, deadlineSec)

    const sorted = picked.sort((a, b) => a.arrivalDoor - b.arrivalDoor || b.doorExit - a.doorExit)

    diag.evaluations = evaluations
    return {
      ok: true,
      latest,
      recommended,
      window: win,
      risk: risk.risk,
      riskNote: risk.note,
      alternatives: sorted,
      earliest,
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
