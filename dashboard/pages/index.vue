<script setup lang="ts">
import type { OpportunityRow } from '../src/entities/opportunity/model/types'
useHead({ title: 'Operations — Polymarket Dashboard' })

const { events: liveEvents, connected: liveConnected } = useLiveEventStream()

const { data: signalsData, pending: signalsPending, refresh: refreshSignals } = useFetch('/api/signals', {
  query: { page: 1, status: 'all', since: '24h' },
  server: false,
})

const { data: oppsData, pending: oppsPending } = useFetch('/api/opportunities', {
  query: { page: 1, sort: 'score', filter: 'all', minTrades: 5 },
  server: false,
})

onMounted(() => {
  const t = setInterval(() => signalsData.value && refreshSignals(), 30_000)
  onUnmounted(() => clearInterval(t))
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-white">Operations</h1>

    <!-- Bot health -->
    <BotStatusCard />

    <!-- Top opportunities -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white">Top Opportunities</h2>
          <NuxtLink to="/opportunities" class="text-xs text-blue-400 hover:text-blue-300">View all →</NuxtLink>
        </div>
      </template>
      <OpportunityTable
        :rows="((oppsData?.data as OpportunityRow[]) ?? []).slice(0, 5)"
        :loading="oppsPending"
        :mini="true"
      />
    </UCard>

    <!-- Recent signals mini-table -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white">Recent Signals (24h)</h2>
          <NuxtLink to="/signals" class="text-xs text-blue-400 hover:text-blue-300">View all →</NuxtLink>
        </div>
      </template>
      <SignalTable
        :signals="(signalsData?.data as any[]) ?? []"
        :loading="signalsPending"
        :mini="true"
      />
    </UCard>

    <!-- Live whale feed (last 10 events) -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-white">Live Whale Feed</h2>
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="liveConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'"
            />
          </div>
          <NuxtLink to="/live" class="text-xs text-blue-400 hover:text-blue-300">View all →</NuxtLink>
        </div>
      </template>
      <LiveFeed :events="liveEvents.slice(0, 10)" :connected="liveConnected" />
    </UCard>
  </div>
</template>
