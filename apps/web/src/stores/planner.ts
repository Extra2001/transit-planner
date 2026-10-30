import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  network,
  plan,
  type DayType,
  type PlanResult
} from '@transit/core'

function defaultDay(): DayType {
  const d = new Date().getDay()
  return d === 0 || d === 6 ? 'weekend' : 'weekday'
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

  const stations = computed(() =>
    [...network.stations].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  )

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

  function linesAtIdx(idx: number) {
    return network.lineAt[idx].map((i) => network.lines[i])
  }

  function stationName(idx: number) {
    return network.stations[idx]
  }

  function swap() {
    const t = from.value
    from.value = to.value
    to.value = t
    run()
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
        minSaveSec: 90
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
    stations,
    speedLabel,
    linesAt,
    linesAtIdx,
    stationName,
    swap,
    run
  }
})
