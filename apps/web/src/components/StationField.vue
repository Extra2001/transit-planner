<script setup lang="ts">
import type { LineInfo } from '@transit/core'

defineProps<{
  label: string
  modelValue: string
  stations: string[]
  lines: LineInfo[]
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="field station-field">
    <span class="field-label">{{ label }}</span>
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="s in stations" :key="s" :value="s">{{ s }}</option>
    </select>
    <span class="station-lines">
      <span
        v-for="line in lines"
        :key="line.id"
        class="line-chip"
        :style="{ background: line.color }"
      >{{ line.shortName }}</span>
    </span>
  </label>
</template>
