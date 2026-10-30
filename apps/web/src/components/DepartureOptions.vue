<script setup lang="ts">
import { computed } from 'vue'
import { formatClock, type DepartSearchResult, type JourneyCandidate } from '@transit/core'

const props = defineProps<{
  result: DepartSearchResult
}>()

const label: Record<string, string> = {
  earliest: '最早到达',
  latest: '最晚出门',
  'least-wait': '等待最少',
  alternative: '备选'
}

function clock(sec: number): string {
  const c = formatClock(sec)
  return c.nextDay ? `次日 ${c.text}` : c.text
}

function minutes(sec: number): string {
  return `${Math.round(sec / 60)} 分钟`
}

const rows = computed<JourneyCandidate[]>(() =>
  [...props.result.candidates].sort((a, b) => a.doorExit - b.doorExit)
)

const hint = computed(() => {
  const e = props.result.earliest
  const l = props.result.latest
  if (!e || !l || e === l) return ''
  const doorGain = l.doorExit - e.doorExit
  const waitSaved = e.platformWait + e.transferWait - (l.platformWait + l.transferWait)
  if (doorGain < 60) return ''
  const saved = waitSaved >= 60 ? `站台少等 ${minutes(waitSaved)}，` : ''
  return `晚 ${minutes(doorGain)}出门，${saved}到达晚 ${minutes(l.arrivalDoor - e.arrivalDoor)}。`
})
</script>

<template>
  <section v-if="result.ok" class="card options-card">
    <h2 class="options-title">未来 30 分钟 · 值得出门的方案</h2>
    <p v-if="hint" class="hint">{{ hint }}</p>
    <ul class="options-list">
      <li v-for="c in rows" :key="c.doorExit">
        <span class="opt-label">{{ label[c.label ?? 'alternative'] }}</span>
        <span class="opt-door">{{ clock(c.doorExit) }} 出门</span>
        <span class="opt-arrive">{{ clock(c.arrivalDoor) }} 到</span>
        <span class="opt-wait">等 {{ minutes(c.platformWait + c.transferWait) }}</span>
        <span class="opt-total">全程 {{ minutes(c.duration) }}</span>
      </li>
    </ul>
    <p class="plan-foot">
      「出门」已含家到站台与安全余量；计划时刻，不预测实时延误。
    </p>
  </section>
</template>
