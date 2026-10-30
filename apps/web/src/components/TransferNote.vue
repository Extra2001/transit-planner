<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import {
  formatClock,
  formatDuration,
  formatMargin,
  type TransferAdvice
} from '@transit/core'
import { usePlannerStore } from '../stores/planner'

const props = defineProps<{
  note: TransferAdvice
}>()

const store = usePlannerStore()
const editing = ref(false)
const draft = ref(0)

const net = computed(() => store.activeNetwork)
const stationName = computed(() => net.value?.stations[props.note.station] ?? '')
const fromLine = computed(() => net.value?.lines[props.note.fromLine])
const toLine = computed(() => net.value?.lines[props.note.toLine])
const override = computed(() =>
  fromLine.value && toLine.value
    ? store.findOverride(stationName.value, fromLine.value.id, toLine.value.id)
    : undefined
)

const sourceLabel = computed(() => {
  if (props.note.source === 'user') return '我的实测'
  if (props.note.source === 'official') return '官方数据'
  if (props.note.source === 'predicted') return '个性化预测'
  return '整理估计'
})

const confidenceLabel = computed(() => {
  if (props.note.confidence === 'high') return '高'
  if (props.note.confidence === 'medium') return '中'
  return '低'
})

const margin = computed(() => formatMargin(props.note.marginSeconds))

function clock(sec: number): string {
  return formatClock(sec).text
}

function startEdit() {
  draft.value = Math.round(props.note.baseSeconds)
  editing.value = true
  nextTick(() => {
    const el = document.querySelector<HTMLInputElement>('.tn-actions input')
    el?.focus()
    el?.select()
  })
}

function save() {
  if (!Number.isFinite(draft.value) || !fromLine.value || !toLine.value) return
  draft.value = Math.max(0, Math.min(1800, Math.round(draft.value)))
  store.saveOverride(stationName.value, fromLine.value.id, toLine.value.id, draft.value)
  editing.value = false
}

function clear() {
  if (!fromLine.value || !toLine.value) return
  store.clearOverride(stationName.value, fromLine.value.id, toLine.value.id)
  editing.value = false
}
</script>

<template>
  <div class="transfer-note">
    <div class="tn-head">
      <span>基础步行</span>
      <strong>{{ formatDuration(note.baseSeconds) }}</strong>
    </div>
    <div class="tn-meta">
      <span class="src-tag" :class="{ user: note.source === 'user', official: note.source === 'official' }">
        {{ sourceLabel }}
      </span>
      <span>可信度 {{ confidenceLabel }}</span>
      <span v-if="note.directionDependent">含方向变体，取保守值</span>
      <span v-else-if="note.variantCount > 1">{{ note.variantCount }} 个变体</span>
    </div>

    <div v-if="note.risk" class="tn-risk">{{ note.risk }}</div>

    <div class="tn-row tn-margin">
      <span>走完后的余量</span>
      <strong>{{ margin }}</strong>
    </div>
    <div v-if="note.sprintCatch" class="tn-row tn-good">
      <span class="tn-label">冲刺可赶</span>
      <span>
        {{ clock(note.sprintCatch.depart) }} 的前一班，全程早
        {{ formatDuration(note.sprintCatch.gainSeconds) }}
      </span>
    </div>
    <div v-if="note.nextTrain" class="tn-row">
      <span class="tn-label">若没赶上</span>
      <span v-if="note.nextTrain.lossSeconds > 0">
        下一班 {{ clock(note.nextTrain.depart) }}，预计晚
        {{ formatDuration(note.nextTrain.lossSeconds) }}
      </span>
      <span v-else>下一班 {{ clock(note.nextTrain.depart) }}，后续仍有缓冲，预计不影响到达</span>
    </div>
    <div v-if="!note.sprintCatch && !note.nextTrain" class="tn-row tn-muted">
      暂无前后班次信息
    </div>

    <div class="tn-actions">
      <template v-if="editing">
        <span class="tn-edit-label">我的实测</span>
        <input
          v-model.number="draft"
          type="number"
          min="0"
          max="1800"
          step="5"
          @focus="($event.target as HTMLInputElement).select()"
          inputmode="numeric"
          aria-label="我的换乘步行秒数"
          @keydown.enter.prevent="save"
        />
        <span class="tn-unit">秒</span>
        <button type="button" class="tn-btn primary" @click="save">保存</button>
        <button type="button" class="tn-btn" @click="editing = false">取消</button>
      </template>
      <template v-else>
        <button type="button" class="tn-btn" @click="startEdit">
          {{ override ? '修改我的实测' : '记录我的实测' }}
        </button>
        <button v-if="override" type="button" class="tn-btn danger" @click="clear">清除实测</button>
      </template>
    </div>

    <div class="tn-src">
      基础 {{ formatDuration(note.baseSeconds) }}（{{ sourceLabel }}）；已按
      {{ store.speed.toFixed(2) }}× 步速折算，另加 {{ store.bufferSec }} 秒安全余量。
    </div>
  </div>
</template>
