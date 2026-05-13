<script setup lang="ts">
import type { WhaleSignalRow } from '../model/types'
defineProps<{ signals: WhaleSignalRow[] }>()
</script>

<template>
  <div class="space-y-1">
    <div v-if="!signals.length" class="text-gray-500 text-sm">No signals generated yet.</div>
    <div
      v-for="s in signals"
      :key="s.id"
      class="flex items-center gap-2 text-sm py-1 border-b border-gray-800"
    >
      <SignalStatusBadge :status="s.status as any" />
      <span class="text-gray-300 truncate flex-1">{{ s.question ?? s.condition_id }}</span>
      <span class="text-gray-400 shrink-0">{{ formatIso(s.created_at) }}</span>
    </div>
  </div>
</template>
