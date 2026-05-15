<script setup lang="ts">
useHead({ title: 'Markets — Polymarket Dashboard' })

const { query, debouncedQuery } = useMarketSearch()
const statusFilter = ref('active')
const sortFilter = ref('volume')
const page = ref(1)
watch([debouncedQuery, statusFilter, sortFilter], () => { page.value = 1 })

const { data, pending, refresh } = useFetch('/api/markets', {
  query: computed(() => ({
    page: page.value,
    status: statusFilter.value,
    sort: sortFilter.value,
    q: debouncedQuery.value,
  })),
  server: false,
  watch: [page, statusFilter, sortFilter, debouncedQuery],
})

const { data: candidatesData, refresh: refreshCandidates } = useFetch('/api/markets/candidates', { server: false })

onMounted(() => {
  const t = setInterval(() => { data.value && refresh(); refreshCandidates() }, 60_000)
  onUnmounted(() => clearInterval(t))
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-white">Markets</h1>

    <!-- Market candidates -->
    <UCard>
      <template #header>
        <h2 class="text-sm font-semibold text-white">
          Whale Candidates
          <UBadge v-if="candidatesData?.data?.length" color="blue" variant="subtle" size="xs" class="ml-2">
            {{ candidatesData.data.length }}
          </UBadge>
        </h2>
      </template>
      <MarketCandidatesPanel :candidates="(candidatesData?.data as any[]) ?? []" />
    </UCard>

    <!-- Market browser -->
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <!-- Status tabs -->
          <div class="flex gap-1">
            <UButton
              v-for="s in ['active', 'closed', 'all']"
              :key="s"
              size="xs"
              :variant="statusFilter === s ? 'solid' : 'outline'"
              :color="statusFilter === s ? 'primary' : 'gray'"
              @click="statusFilter = s"
            >{{ s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1) }}</UButton>
          </div>
          <div class="flex gap-1 items-center">
            <span class="text-xs text-gray-500">Sort:</span>
            <UButton
              v-for="s in [{ label: 'Volume', value: 'volume' }, { label: 'Liquidity', value: 'liquidity' }, { label: 'Whales', value: 'whales' }]"
              :key="s.value"
              size="xs"
              :variant="sortFilter === s.value ? 'solid' : 'ghost'"
              :color="sortFilter === s.value ? 'primary' : 'gray'"
              @click="sortFilter = s.value"
            >{{ s.label }}</UButton>
          </div>
          <div class="ml-auto">
            <MarketSearchInput v-model="query" />
          </div>
        </div>
      </template>
      <MarketTable :markets="(data?.data as any[]) ?? []" :loading="pending" />
      <div class="mt-4">
        <PaginationBar :page="page" :total="data?.total ?? 0" :page-size="50" @change="page = $event" />
      </div>
    </UCard>
  </div>
</template>
