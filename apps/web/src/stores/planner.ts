import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  network,
  plan,
  type DayType,
  type PlanResult,
  type TransferOverride
} from '@transit/core'

const STORAGE_KEY = 'transit-planner.overrides.v1'

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

export const usePlannerStore = defineStore('planner', () => {
  const from = ref('西直门')
  const to = ref('东单')
  const time = ref('08:00')
  const day = ref<DayType>(defaultDay())
  const speed = ref(1)
  const bufferSec = ref(30)
  const sprint = 1.35

  const result = ref<PlanResult | null>(null)
  const error = ref('')
  const computing = ref(false)
  const overrides = ref<TransferOverride[]>(loadOverrides())

  const lines = network.lines
  const counts = network.data.meta.counts
  const stations = computed(() =>
    [...network.stations].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  )
  const reviewLines = computed(() => lines.filter((l) => l.status === 'review'))
  const supportedLines = computed(() => lines.filter((l) => l.status === 'supported'))

  const speedLabel = computed(() => {
    if (speed.value <= 0.9) return '偏慢'
    if (speed.value <= 0.98) return '略慢'
    if (speed.value < 1.08) return '正常'
    if (speed.value < 1.2) return '偏快'
    return '很快'
  })

  function linesAt(name: string) {
    const idx = network.stationIndex.get(name)
    if (idx === undefined) return []
    return network.lineAt[idx].map((i) => network.lines[i])
  }

  function stationName(idx: number) {
    return network.stations[idx]
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
      result.value = plan(network, {
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
    swap,
    run
  }
})
