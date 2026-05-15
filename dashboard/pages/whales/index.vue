<script setup lang="ts">
import type { WhaleRow } from '../../src/entities/whale/model/types'

useHead({ title: 'Whales — Polymarket Dashboard' })

const { filter, sort, order, filterOptions, sortOptions, toggleSort } = useWhaleFilters()
const page = ref(1)
const searchQuery = ref('')
const activeSearch = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { activeSearch.value = val; page.value = 1 }, 300)
})

watch([filter, sort, order], () => { page.value = 1 })

const { data, pending } = useFetch('/api/whales', {
  query: computed(() => ({ page: page.value, filter: filter.value, sort: sort.value, order: order.value, q: activeSearch.value })),
  server: false,
  watch: [page, filter, sort, order, activeSearch],
})

const router = useRouter()
function selectWhale(whale: WhaleRow) {
  router.push(`/whales/${whale.wallet_address}`)
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-white">Whale Leaderboard</h1>

    <!-- Search -->
    <UInput
      v-model="searchQuery"
      placeholder="Search by wallet address…"
      icon="i-heroicons-magnifying-glass"
      class="max-w-md"
      :ui="{ base: 'font-mono text-xs' }"
    />

    <!-- Filter + sort controls -->
    <WhaleFilterControls
      :filter="filter"
      :sort="sort"
      :filter-options="filterOptions"
      :sort-options="sortOptions"
      @update:filter="filter = $event as any"
      @sort="toggleSort($event as any)"
    />

    <!-- Stats summary -->
    <div class="grid grid-cols-3 gap-4">
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Total Tracked</div>
        <div class="text-2xl font-bold text-white">{{ data?.total ?? '—' }}</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Sharp</div>
        <div class="text-2xl font-bold text-blue-400">
          {{ filter === 'sharp' ? data?.total ?? '—' : '?' }}
        </div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Profitable</div>
        <div class="text-2xl font-bold text-green-400">
          {{ filter === 'profitable' ? data?.total ?? '—' : '?' }}
        </div>
      </UCard>
    </div>

    <UCard>
      <WhaleTable
        :whales="(data?.data as any[]) ?? []"
        :sort="sort"
        :order="order"
        :loading="pending"
        @sort="toggleSort($event as any)"
        @select="selectWhale"
      />
      <div class="mt-4">
        <PaginationBar :page="page" :total="data?.total ?? 0" :page-size="50" @change="page = $event" />
      </div>
    </UCard>
  </div>
</template>
