<script setup lang="ts">
import { computed } from 'vue'
import {
  formatClock,
  formatDuration,
  formatMargin,
  network,
  type TransferAdvice
} from '@transit/core'

const props = defineProps<{
  note: TransferAdvice
}>()

function clock(sec: number): string {
  return formatClock(sec).text
}

function duration(sec: number): string {
  return formatDuration(sec)
}

const margin = computed(() => formatMargin(props.note.marginSeconds))
</script>

<template>
  <div class="transfer-note">
    <div class="tn-head">
      <span>走完后的余量</span>
      <strong>{{ margin }}</strong>
    </div>
    <div v-if="note.sprintCatch" class="tn-row tn-good">
      <span class="tn-label">冲刺可赶</span>
      <span>
        {{ clock(note.sprintCatch.depart) }} 的前一班，全程早
        {{ duration(note.sprintCatch.gainSeconds) }}
      </span>
    </div>
    <div v-if="note.nextTrain" class="tn-row">
      <span class="tn-label">若没赶上</span>
      <span v-if="note.nextTrain.lossSeconds > 0">
        下一班 {{ clock(note.nextTrain.depart) }}，预计晚
        {{ duration(note.nextTrain.lossSeconds) }}
      </span>
      <span v-else>下一班 {{ clock(note.nextTrain.depart) }}，后续仍有缓冲，预计不影响到达</span>
    </div>
    <div v-if="!note.sprintCatch && !note.nextTrain" class="tn-row tn-muted">
      暂无前后班次信息
    </div>
    <div v-if="note.estimated" class="tn-src">
      该站基础步行 {{ formatDuration(note.baseSeconds) }} 为整理估计值（{{ network.stations[note.station] }}）。
    </div>
  </div>
</template>
