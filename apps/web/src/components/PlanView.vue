<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  formatClock,
  formatDuration,
  type Itinerary,
  type Leg,
  type PlanResult
} from '@transit/core'
import { usePlannerStore } from '../stores/planner'
import TransferNote from './TransferNote.vue'

const props = defineProps<{
  result: PlanResult
  dayLabel: string
  departTime: string
}>()

const store = usePlannerStore()
const tab = ref<'normal' | 'fast'>('normal')

watch(
  () => props.result,
  () => {
    tab.value = 'normal'
  }
)

const it = computed<Itinerary | null>(() => {
  if (!props.result.ok) return null
  if (tab.value === 'fast' && props.result.fast) return props.result.fast
  return props.result.normal ?? null
})

const normal = computed(() => props.result.normal ?? null)

const transferCount = computed(() => it.value?.transfers.length ?? 0)

const arrival = computed(() => (it.value ? formatClock(it.value.arrival) : null))

const saveText = computed(() => formatDuration(props.result.savingSeconds))

function clock(sec: number): string {
  return formatClock(sec).text
}

function clockWithDay(sec: number): string {
  const c = formatClock(sec)
  return c.nextDay ? `次日 ${c.text}` : c.text
}

function lineName(idx: number): string {
  return store.activeNetwork.lines[idx]?.name ?? ''
}

function lineShort(idx: number): string {
  return store.activeNetwork.lines[idx]?.shortName ?? ''
}

function lineColor(idx: number): string {
  return store.activeNetwork.lines[idx]?.color ?? '#666'
}

function lineTextColor(idx: number): string {
  return store.activeNetwork.lines[idx]?.textColor ?? '#fff'
}

function directionName(line: number, dir: number): string {
  return store.activeNetwork.lines[line]?.directions[dir]?.name ?? ''
}

function station(idx: number): string {
  return store.activeNetwork.stations[idx] ?? ''
}

function noteFor(leg: Leg) {
  if (leg.type !== 'walk') return undefined
  return it.value?.transfers.find(
    (t) => t.station === leg.station && t.fromLine === leg.fromLine && t.toLine === leg.toLine
  )
}

const walkCount = computed(() => it.value?.legs.filter((l) => l.type === 'walk').length ?? 0)
</script>

<template>
  <section v-if="result.ok && normal && it" class="card plan-card">
    <div class="summary">
      <div class="summary-main">
        <div class="eyebrow">{{ dayLabel }} · 计划时刻</div>
        <div class="arrival">
          <span class="arrival-time">{{ arrival?.text }}</span>
          <span v-if="arrival?.nextDay" class="nextday">次日</span>
        </div>
        <div class="summary-sub">
          {{ departTime }} 出发 · 全程 {{ formatDuration(it.duration) }} · 换乘
          {{ transferCount }} 次
        </div>
      </div>
      <div class="summary-badge" :class="{ fast: tab === 'fast' }">
        {{ tab === 'fast' ? '冲刺' : '保守' }}
      </div>
    </div>

    <div
      v-if="result.savingSeconds > 0"
      class="advice"
      :class="result.worthRunning ? 'advice-good' : 'advice-muted'"
    >
      <strong>{{ result.worthRunning ? '值得争取' : '不建议冲刺' }}</strong>
      <span>冲刺 1.35× 可提前 {{ saveText }}到达。</span>
    </div>
    <div v-else class="advice advice-muted">
      <strong>无需赶车</strong>
      <span>正常步速已是当前最早到达。</span>
    </div>

    <div class="tabs" v-if="result.fast">
      <button
        type="button"
        :class="{ active: tab === 'normal' }"
        @click="tab = 'normal'"
      >
        保守 · {{ clock(result.normal!.arrival) }}
      </button>
      <button type="button" :class="{ active: tab === 'fast' }" @click="tab = 'fast'">
        冲刺 · {{ clock(result.fast.arrival) }}
      </button>
    </div>

    <ol class="timeline">
      <li v-for="(leg, i) in it.legs" :key="i" class="leg" :class="leg.type">
        <template v-if="leg.type === 'ride'">
          <div class="ride-head">
            <span class="line-badge" :style="{ background: lineColor(leg.line), color: lineTextColor(leg.line) }">
              {{ lineShort(leg.line) }}
            </span>
            <span class="ride-dir">{{ directionName(leg.line, leg.dir) }}</span>
            <span class="ride-time">{{ clock(leg.depart) }} → {{ clock(leg.arrive) }}</span>
          </div>
          <div class="ride-main">
            <span>{{ station(leg.from) }}</span>
            <span class="arrow">→</span>
            <span>{{ station(leg.to) }}</span>
            <span class="ride-dur">{{ formatDuration(leg.arrive - leg.depart) }}</span>
          </div>
        </template>

        <template v-else>
          <div class="walk-head">
            <span class="walk-icon" aria-hidden="true">↕</span>
            <span>站内换乘</span>
            <span class="walk-time">{{ formatDuration(leg.seconds) }}</span>
            <span v-if="leg.estimated" class="est-tag">估计</span>
          </div>
          <div class="walk-sub">
            {{ lineName(leg.fromLine) }} → {{ lineName(leg.toLine) }} · 已含上车安全余量
          </div>
          <TransferNote v-if="noteFor(leg)" :note="noteFor(leg)!" />
        </template>
      </li>
    </ol>

    <div v-if="it.warnings.length" class="inline-warn">
      <p v-for="w in it.warnings" :key="w">{{ w }}</p>
    </div>

    <details v-if="result.warnings.length" class="warnings">
      <summary>数据提示（{{ result.warnings.length }}）</summary>
      <p v-for="w in result.warnings" :key="w">{{ w }}</p>
    </details>

    <p v-if="walkCount > 0" class="plan-foot">
      共 {{ walkCount }} 段换乘步行；余量为“走完并留足安全余量后，距发车还剩多少”。
    </p>
  </section>

  <section v-else-if="!result.ok" class="card error-card">
    <h2>没有可用方案</h2>
    <p>{{ result.reason }}</p>
    <p class="muted">请尝试调整出发时间、日期类型或起终点。</p>
  </section>
</template>
