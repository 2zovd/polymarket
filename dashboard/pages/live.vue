<script setup lang="ts">
useHead({ title: 'Live Feed — Polymarket Dashboard' })

const { events, connected, paused, clear } = useLiveEventStream()

const severityFilter = ref<'all' | 'low' | 'medium' | 'high'>('all')
const statusFilter = ref<'all' | 'executed' | 'dry-run' | 'skipped'>('all')

const filtered = computed(() => {
  return events.value.filter((ev) => {
    if (severityFilter.value !== 'all' && ev.severity !== severityFilter.value) return false
    if (statusFilter.value !== 'all') {
      const execSt = ev.data.executionStatus ?? (ev.data.signalStatus === 'skipped' ? 'skipped' : null)
      if (execSt !== statusFilter.value) return false
    }
    return true
  })
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <h1 class="text-xl font-bold text-white">Live Feed</h1>
        <!-- Connection status -->
        <span class="flex items-center gap-1.5 text-xs">
          <span
            class="w-2 h-2 rounded-full"
            :class="connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'"
          />
          <span :class="connected ? 'text-green-400' : 'text-red-400'">
            {{ connected ? 'Connected' : 'Reconnecting…' }}
          </span>
        </span>
        <UBadge variant="soft" color="gray" size="xs">{{ filtered.length }} events</UBadge>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Severity filter -->
        <USelect
          v-model="severityFilter"
          :options="[
            { label: 'All severity', value: 'all' },
            { label: 'High ($10k+)', value: 'high' },
            { label: 'Medium ($1k+)', value: 'medium' },
            { label: 'Low (<$1k)', value: 'low' },
          ]"
          size="xs"
          class="w-36"
        />

        <!-- Status filter -->
        <USelect
          v-model="statusFilter"
          :options="[
            { label: 'All status', value: 'all' },
            { label: 'Executed', value: 'executed' },
            { label: 'Dry-run', value: 'dry-run' },
            { label: 'Skipped', value: 'skipped' },
          ]"
          size="xs"
          class="w-32"
        />

        <UButton
          size="xs"
          :color="paused ? 'primary' : 'gray'"
          variant="soft"
          :icon="paused ? 'i-heroicons-play' : 'i-heroicons-pause'"
          @click="paused = !paused"
        >
          {{ paused ? 'Resume' : 'Pause' }}
        </UButton>

        <UButton
          size="xs"
          color="gray"
          variant="ghost"
          icon="i-heroicons-trash"
          @click="clear"
        >
          Clear
        </UButton>
      </div>
    </div>

    <UCard>
      <LiveFeed :events="filtered" :connected="connected" />
    </UCard>
  </div>
</template>
