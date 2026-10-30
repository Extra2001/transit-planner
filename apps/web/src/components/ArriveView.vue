<script setup lang="ts">
import { computed } from 'vue'
import {
  formatClock,
  formatDuration,
  type ArriveByResult,
  type JourneyCandidate,
  type Leg
} from '@transit/core'
import { usePlannerStore } from '../stores/planner'

const props = defineProps<{
  result: ArriveByResult
  candidate: JourneyCandidate | null
  dayLabel: string
  deadline: string
}>()

const store = usePlannerStore()

function clock(sec: number): string {
  const c = formatClock(sec)
  return c.nextDay ? `次日 ${c.text}` : c.text
}

function minutes(sec: number): string {
  return `${Math.round(sec / 60)} 分钟`
}

const c = computed(() => props.candidate)

const latest = computed(() => props.result.latest)
const earliest = computed(() => props.result.earliest)
const window = computed(() => props.result.window)
const riskLabel = computed(
  () => ({ safe: '余量充足', tight: '余量偏紧', risky: '压线方案' })[props.result.risk]
)

const labelText: Record<string, string> = {
  earliest: '最早到达',
  latest: '最晚出门',
  'least-wait': '等待最少',
  alternative: '备选'
}

function lineName(idx: number): string {
  return store.activeNetwork?.lines[idx]?.name ?? ''
}

function lineShort(idx: number): string {
  return store.activeNetwork?.lines[idx]?.shortName ?? ''
}

function lineColor(idx: number): string {
  return store.activeNetwork?.lines[idx]?.color ?? '#666'
}

function lineTextColor(idx: number): string {
  return store.activeNetwork?.lines[idx]?.textColor ?? '#fff'
}

function station(idx: number): string {
  return store.activeNetwork?.stations[idx] ?? ''
}

/** 把腿序列展开成可读步骤，等待时间夹在上下车之间 */
const steps = computed(() => {
  const cand = c.value
  if (!cand) return []
  const legs = cand.itinerary.legs
  const out: {
    key: string
    kind: string
    at: number
    text: string
    sub?: string
    line?: number
  }[] = []
  out.push({ key: 'door', kind: 'door', at: cand.doorExit, text: '离家出门' })
  out.push({
    key: 'enter',
    kind: 'walk',
    at: cand.platformArrival,
    text: `进站到站台 · ${minutes(cand.platformArrival - cand.doorExit)}`
  })
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    if (leg.type === 'ride') {
      out.push({
        key: `ride-${i}`,
        kind: 'ride',
        at: leg.depart,
        text: `${station(leg.from)} → ${station(leg.to)}`,
        sub: `${clock(leg.depart)} — ${clock(leg.arrive)} · ${minutes(leg.arrive - leg.depart)}`,
        line: leg.line
      })
      continue
    }
    const next = legs[i + 1]
    out.push({
      key: `walk-${i}`,
      kind: 'transfer',
      at: legEnd(legs, i),
      text: `换乘 ${lineName(leg.fromLine)} → ${lineName(leg.toLine)} · 步行 ${minutes(leg.seconds)}`
    })
    if (next && next.type === 'ride') {
      const wait = Math.max(0, next.depart - (legEnd(legs, i) + leg.seconds))
      out.push({
        key: `wait-${i}`,
        kind: 'wait',
        at: legEnd(legs, i) + leg.seconds,
        text: `站台等车 ${minutes(wait)}`,
        sub: `${clock(next.depart)} 发车`
      })
    }
  }
  if (cand.arrivalDoor > cand.arrivalStation) {
    out.push({
      key: 'exit',
      kind: 'walk',
      at: cand.arrivalDoor,
      text: `出站到目的地 · ${minutes(cand.arrivalDoor - cand.arrivalStation)}`
    })
  }
  return out
})

function legEnd(legs: Leg[], i: number): number {
  for (let k = i - 1; k >= 0; k--) {
    const l = legs[k]
    if (l.type === 'ride') return l.arrive
  }
  return 0
}

/** 与「最早到达」方案对比：推荐方案能晚出门多少、代价是晚到多少 */
const comparison = computed(() => {
  const e = earliest.value
  const cand = c.value
  if (!e || !cand) return null
  const doorGain = cand.doorExit - e.doorExit
  const arrivalDiff = cand.arrivalDoor - e.arrivalDoor
  const waitSaved =
    e.platformWait + e.transferWait - (cand.platformWait + cand.transferWait)
  const waitE = e.platformWait + e.transferWait
  const waitC = cand.platformWait + cand.transferWait
  return {
    doorGain,
    arrivalDiff,
    waitSaved,
    text:
      `最早方案 ${clock(e.doorExit)} 出门（等 ${minutes(waitE)}）${clock(e.arrivalDoor)} 到；` +
      `当前方案 ${clock(cand.doorExit)} 出门（等 ${minutes(waitC)}）${clock(cand.arrivalDoor)} 到。` +
      (arrivalDiff <= 0
        ? `晚 ${minutes(doorGain)}出门，到达相同或更早。`
        : `晚 ${minutes(doorGain)}出门，到达晚 ${minutes(arrivalDiff)}。`)
  }
})

const transferCount = computed(() => c.value?.itinerary.transfers.length ?? 0)
const walkText = computed(() => {
  const cand = c.value
  if (!cand) return ''
  const walk = cand.itinerary.legs
    .filter((l) => l.type === 'walk')
    .reduce((sum, l) => sum + (l.type === 'walk' ? l.seconds : 0), 0)
  return minutes(walk)
})

const slackText = computed(() => {
  const cand = c.value
  if (!cand) return ''
  return minutes(cand.slack)
})
</script>

<template>
  <section v-if="result.ok && c" class="card plan-card arrive-card">
    <div class="summary">
      <div class="summary-main">
        <div class="eyebrow">{{ dayLabel }} · {{ deadline }} 前到达</div>
        <div class="arrival">
          <span class="arrival-time">{{ clock(c.doorExit) }}</span>
          <span class="nextday">出门</span>
        </div>
        <div class="summary-sub">
          {{ clock(c.arrivalDoor) }} 到达 · 全程 {{ formatDuration(c.duration) }} · 换乘
          {{ transferCount }} 次 · 步行 {{ walkText }} · 等待
          {{ minutes(c.platformWait + c.transferWait) }} · 余量 {{ minutes(c.slack) }}
        </div>
      </div>
      <div class="summary-badge" :class="result.risk">{{ riskLabel }}</div>
    </div>

    <div class="advice" :class="result.risk === 'risky' ? 'advice-muted' : 'advice-good'">
      <strong>建议 {{ clock(result.recommended!.doorExit) }} 出门</strong>
      <span>
        最晚 {{ clock(latest!.doorExit) }}{{ latest!.slack < 60 ? '（压线）' : '' }}，建议窗口
        {{ clock(window!.start) }}–{{ clock(window!.end) }}，按推荐时间到达余量 {{ slackText }}。
      </span>
    </div>

    <div v-if="comparison" class="advice advice-muted">
      <strong>与最早方案相比</strong>
      <span>{{ comparison.text }}</span>
    </div>

    <div v-if="c.missedDelay" class="advice advice-muted">
      <strong>错过这班</strong>
      <span>下一班将晚到 {{ minutes(c.missedDelay) }}。</span>
    </div>

    <div class="tabs" v-if="result.alternatives.length > 1">
      <button
        v-for="alt in result.alternatives"
        :key="alt.doorExit + '-' + alt.boardDepart"
        type="button"
        :class="{ active: alt === c }"
        @click="store.selectCandidate(alt)"
      >
        {{ labelText[alt.label ?? 'alternative'] }} · {{ clock(alt.doorExit) }}
      </button>
    </div>

    <ol class="timeline">
      <li v-for="step in steps" :key="step.key" class="leg" :class="step.kind">
        <div class="ride-head">
          <span class="ride-time">{{ clock(step.at) }}</span>
          <span
            v-if="step.line !== undefined"
            class="line-badge"
            :style="{ background: lineColor(step.line), color: lineTextColor(step.line) }"
          >
            {{ lineShort(step.line) }}
          </span>
          <span class="ride-dir">{{ step.text }}</span>
        </div>
        <div v-if="step.sub" class="walk-sub">{{ step.sub }}</div>
      </li>
    </ol>

    <div v-if="result.riskNote && result.risk !== 'safe'" class="inline-warn">
      <p>{{ result.riskNote }}</p>
    </div>
    <p class="plan-foot">
      门到门含家到站台 {{ store.toPlatformMin }} 分钟、出站到目的地 {{ store.fromStationMin }} 分钟、
      安全余量 {{ store.bufferSec }} 秒；站台等待与换乘等待已分开计算。计划时刻，不预测实时延误。
    </p>
  </section>

  <section v-else-if="!result.ok" class="card error-card">
    <h2>没有可行方案</h2>
    <p>{{ result.reason }}</p>
    <p class="muted">可以尝试推迟截止时间、提前出门，或调整门到门耗时。</p>
  </section>
</template>
