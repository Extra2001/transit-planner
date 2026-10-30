<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { LineInfo } from '@transit/core'
import { usePlannerStore } from '../stores/planner'

const props = defineProps<{
  label: string
  modelValue: string
  stations: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const store = usePlannerStore()

const query = ref(props.modelValue)
const open = ref(false)
const active = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  (v) => {
    query.value = v
  }
)

const linesOf = (name: string): LineInfo[] => {
  const net = store.activeNetwork
  const idx = net.stationIndex.get(name)
  if (idx === undefined) return []
  return net.lineAt[idx].map((i) => net.lines[i])
}

const selectedLines = computed(() => linesOf(props.modelValue))

const filtered = computed(() => {
  const q = query.value.trim()
  if (!q || q === props.modelValue) return props.stations
  return props.stations.filter((s) => {
    if (s.includes(q)) return true
    return linesOf(s).some(
      (l) => l.name.includes(q) || l.shortName.toLowerCase().includes(q.toLowerCase())
    )
  })
})

watch(
  () => filtered.value.length,
  () => {
    active.value = 0
  }
)

function openMenu() {
  open.value = true
  active.value = 0
}

function onFocus(e: FocusEvent) {
  openMenu()
  ;(e.target as HTMLInputElement).select()
}

function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value
  open.value = true
  active.value = 0
}

function select(name: string) {
  emit('update:modelValue', name)
  query.value = name
  open.value = false
  inputEl.value?.blur()
}

function onBlur() {
  window.setTimeout(() => {
    open.value = false
    if (!props.stations.includes(query.value)) query.value = props.modelValue
  }, 120)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    open.value = true
    if (filtered.value.length) active.value = (active.value + 1) % filtered.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (filtered.value.length) {
      active.value = (active.value - 1 + filtered.value.length) % filtered.value.length
    }
  } else if (e.key === 'Enter') {
    if (open.value && filtered.value[active.value]) {
      e.preventDefault()
      select(filtered.value[active.value])
    }
  } else if (e.key === 'Escape') {
    open.value = false
    query.value = props.modelValue
  }
  nextTick(() => {
    document.querySelector('.combo-option.active')?.scrollIntoView({ block: 'nearest' })
  })
}
</script>

<template>
  <label class="field station-field">
    <span class="field-label">{{ label }}</span>
    <div class="combo" :class="{ open }">
      <input
        ref="inputEl"
        :value="query"
        type="text"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        :aria-expanded="open"
        aria-autocomplete="list"
        @focus="onFocus"
        @input="onInput"
        @keydown="onKeydown"
        @blur="onBlur"
      />
      <span class="combo-caret" aria-hidden="true">▾</span>
      <ul v-if="open" class="combo-menu" role="listbox">
        <li v-for="(s, i) in filtered" :key="s">
          <button
            type="button"
            class="combo-option"
            :class="{ active: i === active }"
            role="option"
            :aria-selected="s === modelValue"
            @mousedown.prevent
            @click="select(s)"
          >
            <span class="opt-name">{{ s }}</span>
            <span class="opt-lines">
              <span
                v-for="l in linesOf(s)"
                :key="l.id"
                class="line-chip"
                :style="{ background: l.color, color: l.textColor }"
              >{{ l.shortName }}</span>
            </span>
          </button>
        </li>
        <li v-if="filtered.length === 0" class="combo-empty">没有匹配的车站</li>
      </ul>
    </div>
    <span class="station-lines">
      <span
        v-for="l in selectedLines"
        :key="l.id"
        class="line-chip"
        :style="{ background: l.color, color: l.textColor }"
      >{{ l.shortName }}</span>
    </span>
  </label>
</template>
