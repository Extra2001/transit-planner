export type DayType = 'weekday' | 'weekend'

export interface DirectionInfo {
  id: string
  name: string
}

export interface LineInfo {
  id: string
  name: string
  shortName: string
  color: string
  directions: DirectionInfo[]
}

export interface TransferRecord {
  s: number
  from: number
  to: number
  /** 步行秒数（整理值，不含安全余量） */
  sec: number
  est?: boolean
  fallback?: boolean
}

export interface InterchangeRecord {
  s: number
  lines: string[]
}

export interface NetworkMeta {
  title: string
  generatedAt: string
  dataUpdatedAt: string
  dataUpdatedNote: string
  source: { name: string; url: string; license: string; upstream: string }
  transferSource: { name: string; url: string; license: string; note: string }
  coverage: string
  stats: Record<string, number>
  warnings: string[]
}

/** trips 元素：[日期类型 0=工作日 1=双休日, 线路下标, 方向下标, [站下标, 分钟, ...]] */
export type RawTrip = [number, number, number, number[]]

export interface NetworkData {
  meta: NetworkMeta
  stations: string[]
  lines: LineInfo[]
  interchanges: InterchangeRecord[]
  transfers: TransferRecord[]
  trips: RawTrip[]
}

export interface TripStop {
  station: number
  /** 服务日 0:00 起的分钟数，可大于 1440 */
  minute: number
}

export interface Trip {
  id: number
  dayType: number
  line: number
  dir: number
  stops: TripStop[]
}

export interface Occurrence {
  trip: number
  pos: number
  minute: number
}

export interface Network {
  data: NetworkData
  lines: LineInfo[]
  stations: string[]
  stationIndex: Map<string, number>
  lineAt: number[][]
  interchange: Set<number>
  transferMap: Map<string, TransferRecord>
  tripsByDay: Trip[][]
  /** 按原始车次 id 索引，跨日期类型共用 */
  tripsById: Trip[]
  occByDay: Map<string, Occurrence[]>[]
}

export interface PlanOptions {
  from: string
  to: string
  /** HH:MM；早于 04:00 视为服务日次日 */
  time: string
  day: DayType
  /** 相对正常步速的倍率，1 为正常 */
  speed: number
  /** 换乘安全余量（秒） */
  bufferSec: number
  /** 冲刺倍率，1 表示不冲刺 */
  sprint: number
  /** 认为“值得跑”的最小全程节省（秒） */
  minSaveSec?: number
  /** 是否分析换乘余量/下一班；批量搜索时可关闭 */
  analyze?: boolean
}

export type Leg =
  | {
      type: 'ride'
      line: number
      dir: number
      from: number
      to: number
      depart: number
      arrive: number
      trip: number
    }
  | {
      type: 'walk'
      station: number
      fromLine: number
      toLine: number
      seconds: number
      baseSeconds: number
      estimated: boolean
      fallback: boolean
    }

export interface TransferAdvice {
  station: number
  fromLine: number
  toLine: number
  walkSeconds: number
  baseSeconds: number
  estimated: boolean
  /** 正常步速下，走完并留足余量后距发车的可支配秒数 */
  marginSeconds: number
  /** 若加快脚步，可赶上的最近一班（车次在该站发车时刻） */
  sprintCatch: {
    depart: number
    arriveAtAlight: number
    /** 若赶上，预计全程提前秒数 */
    gainSeconds: number
  } | null
  /** 若错过当前班，下一班同方向可坐车次 */
  nextTrain: {
    depart: number
    arriveAtAlight: number
    /** 若错过，预计全程晚到秒数 */
    lossSeconds: number
  } | null
}

export interface Itinerary {
  arrival: number
  duration: number
  legs: Leg[]
  transfers: TransferAdvice[]
  warnings: string[]
}

export interface PlanResult {
  ok: boolean
  reason?: string
  normal?: Itinerary
  fast?: Itinerary | null
  savingSeconds: number
  worthRunning: boolean
  minSaveSeconds: number
  summary?: string
  warnings: string[]
}
