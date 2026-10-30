export type DayType = 'weekday' | 'weekend'
export type LineStatus = 'supported' | 'review' | 'unsupported'
export type LineMode = 'metro' | 'tram' | 'maglev' | 'airport'
export type TransferSource = 'estimate' | 'official' | 'user' | 'predicted'
export type Confidence = 'high' | 'medium' | 'low'

export interface DirectionInfo {
  id: string
  name: string
  index: number
}

export interface LineSource {
  name: string
  url: string
  license: string
  file: string
}

export interface LineInfo {
  id: string
  name: string
  shortName: string
  color: string
  textColor: string
  mode: LineMode
  loop: boolean
  directions: DirectionInfo[]
  source: LineSource
  /** 该线 BST 文件标注的数据截止日 */
  dataDate: string | null
  /** 汇总 schedule.json 的最后提交日 */
  aggregateDate: string
  confidence: Confidence
  status: LineStatus
  stationCount: number
  bstStationCount: number
  tripCount: number
  passEntries: number
  dwellUnknown: number
  stationGaps: string[]
  extraStations: string[]
  missingAdjacency: string[]
  notes: string[]
}

export interface TransferWindow {
  /** 0=工作日 1=双休日 2=其他 */
  day: number
  start?: number
  end?: number
}

export interface TransferRecord {
  s: number
  from: number
  to: number
  /** 基础步行秒数（不含安全余量） */
  sec: number
  fromDirection?: number
  toDirection?: number
  fromPlatform?: string
  toPlatform?: string
  bestCarriage?: string
  source: TransferSource
  confidence: Confidence
  conditional?: boolean
  windows?: TransferWindow[]
  distance?: number
  stairs?: number
  fallback?: boolean
  note?: string
  /** 对可疑/局部测量条件的说明，不改变原始秒数 */
  caution?: string
}

/** 用户个人实测，覆盖同站同线路对的基础步行时间 */
export interface TransferOverride {
  station: string
  fromLine: string
  toLine: string
  seconds: number
  note?: string
  createdAt?: string
}

export interface InterchangeRecord {
  s: number
  lines: string[]
}

export interface NetworkMeta {
  schemaVersion: number
  title: string
  generatedAt: string
  aggregateUpdatedAt: string
  aggregateUpdatedNote: string
  counts: Record<string, number>
  warnings: string[]
}

/** v2 站点输入：稳定 ID + 显示名 + 别名 + 该站停靠的线路（换乘站多线路站点关系） */
export interface StationInput {
  id?: string
  name: string
  aliases?: string[]
  stops?: { line: string; direction?: string }[]
}

/** 服务日历条目：把「工作日/双休日」提升为可带例外日期的服务 */
export interface ServiceDef {
  id: string
  label: string
  /** 对应车次里的 dayType 0/1 */
  dayType: number
  /** 该服务通常覆盖的星期（1=周一 … 7=周日） */
  days?: number[]
  /** 具体日期覆盖：YYYY-MM-DD → service id */
  exceptions?: Record<string, string>
}

/** trips 元素：[日期类型 0=工作日 1=双休日, 线路下标, 方向下标, [站下标, 分钟, ...]] */
export type RawTrip = [number, number, number, number[]]

export interface NetworkData {
  meta: NetworkMeta
  stations: string[]
  lines: LineInfo[]
  transfers: TransferRecord[]
  trips: RawTrip[]
  /** 城市 id，用于生成稳定站点 ID */
  city?: string
  /** 与 stations 平行的稳定 ID（v1 数据可缺省） */
  stationIds?: string[]
  /** 显示名 → 别名（搜索用，不参与路由） */
  stationAliases?: Record<string, string[]>
  /** 服务日历；缺省时按 dayType 0/1 处理 */
  services?: ServiceDef[]
  /** 车次关联的不确定性说明（例如由相邻站时刻推断、部分区段断开） */
  uncertainty?: {
    associationCoverage?: number
    ambiguousLegs?: number
    legCount?: number
    uncertainPairs?: number
    note?: string
  }
}

export interface TripStop {
  station: number
  /** 服务日 0:00 起的分钟数，可大于 1440 */
  minute: number
  dwellUnknown?: boolean
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
  transferMap: Map<string, TransferRecord[]>
  tripsByDay: Trip[][]
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
  /** 个人实测换乘时间覆盖 */
  transferOverrides?: TransferOverride[]
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
      source: TransferSource
      confidence: Confidence
      directionDependent: boolean
      variantCount: number
      risk?: string
    }

export interface TransferAdvice {
  station: number
  fromLine: number
  toLine: number
  walkSeconds: number
  baseSeconds: number
  source: TransferSource
  confidence: Confidence
  estimated: boolean
  directionDependent: boolean
  variantCount: number
  risk?: string
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
