<script setup lang="ts">
import type { SignalRow } from '../src/entities/signal/model/types'

useHead({ title: 'Signals — Polymarket Dashboard' })

const { status, since, statusOptions, sinceOptions } = useSignalFilters()
const page = ref(1)
watch([status, since], () => { page.value = 1 })

const { data, pending, refresh } = useFetch('/api/signals', {
  query: computed(() => ({ page: page.value, status: status.value, since: since.value })),
  server: false,
  watch: [page, status, since],
})

const { data: statsData } = useFetch('/api/signals/stats', {
  query: computed(() => ({ since: since.value })),
  server: false,
  watch: [since],
})

// Auto-refresh
onMounted(() => {
  const t = setInterval(() => { data.value && refresh() }, 30_000)
  onUnmounted(() => clearInterval(t))
})

const selected = ref<SignalRow | null>(null)
const detailOpen = ref(false)

function openDetail(signal: SignalRow) {
  selected.value = signal
  detailOpen.value = true
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-white">Signals</h1>
      <RefreshIndicator :last-updated="new Date()" />
    </div>

    <!-- Stats row -->
    <div v-if="statsData" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Total</div>
        <div class="text-2xl font-bold text-white">{{ statsData.total }}</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Executed</div>
        <div class="text-2xl font-bold text-green-400">{{ (statsData.byStatus['executed'] ?? 0) + (statsData.byStatus['dry-run'] ?? 0) }}</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Skipped</div>
        <div class="text-2xl font-bold text-yellow-400">{{ statsData.byStatus['skipped'] ?? 0 }}</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Exec Rate</div>
        <div class="text-2xl font-bold text-white">{{ formatPct(statsData.execRate) }}</div>
      </UCard>
    </div>

    <!-- Skip reasons chart -->
    <UCard v-if="statsData?.skipReasons?.length">
      <template #header><h2 class="text-sm font-semibold text-white">Skip Reasons</h2></template>
      <SkipReasonChart :reasons="statsData.skipReasons" />
    </UCard>

    <!-- Filters + table -->
    <UCard>
      <template #header>
        <SignalFilterTabs
          :status="status"
          :since="since"
          :status-options="statusOptions"
          :since-options="sinceOptions"
          @update:status="status = $event"
          @update:since="since = $event"
        />
      </template>
      <SignalTable :signals="(data?.data as any[]) ?? []" :loading="pending" @select="openDetail" />
      <div class="mt-4">
        <PaginationBar
          :page="page"
          :total="data?.total ?? 0"
          :page-size="50"
          @change="page = $event"
        />
      </div>
    </UCard>

    <!-- Signal detail slideover -->
    <USlideover v-model="detailOpen" side="right">
      <div v-if="selected" class="p-6 space-y-4 overflow-y-auto h-full">
        <h2 class="text-lg font-bold text-white">Signal #{{ selected.id }}</h2>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">Status</span>
            <SignalStatusBadge :status="selected.status" />
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Whale</span>
            <AddressTag :address="selected.wallet_address" />
          </div>
          <div v-if="selected.question" class="flex justify-between gap-4">
            <span class="text-gray-500 shrink-0">Market</span>
            <MarketLink :question="selected.question" :event-slug="selected.event_slug" />
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Outcome</span>
            <span class="text-white">{{ selected.outcome }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Whale Avg Price</span>
            <span class="font-mono text-white">{{ (selected.whale_avg_price * 100).toFixed(1) }}¢</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Current Ask</span>
            <span class="font-mono text-white">{{ (selected.current_ask * 100).toFixed(1) }}¢</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Edge</span>
            <span class="font-mono" :class="selected.edge > 0 ? 'text-green-400' : 'text-gray-400'">
              {{ (selected.edge * 100).toFixed(2) }}¢
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Kelly Size</span>
            <span class="font-mono text-white">{{ formatUsdc(selected.kelly_size) }}</span>
          </div>
          <div v-if="selected.skip_reason" class="flex justify-between">
            <span class="text-gray-500">Skip Reason</span>
            <span class="text-yellow-300 font-mono text-xs max-w-xs text-right">{{ selected.skip_reason }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Created</span>
            <span class="text-gray-300">{{ formatIso(selected.created_at) }}</span>
          </div>
        </div>
        <UButton variant="ghost" color="gray" size="sm" @click="detailOpen = false">Close</UButton>
      </div>
    </USlideover>
  </div>
</template>
