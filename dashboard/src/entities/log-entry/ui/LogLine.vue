<script setup lang="ts">
import { LEVEL_BG } from '../model/types'
import type { LogLine } from '../model/types'

const props = defineProps<{ entry: LogLine }>()

const bg = computed(() => LEVEL_BG[props.entry.levelName] ?? '')
</script>

<template>
  <div :class="['flex items-start gap-2 px-2 py-0.5 font-mono text-xs hover:bg-gray-800 rounded', bg]">
    <span class="text-gray-600 shrink-0 w-20">{{ entry.time?.slice(11, 19) }}</span>
    <LogLevelBadge :level-name="entry.levelName" />
    <span v-if="entry.module" class="text-purple-400 shrink-0 w-16 truncate">{{ entry.module }}</span>
    <span class="text-gray-200 flex-1 break-all">{{ entry.msg }}</span>
  </div>
</template>
