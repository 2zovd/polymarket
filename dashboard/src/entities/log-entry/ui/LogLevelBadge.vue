<script setup lang="ts">
import { LEVEL_COLORS } from '../model/types'
defineProps<{ levelName: string }>()
</script>

<template>
  <span
    class="font-mono text-xs uppercase w-10 shrink-0"
    :class="LEVEL_COLORS[levelName] ?? 'text-gray-400'"
  >{{ levelName.slice(0, 4) }}</span>
</template>
