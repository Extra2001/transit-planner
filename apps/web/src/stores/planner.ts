import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createNetwork,
  network as beijingNetwork,
  plan,
  type DayType,
  type NetworkData,
  type PlanResult,
  type TransferOverride
} from '@transit/core'
import changchunData from '../data/changchun-network.json'
import changchunStatus from '../data/changchun-status.json'

type City = 'beijing' | 'changchun'

const STORAGE_KEY = 'transit-planner.overrides.v1'
const CITY_KEY = 'transit-planner.city.v1'

const changchunNetwork = createNetwork(changchunData as unknown as NetworkData)
const networks = { beijing: beijingNetwork, changchun: changchunNetwork }

function defaultDay(): DayType {
  const d = new Date().getDay()
  return d === 0 || d === 6 ? 'weekend' : 'weekday'
}

function loadOverrides(): TransferOverride[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (o) =>
        o &&
        typeof o.station === 'string' &&
        typeof o.fromLine === 'string' &&
        typeof o.toLine === 'string' &&
        typeof o.seconds === 'number' &&
        o.seconds >= 0
    )
  } catch {
    return []
  }
}

function defaultEndpoints(city: City): { from: string; to: string } {
  if (city === 'beijing') return { from: '西直门', to: '东单' }
  const names = changchunNetwork.stations
  if (!names.length) return { from: '', to: '' }
  const from = names.find((n) => n.includes('长春站')) ?? names[0]
  const to = names.find((n) => n.includes('长影世纪城')) ?? names[names.length - 1]
  return { from, to }
}

export const usePlannerStore = defineStore('planner', () => {
  const changchunReady = changchunStatus.status === 'ready'
  let savedCity: City = 'beijing'
  try {
    const raw = localStorage.getItem(CITY_KEY)
    if (raw === 'changchun' && changchunReady) savedCity = 'changchun'
  } catch {
    /* ignore */
  }

  const city = ref<City>(savedCity)
  const initial = defaultEndpoints(savedCity)
  const from = ref(initial.from)
  const to = ref(initial.to)
  const time = ref('08:00')
  const day = ref<DayType>(defaultDay())
  const speed = ref(1)
  const bufferSec = ref(30)
  const sprint = 1.35

  const result = ref<PlanResult | null>(null)
  const error = ref('')
  const computing = ref(false)
  const overrides = ref<TransferOverride[]>(loadOverrides())

  const activeNetwork = computed(() => networks[city.value])
  const lines = computed(() => activeNetwork.value.lines)
  const counts = computed(() => activeNetwork.value.data.meta.counts)
  const stations = computed(() =>
    [...activeNetwork.value.stations].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  )
  const reviewLines = computed(() => lines.value.filter((l) => l.status === 'review'))
  const supportedLines = computed(() => lines.value.filter((l) => l.status === 'supported'))
  const cityLabel = computed(() => (city.value === 'beijing' ? '北京地铁' : '长春轨道交通'))
  const cityOptions = computed(() =>
    changchunReady
      ? [
          { id: 'beijing' as const, label: '北京' },
          { id: 'changchun' as const, label: '长春' }
        ]
      : [{ id: 'beijing' as const, label: '北京' }]
  )
  const changchunSummary = computed(() => changchunStatus)
  const speedLabel = computed(() => {
    if (speed.value <= 0.9) return '偏慢'
    if (speed.value <= 0.98) return '略慢'
    if (speed.value < 1.08) return '正常'
    if (speed.value < 1.2) return '偏快'
    return '很快'
  })

  function linesAt(name: string) {
    const net = activeNetwork.value
    const idx = net.stationIndex.get(name)
    if (idx === undefined) return []
    return net.lineAt[idx].map((i) => net.lines[i])
  }

  function stationName(idx: number) {
    return activeNetwork.value.stations[idx]
  }

  function setCity(next: City) {
    if (next === 'changchun' && !changchunReady) return
    if (next === city.value) return
    city.value = next
    try {
      localStorage.setItem(CITY_KEY, next)
    } catch {
      /* ignore */
    }
    const d = defaultEndpoints(next)
    from.value = d.from
    to.value = d.to
    result.value = null
    error.value = ''
    run()
  }

  function findOverride(station: string, fromLine: string, toLine: string) {
    return overrides.value.find(
      (o) => o.station === station && o.fromLine === fromLine && o.toLine === toLine
    )
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value))
    } catch {
      /* 本地存储不可用时仅本次会话生效 */
    }
  }

  function saveOverride(station: string, fromLine: string, toLine: string, seconds: number) {
    const value = Math.max(0, Math.min(1800, Math.round(seconds)))
    const idx = overrides.value.findIndex(
      (o) => o.station === station && o.fromLine === fromLine && o.toLine === toLine
    )
    const record: TransferOverride = {
      station,
      fromLine,
      toLine,
      seconds: value,
      note: '我的实测',
      createdAt: new Date().toISOString()
    }
    if (idx >= 0) overrides.value.splice(idx, 1, record)
    else overrides.value.push(record)
    persist()
    run()
  }

  function clearOverride(station: string, fromLine: string, toLine: string) {
    overrides.value = overrides.value.filter(
      (o) => !(o.station === station && o.fromLine === fromLine && o.toLine === toLine)
    )
    persist()
    run()
  }

  function swap() {
    const t = from.value
    from.value = to.value
    to.value = t
  }

  function run() {
    if (!from.value || !to.value) {
      error.value = '请选择出发站和目的站'
      result.value = null
      return
    }
    computing.value = true
    error.value = ''
    try {
      result.value = plan(activeNetwork.value, {
        from: from.value,
        to: to.value,
        time: time.value,
        day: day.value,
        speed: speed.value,
        bufferSec: bufferSec.value,
        sprint,
        minSaveSec: 90,
        transferOverrides: overrides.value
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      result.value = null
    } finally {
      computing.value = false
    }
  }

  return {
    city,
    cityLabel,
    cityOptions,
    changchunReady,
    changchunSummary,
    activeNetwork,
    from,
    to,
    time,
    day,
    speed,
    bufferSec,
    sprint,
    result,
    error,
    computing,
    overrides,
    lines,
    counts,
    stations,
    reviewLines,
    supportedLines,
    speedLabel,
    linesAt,
    stationName,
    findOverride,
    saveOverride,
    clearOverride,
    setCity,
    swap,
    run
  }
})
