<script setup lang="ts">
import type { LogLine } from '../../../entities/log-entry/model/types'

const props = defineProps<{ lines: LogLine[]; levelFilter: string }>()

const MIN_LEVEL: Record<string, number> = { all: 0, info: 30, warn: 40, error: 50 }

const filtered = computed(() => {
  const min = MIN_LEVEL[props.levelFilter] ?? 0
  return props.lines.filter((l) => l.level >= min)
})

const containerRef = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

watch(
  () => filtered.value.length,
  async () => {
    if (!autoScroll.value) return
    await nextTick()
    containerRef.value?.scrollTo({ top: containerRef.value.scrollHeight, behavior: 'instant' })
  },
)

function onScroll() {
  if (!containerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = containerRef.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 40
}
</script>

<template>
  <div
    ref="containerRef"
    class="h-[calc(100vh-12rem)] overflow-y-auto bg-gray-950 rounded-lg border border-gray-800 p-2 font-mono"
    @scroll="onScroll"
  >
    <div v-if="!filtered.length" class="flex items-center justify-center h-20 text-gray-600 text-sm">
      No log entries
    </div>
    <LogLine v-for="(entry, i) in filtered" :key="i" :entry="entry" />
  </div>
</template>
