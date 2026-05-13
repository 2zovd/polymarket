<script setup lang="ts">
const route = useRoute()
const address = route.params.address as string

useHead({ title: `Whale ${address.slice(0, 8)}… — Polymarket Dashboard` })

const { data, pending, error } = await useFetch(`/api/whales/${address}`, { server: false })
</script>

<template>
  <div class="space-y-6">
    <NuxtLink to="/whales" class="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1">
      <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> Back to Leaderboard
    </NuxtLink>

    <div v-if="pending"><USkeleton class="h-32 w-full" /></div>

    <UAlert v-else-if="error" color="red" title="Error" :description="error.message" />

    <template v-else-if="data">
      <!-- Whale stats header -->
      <WhaleDetailHeader :stats="data.stats as any" />

      <!-- Watched positions -->
      <UCard>
        <template #header>
          <h2 class="text-sm font-semibold text-white">
            Current Watched Positions
            <UBadge v-if="data.positions.length" color="blue" variant="subtle" size="xs" class="ml-2">
              {{ data.positions.length }}
            </UBadge>
          </h2>
        </template>
        <WatchedPositionsTable :positions="data.positions as any" />
      </UCard>

      <!-- Signal history -->
      <UCard>
        <template #header><h2 class="text-sm font-semibold text-white">Recent Signals (last 20)</h2></template>
        <WhaleSignalHistory :signals="data.signals as any" />
      </UCard>
    </template>
  </div>
</template>
