<script setup lang="ts">
import { computed } from 'vue'
import { network } from '@transit/core'
import { usePlannerStore } from '../stores/planner'
import changchunStatus from '../data/changchun-status.json'

const store = usePlannerStore()

const supported = computed(() => store.supportedLines.length)
const review = computed(() => store.reviewLines.length)
const cc = changchunStatus as {
  status: string
  counts: { lines: number; stations: number; trips: number }
  coverage: number
  coverageDetail?: { coveredStations: number; expectedStations: number; stationCoverage: number }
  capturedAt: string
  note: string
}

function statusLabel(status: string): string {
  if (status === 'supported') return '已支持'
  if (status === 'review') return '待核验'
  return '暂不支持'
}

function confidenceLabel(value: string): string {
  if (value === 'high') return '高'
  if (value === 'medium') return '中'
  return '低'
}

function modeLabel(mode: string): string {
  if (mode === 'tram') return '有轨电车'
  if (mode === 'maglev') return '磁浮'
  if (mode === 'airport') return '机场线'
  return '地铁'
}
</script>

<template>
  <details class="card coverage-card">
    <summary>
      <span>数据覆盖与线路状态</span>
      <span class="coverage-count">{{ supported }} 已支持 · {{ review }} 待核验</span>
    </summary>
    <p class="coverage-intro">
      共 {{ store.lines.length }} 条线、{{ network.stations.length }} 站、{{ store.counts.trips }} 班。
      “待核验”不等于不可用，而是存在站表缺口、越行/待避、环线端点或新旧站表差异；查询时仍会显式提示。
    </p>
    <div class="changchun-status">
      <div class="cc-head">
        <strong>长春 E 出行</strong>
        <span class="status-tag" :class="cc.status === 'ready' ? 'supported' : 'review'">
          {{ cc.status === 'ready' ? '数据就绪' : '样本 · partial' }}
        </span>
      </div>
      <p>
        {{ cc.counts.lines }} 线 · {{ cc.counts.trips }} 班样本 ·
        站覆盖 {{ cc.coverageDetail?.coveredStations ?? cc.counts.stations }}/{{ cc.coverageDetail?.expectedStations ?? '?' }} 站
        （{{ (cc.coverage * 100).toFixed(1) }}%）· 采集 {{ cc.capturedAt.slice(0, 10) }}
      </p>
      <p class="cc-note">{{ cc.note }}；长春数据不参与当前查询。</p>
    </div>
    <ul class="coverage-list">
      <li v-for="line in store.lines" :key="line.id" class="coverage-row">
        <div class="coverage-head">
          <span
            class="line-badge small"
            :style="{ background: line.color, color: line.textColor }"
          >{{ line.shortName }}</span>
          <strong>{{ line.name }}</strong>
          <span class="mode-tag">{{ modeLabel(line.mode) }}</span>
          <span class="status-tag" :class="line.status">{{ statusLabel(line.status) }}</span>
          <span class="coverage-meta">
            {{ line.stationCount }} 站 · {{ line.tripCount }} 班 · BST 标注 {{ line.dataDate ?? '日期未知' }}
          </span>
        </div>
        <div class="coverage-source">
          来源：<a :href="line.source.url" target="_blank" rel="noreferrer">{{ line.source.name }}</a>
          · {{ line.source.license }} · 可信度 {{ confidenceLabel(line.confidence) }}
        </div>
        <div v-if="line.notes.length" class="coverage-notes">
          <span v-for="n in line.notes" :key="n">{{ n }}</span>
        </div>
      </li>
    </ul>
    <p class="coverage-foot">
      本页班次来自汇总文件（最后提交 {{ network.data.meta.aggregateUpdatedAt }}）；
      行内日期是 BST 线路文件标注的截止日，二者可能不同步。站表差异不会被自动补班，未停靠车站不会出现在该线路径中。
    </p>
  </details>
</template>
