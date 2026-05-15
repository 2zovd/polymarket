<script setup lang="ts">
import type { OpportunityRow } from '../src/entities/opportunity/model/types'

useHead({ title: 'Opportunities — Polymarket Dashboard' })

const page = ref(1)
const sort = ref('score')
const filter = ref('all')
const minTrades = ref(5)
const horizon = ref('all')
const minSize = ref(0)

const { data, pending, refresh } = useFetch('/api/opportunities', {
  query: computed(() => ({
    page: page.value,
    sort: sort.value,
    filter: filter.value,
    minTrades: minTrades.value,
    horizon: horizon.value,
    minSize: minSize.value,
  })),
  server: false,
})

watch([sort, filter, minTrades, horizon, minSize], () => {
  page.value = 1
})

onMounted(() => {
  const t = setInterval(() => data.value && refresh(), 60_000)
  onUnmounted(() => clearInterval(t))
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-white">Opportunities</h1>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-4">
          <!-- Whale filter -->
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
            <div class="flex gap-1">
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
            <div class="flex gap-1">
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
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400">Min size:</span>
            <div class="flex gap-1">
              <UButton
                v-for="s in [{ label: 'Any', value: 0 }, { label: '$25', value: 25 }, { label: '$50', value: 50 }, { label: '$100', value: 100 }, { label: '$250', value: 250 }]"
                :key="s.value"
                size="xs"
                :variant="minSize === s.value ? 'solid' : 'ghost'"
                :color="minSize === s.value ? 'primary' : 'gray'"
                @click="minSize = s.value"
              >{{ s.label }}</UButton>
            </div>
          </div>

          <div class="ml-auto flex items-center gap-3">
            <span v-if="data" class="text-xs text-gray-500">{{ data.total }} results</span>
            <UButton
              size="xs"
              variant="ghost"
              color="gray"
              icon="i-heroicons-arrow-path"
              :loading="pending"
              @click="refresh()"
            >Refresh</UButton>
          </div>
        </div>
      </template>

      <OpportunityTable
        :rows="(data?.data as OpportunityRow[]) ?? []"
        :loading="pending && !data"
        :sort="sort"
        @sort="sort = $event"
      />

      <template #footer>
        <PaginationBar
          v-if="data && data.total > data.pageSize"
          :page="page"
          :total="data.total"
          :page-size="data.pageSize"
          @change="page = $event"
        />
      </template>
    </UCard>
  </div>
</template>
