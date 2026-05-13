<script setup lang="ts">
const { data, refresh } = await useFetch('/api/status', { server: false })

onMounted(() => {
  const timer = setInterval(refresh, 15_000)
  onUnmounted(() => clearInterval(timer))
})

const stale = computed(() => isStale(data.value?.lastLogAt))
const modeColor = computed(() => data.value?.dryRun ? 'yellow' : 'green')
const modeLabel = computed(() => data.value?.dryRun ? 'Dry Run' : 'Live')
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Bot Mode</div>
      <UBadge :color="modeColor" variant="subtle">{{ modeLabel }}</UBadge>
    </UCard>
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Last Activity</div>
      <div :class="stale ? 'text-red-400' : 'text-gray-200'" class="text-sm font-medium">
        {{ timeAgo(data?.lastLogAt) }}
      </div>
    </UCard>
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Open Positions</div>
      <div class="text-xl font-bold text-white">{{ data?.openPositions ?? '—' }}</div>
    </UCard>
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Errors (1h)</div>
      <div :class="(data?.logErrors1h ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'" class="text-xl font-bold">
        {{ data?.logErrors1h ?? 0 }}
        <span class="text-xs font-normal text-gray-500"> / {{ data?.logWarns1h ?? 0 }} warn</span>
      </div>
    </UCard>
  </div>
</template>
