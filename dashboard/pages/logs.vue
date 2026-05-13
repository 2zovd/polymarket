<script setup lang="ts">
useHead({ title: 'Logs — Polymarket Dashboard' })

const { lines, paused, connected, clear } = useLogStream()
const levelFilter = ref('all')
const searchQuery = ref('')
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-white">Live Logs</h1>
      <div class="text-xs text-gray-500 font-mono">{{ lines.length }} lines buffered</div>
    </div>

    <LogStreamControls
      :paused="paused"
      :connected="connected"
      :level-filter="levelFilter"
      @update:paused="paused = $event"
      @update:level-filter="levelFilter = $event"
      @clear="clear"
    />

    <LogViewer :lines="lines" :level-filter="levelFilter" />
  </div>
</template>
