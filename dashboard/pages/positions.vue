<script setup lang="ts">
useHead({ title: 'Positions — Polymarket Dashboard' })

const { includeDryRun } = useDryRunFilter()
const page = ref(1)

const { data: openData, pending: openPending, refresh: refreshOpenData } = useFetch('/api/positions/open', { server: false })
const { data: statsData } = useFetch('/api/positions/stats', { server: false })
const { data: historyData } = useFetch('/api/positions/history', { server: false })
const { data: listData, pending: listPending } = useFetch('/api/positions', {
  query: computed(() => ({ page: page.value, isDryRun: -1 })),
  server: false,
  watch: [page],
})

onMounted(() => {
  const t = setInterval(() => openData.value && refreshOpenData(), 15_000)
  onUnmounted(() => clearInterval(t))
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-white">Positions</h1>
      <DryRunToggle v-model="includeDryRun" />
    </div>

    <!-- P&L summary -->
    <PnlStatRow :stats="statsData as any" :is-dry-run="includeDryRun" />

    <!-- Cumulative chart -->
    <UCard>
      <template #header><h2 class="text-sm font-semibold text-white">Cumulative P&amp;L</h2></template>
      <CumulativePnlChart
        :history="(historyData?.data as any[]) ?? []"
        :is-dry-run="includeDryRun"
      />
    </UCard>

    <!-- Open positions -->
    <UCard>
      <template #header>
        <h2 class="text-sm font-semibold text-white">
          Open Positions
          <UBadge v-if="openData?.data?.length" color="blue" variant="subtle" size="xs" class="ml-2">
            {{ openData.data.length }}
          </UBadge>
        </h2>
      </template>
      <OpenPositionsPanel :positions="(openData?.data as any[]) ?? []" :loading="openPending" />
    </UCard>

    <!-- History -->
    <UCard>
      <template #header><h2 class="text-sm font-semibold text-white">History</h2></template>
      <PositionHistoryTable :positions="(listData?.data as any[]) ?? []" :loading="listPending" />
      <div class="mt-4">
        <PaginationBar :page="page" :total="listData?.total ?? 0" :page-size="50" @change="page = $event" />
      </div>
    </UCard>
  </div>
</template>
