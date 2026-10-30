<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlannerStore } from '../stores/planner'

const store = usePlannerStore()
const net = computed(() => store.activeNetwork)
const status = computed(() => store.cityStatus)
const manifest = computed(() => store.activeManifest)
const downloading = ref(false)
const offlineHint = ref('')

const supported = computed(() => store.supportedLines.length)
const review = computed(() => store.reviewLines.length)

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
  const map: Record<string, string> = {
    metro: '地铁',
    tram: '有轨电车',
    maglev: '磁浮',
    airport: '机场线'
  }
  return map[mode] ?? mode
}

function redistributionLabel(value: string): string {
  if (value === 'allowed') return '允许再分发'
  if (value === 'forbidden') return '禁止再分发'
  return '许可未确认'
}

async function download() {
  downloading.value = true
  const ok = await store.downloadOffline()
  offlineHint.value = ok ? '已缓存，可离线查看该城市时刻表。' : '缓存失败，请检查网络或稍后重试。'
  downloading.value = false
}
</script>

<template>
  <details class="card coverage-card">
    <summary>
      <span>数据覆盖与线路状态</span>
      <span class="coverage-count">{{ supported }} 已支持 · {{ review }} 待核验</span>
    </summary>
    <p class="coverage-intro">
      共 {{ store.lines.length }} 条线、{{ net?.stations.length ?? 0 }} 站、{{ store.counts.trips }}
      {{ store.tripUnit }}。“待核验”不等于不可用，而是存在站表缺口、越行/待避、环线端点或新旧站表差异；
      查询时仍会显式提示。
    </p>

    <div class="city-meta">
      <div class="cc-head">
        <strong>{{ manifest.name }}</strong>
        <span class="status-tag" :class="status?.status === 'ready' ? 'supported' : 'review'">
          {{ status?.status === 'ready' ? '数据就绪' : '样本 · partial' }}
        </span>
      </div>
      <p>
        {{ store.counts.lines }} 线 · {{ store.counts.trips }} {{ store.tripUnit }}
        · 站-线覆盖
        {{ status?.coverage !== undefined ? (status.coverage * 100).toFixed(1) + '%' : '—' }}
        · 采集 {{ manifest.provenance.capturedAt?.slice(0, 10) ?? '未知' }}
      </p>
      <p v-if="status?.association">
        相邻站关联覆盖 {{ (status.association.associationCoverage * 100).toFixed(1) }}%
        · 关联不唯一 {{ status.association.ambiguousLegs }}/{{ status.association.legCount }} 段
        （{{ (status.association.ambiguityRate * 100).toFixed(1) }}%）
        · 未确认配对 {{ status.association.uncertainPairs }} 对
      </p>
      <p>
        数据许可：{{ manifest.license.id === 'UNCONFIRMED' ? '未确认' : manifest.license.id }}
        · {{ redistributionLabel(manifest.license.redistribution) }}
      </p>
      <p class="cc-note">{{ status?.note ?? manifest.notices[0] ?? '' }}</p>
      <div class="cc-actions">
        <button type="button" class="ghost-btn" :disabled="downloading" @click="download">
          {{ downloading ? '缓存中…' : store.offlineCached ? '已缓存离线数据' : '下载离线数据' }}
        </button>
        <span v-if="offlineHint" class="hint">{{ offlineHint }}</span>
      </div>
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
            {{ line.stationCount }} 站 · {{ line.tripCount }} {{ store.tripUnit }} ·
            {{ store.sourceLabel }} {{ line.dataDate ?? '日期未知' }}
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
      本页班次来自 {{ net?.data.meta.title ?? manifest.name }}（生成/汇总
      {{ net?.data.meta.aggregateUpdatedAt ?? '未知' }}）；行内日期为数据源标注日期，二者可能不同步。
      站表差异不会被自动补班，未停靠车站不会出现在该线路径中。
    </p>
  </details>
</template>
