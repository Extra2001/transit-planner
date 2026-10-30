import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { plan, type DayType, type Network, type PlanResult, type TransferOverride } from '@transit/core'
import { cities, defaultCity, getCity } from '../cities/registry'
import {
  CityDataUnavailable,
  cacheCityOffline,
  isCityCached,
  loadCityNetwork,
  loadCityStatus,
  probeCity,
  type CityStatusFile
} from '../cities/loader'

const STORAGE_KEY = 'transit-planner.overrides.v1'
const CITY_KEY = 'transit-planner.city.v1'

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

function savedCityId(): string | null {
  try {
    return localStorage.getItem(CITY_KEY)
  } catch {
    return null
  }
}

export const usePlannerStore = defineStore('planner', () => {
  const initialId = (() => {
    const saved = savedCityId()
    return saved && getCity(saved) ? saved : defaultCity().id
  })()

  const city = ref(initialId)
  const network = shallowRef<Network | null>(null)
  const cityStatus = ref<CityStatusFile | null>(null)
  const availability = ref<Record<string, boolean>>({})
  const offlineCached = ref(false)
  const ready = ref(false)
  const loading = ref(false)
  const loadError = ref('')

  const from = ref('')
  const to = ref('')
  const time = ref('08:00')
  const day = ref<DayType>(defaultDay())
  const speed = ref(1)
  const bufferSec = ref(30)
  const sprint = 1.35

  const result = ref<PlanResult | null>(null)
  const error = ref('')
  const computing = ref(false)
  const overrides = ref<TransferOverride[]>(loadOverrides())

  const activeManifest = computed(() => getCity(city.value) ?? defaultCity())
  const cityOptions = computed(() =>
    cities.map((c) => ({
      id: c.id,
      label: c.shortName,
      available: availability.value[c.id] !== false
    }))
  )
  const activeNetwork = computed(() => network.value)
  const lines = computed(() => network.value?.lines ?? [])
  const counts = computed(() => network.value?.data.meta.counts ?? {})
  const stations = computed(() =>
    network.value
      ? [...network.value.stations].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
      : []
  )
  const reviewLines = computed(() => lines.value.filter((l) => l.status === 'review'))
  const supportedLines = computed(() => lines.value.filter((l) => l.status === 'supported'))
  const cityLabel = computed(() => activeManifest.value.name)
  const tripUnit = computed(() => {
    const manifest = activeManifest.value
    if (manifest.ui?.tripUnit) return manifest.ui.tripUnit
    return cityStatus.value?.counts.fullLengthTrips !== undefined ? '条已确认区段' : '班'
  })
  const sourceLabel = computed(() => activeManifest.value.ui?.sourceLabel ?? '采集')
  const speedLabel = computed(() => {
    if (speed.value <= 0.9) return '偏慢'
    if (speed.value <= 0.98) return '略慢'
    if (speed.value < 1.08) return '正常'
    if (speed.value < 1.2) return '偏快'
    return '很快'
  })

  function linesAt(name: string) {
    const net = network.value
    if (!net) return []
    const idx = net.stationIndex.get(name)
    if (idx === undefined) return []
    return net.lineAt[idx].map((i) => net.lines[i])
  }

  function stationName(idx: number) {
    return network.value?.stations[idx] ?? ''
  }

  function persistCity(id: string) {
    try {
      localStorage.setItem(CITY_KEY, id)
    } catch {
      /* ignore */
    }
  }

  function applyDefaults() {
    const d = activeManifest.value.defaults
    from.value = d.from
    to.value = d.to
    time.value = d.time || '08:00'
    result.value = null
  }

  async function activate(id: string) {
    const manifest = getCity(id)
    if (!manifest) return
    if (availability.value[id] === false) {
      loadError.value = `${manifest.name}的数据未随本次发布分发（许可未确认），可查看项目文档在本地启用。`
      return
    }
    loading.value = true
    loadError.value = ''
    try {
      const [net, status] = await Promise.all([
        loadCityNetwork(manifest),
        loadCityStatus(manifest)
      ])
      network.value = net
      cityStatus.value = status
      city.value = id
      persistCity(id)
      applyDefaults()
      ready.value = true
      offlineCached.value = await isCityCached(manifest)
      run()
    } catch (e) {
      ready.value = false
      network.value = null
      loadError.value =
        e instanceof CityDataUnavailable ? e.message : e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function init() {
    loading.value = true
    const probes = await Promise.all(cities.map(async (c) => [c.id, await probeCity(c)] as const))
    availability.value = Object.fromEntries(probes)
    const manifest = activeManifest.value
    if (availability.value[manifest.id] === false) {
      const fallback = cities.find((c) => availability.value[c.id])
      if (fallback) {
        await activate(fallback.id)
        loadError.value = `${manifest.name}的数据未随本次发布分发，已切换到 ${fallback.shortName}。`
        return
      }
    }
    await activate(manifest.id)
  }

  async function setCity(id: string) {
    if (id === city.value && ready.value) return
    await activate(id)
  }

  async function downloadOffline() {
    const ok = await cacheCityOffline(activeManifest.value)
    offlineCached.value = ok
    return ok
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
    const net = network.value
    if (!net) return
    if (!from.value || !to.value) {
      error.value = '请选择出发站和目的站'
      result.value = null
      return
    }
    computing.value = true
    error.value = ''
    try {
      result.value = plan(net, {
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
    activeManifest,
    activeNetwork,
    cityStatus,
    ready,
    loading,
    loadError,
    offlineCached,
    tripUnit,
    sourceLabel,
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
    run,
    init,
    downloadOffline
  }
})
