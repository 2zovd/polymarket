<script setup lang="ts">
import { parseOutcomePrices, parseOutcomes } from '../model/types'

const props = defineProps<{
  outcomePrices: string | null
  outcomes: string | null
}>()

const prices = computed(() => parseOutcomePrices(props.outcomePrices))
const labels = computed(() => parseOutcomes(props.outcomes))

const yesIdx = computed(() => {
  const idx = labels.value.findIndex((l) => l.toLowerCase() === 'yes')
  return idx >= 0 ? idx : 0
})

const yesPct = computed(() => {
  const p = prices.value[yesIdx.value]
  return p != null ? Math.round(p * 100) : null
})
const noPct = computed(() => yesPct.value != null ? 100 - yesPct.value : null)
</script>

<template>
  <div v-if="yesPct != null" class="flex items-center gap-1 text-xs">
    <div class="w-16 h-2 rounded-full bg-gray-700 overflow-hidden">
      <div class="h-full bg-green-500" :style="{ width: `${yesPct}%` }" />
    </div>
    <span class="text-green-400 font-mono">{{ yesPct }}¢</span>
    <span class="text-gray-500">/</span>
    <span class="text-red-400 font-mono">{{ noPct }}¢</span>
  </div>
  <span v-else class="text-gray-500 text-xs">—</span>
</template>
