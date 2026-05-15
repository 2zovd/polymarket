<script setup lang="ts">
import type { OpportunityRow } from '../src/entities/opportunity/model/types'

useHead({ title: 'Opportunities — Polymarket Dashboard' })

const view = ref<'positions' | 'consensus'>('positions')
const page = ref(1)
const sort = ref('score')
const consensusSort = ref('total_usdc')
const filter = ref('all')
const minTrades = ref(5)
const horizon = ref('all')
const minSizeInput = ref('')
const minSize = computed(() => parseFloat(minSizeInput.value) || 0)

const sharedQuery = computed(() => ({
  filter: filter.value,
  minTrades: minTrades.value,
  horizon: horizon.value,
  minSize: minSize.value,
}))

const { data, pending, refresh } = useFetch('/api/opportunities', {
  query: computed(() => ({ ...sharedQuery.value, page: page.value, sort: sort.value })),
  server: false,
})

const { data: consensusData, pending: consensusPending, refresh: consensusRefresh } = useFetch(
  '/api/opportunities/consensus',
  {
    query: computed(() => ({ ...sharedQuery.value, sort: consensusSort.value })),
    server: false,
  },
)

watch([sort, filter, minTrades, horizon, minSizeInput], () => {
  page.value = 1
})

onMounted(() => {
  const t = setInterval(() => {
    if (view.value === 'positions' && data.value) refresh()
    if (view.value === 'consensus' && consensusData.value) consensusRefresh()
  }, 60_000)
  onUnmounted(() => clearInterval(t))
})

const activePending = computed(() =>
  view.value === 'consensus' ? consensusPending.value : pending.value,
)

function doRefresh() {
  if (view.value === 'consensus') consensusRefresh()
  else refresh()
}

const resultCount = computed(() =>
  view.value === 'consensus' ? consensusData.value?.total : data.value?.total,
)
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-white">Opportunities</h1>

    <UCard>
      <template #header>
        <div class="space-y-3">
          <!-- View switcher -->
          <div class="flex items-center gap-1 border-b border-gray-800 pb-3">
            <UButton
              size="xs"
              :variant="view === 'positions' ? 'solid' : 'ghost'"
              :color="view === 'positions' ? 'primary' : 'gray'"
              @click="view = 'positions'"
            >Positions</UButton>
            <UTooltip text="Group by market — see total whale capital and count per outcome">
              <UButton
                size="xs"
                :variant="view === 'consensus' ? 'solid' : 'ghost'"
                :color="view === 'consensus' ? 'primary' : 'gray'"
                @click="view = 'consensus'"
              >Consensus</UButton>
            </UTooltip>
          </div>

          <!-- Shared filters -->
          <div class="flex flex-wrap items-center gap-4">
            <!-- Whale type -->
            <div class="flex items-center gap-1">
              <UTooltip text="Show all qualifying whales">
                <UButton
                  size="xs"
                  :variant="filter === 'all' ? 'solid' : 'ghost'"
                  :color="filter === 'all' ? 'primary' : 'gray'"
                  @click="filter = 'all'"
                >All</UButton>
              </UTooltip>
              <UTooltip text="p < 0.01, Brier < 0.22, ROI > 5% — statistically rigorous & well-calibrated">
                <UButton
                  size="xs"
                  :variant="filter === 'sharp' ? 'solid' : 'ghost'"
                  :color="filter === 'sharp' ? 'primary' : 'gray'"
                  @click="filter = 'sharp'"
                >Sharp</UButton>
              </UTooltip>
              <UTooltip text="p < 0.05, positive ROI — profitable but calibration not required">
                <UButton
                  size="xs"
                  :variant="filter === 'profitable' ? 'solid' : 'ghost'"
                  :color="filter === 'profitable' ? 'primary' : 'gray'"
                  @click="filter = 'profitable'"
                >Profitable</UButton>
              </UTooltip>
            </div>

            <!-- Ends within -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400">Ends in:</span>
              <div class="flex flex-wrap gap-1">
                <UButton
                  v-for="h in [{ label: 'Any', value: 'all' }, { label: '2h', value: '2h' }, { label: '6h', value: '6h' }, { label: '1d', value: '1d' }, { label: '3d', value: '3d' }, { label: '7d', value: '7d' }, { label: '30d', value: '30d' }]"
                  :key="h.value"
                  size="xs"
                  :variant="horizon === h.value ? 'solid' : 'ghost'"
                  :color="horizon === h.value ? 'primary' : 'gray'"
                  @click="horizon = h.value"
                >{{ h.label }}</UButton>
              </div>
            </div>

            <!-- Min resolved trades -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400">Min trades:</span>
              <div class="flex flex-wrap gap-1">
                <UButton
                  v-for="n in [5, 10, 20]"
                  :key="n"
                  size="xs"
                  :variant="minTrades === n ? 'solid' : 'ghost'"
                  :color="minTrades === n ? 'primary' : 'gray'"
                  @click="minTrades = n"
                >{{ n }}</UButton>
              </div>
            </div>

            <!-- Min position size -->
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-gray-400">Min size:</span>
              <div class="relative flex items-center">
                <span class="absolute left-2 text-xs text-gray-500 pointer-events-none">$</span>
                <input
                  v-model="minSizeInput"
                  type="number"
                  min="0"
                  placeholder="any"
                  class="w-20 pl-5 pr-1 bg-transparent border border-gray-700 rounded py-0.5 text-xs font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            <!-- Consensus-specific sort -->
            <div v-if="view === 'consensus'" class="flex items-center gap-2">
              <span class="text-xs text-gray-400">Sort:</span>
              <div class="flex gap-1">
                <UButton
                  v-for="s in [{ label: 'Total $', value: 'total_usdc' }, { label: 'Whales', value: 'whale_count' }]"
                  :key="s.value"
                  size="xs"
                  :variant="consensusSort === s.value ? 'solid' : 'ghost'"
                  :color="consensusSort === s.value ? 'primary' : 'gray'"
                  @click="consensusSort = s.value"
                >{{ s.label }}</UButton>
              </div>
            </div>

            <div class="ml-auto flex items-center gap-3">
              <span v-if="resultCount != null" class="text-xs text-gray-500">{{ resultCount }} results</span>
              <UButton
                size="xs"
                variant="ghost"
                color="gray"
                icon="i-heroicons-arrow-path"
                :loading="activePending"
                @click="doRefresh()"
              >Refresh</UButton>
            </div>
          </div>
        </div>
      </template>

      <OpportunityTable
        v-if="view === 'positions'"
        :rows="(data?.data as OpportunityRow[]) ?? []"
        :loading="pending && !data"
        :sort="sort"
        @sort="sort = $event"
      />

      <ConsensusTable
        v-else
        :rows="(consensusData?.data as any[]) ?? []"
        :loading="consensusPending && !consensusData"
        :sort="consensusSort"
        @sort="consensusSort = $event"
      />

      <template #footer>
        <PaginationBar
          v-if="view === 'positions' && data && data.total > data.pageSize"
          :page="page"
          :total="data.total"
          :page-size="data.pageSize"
          @change="page = $event"
        />
      </template>
    </UCard>
  </div>
</template>
