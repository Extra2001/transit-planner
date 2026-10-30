<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { network } from '@transit/core'
import { usePlannerStore } from './stores/planner'
import StationField from './components/StationField.vue'
import PlanView from './components/PlanView.vue'

const store = usePlannerStore()

const dayLabel = computed(() => (store.day === 'weekday' ? '工作日' : '双休日'))
const fromLines = computed(() => store.linesAt(store.from))
const toLines = computed(() => store.linesAt(store.to))

let timer: number | undefined

function scheduleRun() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => store.run(), 120)
}

watch(
  () => [store.from, store.to, store.time, store.day, store.speed, store.bufferSec],
  scheduleRun
)

onMounted(() => store.run())
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">⇄</div>
        <div>
          <h1>逐班换乘</h1>
          <p>北京地铁 · 计划时刻</p>
        </div>
      </div>
      <span class="pill">原型 · 非实时</span>
    </header>

    <main>
      <section class="card form-card">
        <form @submit.prevent="store.run()">
          <div class="station-row">
            <StationField
              v-model="store.from"
              label="出发站"
              :stations="store.stations"
              :lines="fromLines"
            />
            <button type="button" class="swap-btn" aria-label="交换起终点" @click="store.swap()">
              ⇅
            </button>
            <StationField
              v-model="store.to"
              label="目的站"
              :stations="store.stations"
              :lines="toLines"
            />
          </div>

          <div class="two-col">
            <label class="field">
              <span class="field-label">出发时间</span>
              <input v-model="store.time" type="time" step="60" required />
            </label>
            <div class="field">
              <span class="field-label">日期类型</span>
              <div class="segmented">
                <button
                  type="button"
                  :class="{ active: store.day === 'weekday' }"
                  @click="store.day = 'weekday'"
                >
                  工作日
                </button>
                <button
                  type="button"
                  :class="{ active: store.day === 'weekend' }"
                  @click="store.day = 'weekend'"
                >
                  双休日
                </button>
              </div>
            </div>
          </div>

          <div class="field speed-field">
            <div class="field-label-row">
              <span class="field-label">步行速度</span>
              <strong>{{ store.speed.toFixed(2) }}× · {{ store.speedLabel }}</strong>
            </div>
            <input
              v-model.number="store.speed"
              type="range"
              min="0.8"
              max="1.3"
              step="0.05"
              aria-label="步行速度倍率"
            />
            <div class="range-hints">
              <span>慢 0.8×</span><span>正常 1.0×</span><span>快 1.3×</span>
            </div>
          </div>

          <details class="advanced">
            <summary>更多设置</summary>
            <label class="field">
              <span class="field-label">换乘安全余量</span>
              <select v-model.number="store.bufferSec">
                <option :value="15">15 秒</option>
                <option :value="30">30 秒</option>
                <option :value="45">45 秒</option>
                <option :value="60">60 秒</option>
                <option :value="90">90 秒</option>
              </select>
            </label>
            <p class="hint">
              余量会加到每次换乘步行上。冲刺按 1.35× 步速计算，仅用于给出对比方案。
            </p>
          </details>

          <button class="submit-btn" type="submit" :disabled="store.computing">
            {{ store.computing ? '计算中…' : '查询最快方案' }}
          </button>
        </form>
      </section>

      <PlanView
        v-if="store.result"
        :result="store.result"
        :day-label="dayLabel"
        :depart-time="store.time"
      />

      <section v-else-if="store.error" class="card error-card">
        <h2>暂时无法计算</h2>
        <p>{{ store.error }}</p>
      </section>

      <section v-else class="card empty-card">
        <p>选择起终点后自动计算。</p>
      </section>

      <p class="notice">
        仅覆盖 1 / 2 / 4 / 5 号线（1 号线四惠—古城），共 {{ network.stations.length }} 站。
        时刻按已到站台计，不含进站安检；不含节假日专用图与临时调整。
      </p>
    </main>

    <footer class="app-footer">
      <p class="foot-strong">数据说明</p>
      <p>
        逐班计划时刻来自
        <a href="https://github.com/BoyInTheSun/beijing-subway-schedule" target="_blank" rel="noreferrer">
          BoyInTheSun/beijing-subway-schedule
        </a>
        （CC BY-SA 4.0），其底层为北京地铁、京港地铁官网公布的车站时刻表图片，经 OCR 与人工纠错。
      </p>
      <p>
        换乘步行时间来自
        <a href="https://github.com/Mick235711/Beijing-Subway-Tools" target="_blank" rel="noreferrer">
          Beijing-Subway-Tools
        </a>
        （MIT），为爱好者整理/推算值，并非运营方实测，可按步速缩放。
      </p>
      <p>
        数据汇总最后更新 {{ network.data.meta.dataUpdatedAt }}。列车时刻可能因调图、临客、故障而变化；
        本原型不提供实时到站，请以现场运营为准。
      </p>
      <p class="foot-dim">可行性研究原型 · 不构成出行保证</p>
    </footer>
  </div>
</template>
