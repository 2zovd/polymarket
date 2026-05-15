<script setup lang="ts">
import type { LiveEvent } from '../../../entities/live-event/model/types'

const props = defineProps<{
  events: LiveEvent[]
  connected: boolean
  loading?: boolean
}>()

const SEVERITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-400',
  low: 'bg-gray-500',
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  whale_buy: { label: 'whale buy', cls: 'text-purple-400 bg-purple-400/10' },
  large_trade: { label: 'large trade', cls: 'text-orange-400 bg-orange-400/10' },
  price_spike: { label: 'price spike', cls: 'text-cyan-400 bg-cyan-400/10' },
  orderbook_thin: { label: 'book thin', cls: 'text-yellow-500 bg-yellow-500/10' },
}

const EXEC_BADGE: Record<string, { label: string; cls: string }> = {
  executed: { label: 'executed', cls: 'text-green-400 bg-green-400/10' },
  'dry-run': { label: 'dry-run', cls: 'text-blue-400 bg-blue-400/10' },
  skipped: { label: 'skipped', cls: 'text-gray-500 bg-gray-700/50' },
  failed: { label: 'failed', cls: 'text-red-400 bg-red-400/10' },
}

function typeBadge(ev: LiveEvent) {
  return TYPE_BADGE[ev.type] ?? { label: ev.type, cls: 'text-gray-400 bg-gray-700/50' }
}

function execBadge(ev: LiveEvent) {
  if (ev.data.executionStatus) return EXEC_BADGE[ev.data.executionStatus] ?? EXEC_BADGE.failed
  if (ev.data.signalStatus === 'skipped') return EXEC_BADGE.skipped
  return null
}

function msAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// Refresh relative timestamps every 30s.
const tick = ref(0)
let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => tick.value++, 30_000) })
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="overflow-x-auto">
    <div v-if="!loading && !events.length" class="py-12 text-center text-gray-500 text-sm">
      No live events yet — waiting for market activity…
    </div>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th class="pb-2 pr-3 font-medium w-4" />
          <th class="pb-2 pr-4 font-medium whitespace-nowrap">Time</th>
          <th class="pb-2 pr-4 font-medium">Type</th>
          <th class="pb-2 pr-4 font-medium">Market</th>
          <th class="pb-2 pr-4 font-medium">Details</th>
          <th class="pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="6" class="py-4"><USkeleton class="h-4 w-full" /></td>
        </tr>
        <template v-else>
          <tr
            v-for="ev in events"
            :key="`${ev.id}-${tick}`"
            class="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
          >
            <!-- Severity dot -->
            <td class="py-2 pr-3">
              <span class="inline-block w-2 h-2 rounded-full" :class="SEVERITY_DOT[ev.severity] ?? 'bg-gray-600'" />
            </td>

            <!-- Time -->
            <td class="py-2 pr-4 text-gray-400 whitespace-nowrap text-xs">{{ msAgo(ev.detectedAt) }}</td>

            <!-- Type badge -->
            <td class="py-2 pr-4">
              <span
                class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                :class="typeBadge(ev).cls"
              >{{ typeBadge(ev).label }}</span>
            </td>

            <!-- Market -->
            <td class="py-2 pr-4 max-w-[200px]">
              <span v-if="ev.question" class="text-gray-300 text-xs">{{ truncate(ev.question, 45) }}</span>
              <span v-else class="text-gray-600 font-mono text-xs">{{ ev.marketId.slice(0, 10) }}…</span>
            </td>

            <!-- Details (per event type) -->
            <td class="py-2 pr-4 text-xs">
              <!-- whale_buy -->
              <template v-if="ev.type === 'whale_buy'">
                <NuxtLink
                  v-if="ev.data.wallet"
                  :to="`/whales/${ev.data.wallet}`"
                  class="font-mono text-blue-400 hover:text-blue-300"
                >{{ shortAddr(ev.data.wallet) }}</NuxtLink>
                <span class="text-gray-400 mx-1">bought</span>
                <span class="text-gray-200">{{ ev.data.outcome }}</span>
                <span class="text-gray-500 mx-1">·</span>
                <span :class="(ev.data.usdcSize ?? 0) >= 10_000 ? 'text-red-400' : (ev.data.usdcSize ?? 0) >= 1_000 ? 'text-yellow-400' : 'text-gray-300'">
                  {{ formatUsdc(ev.data.usdcSize) }}
                </span>
              </template>

              <!-- large_trade -->
              <template v-else-if="ev.type === 'large_trade'">
                <span :class="ev.data.side === 'BUY' ? 'text-green-400' : 'text-red-400'">{{ ev.data.side }}</span>
                <span class="text-gray-400 mx-1">{{ formatUsdc(ev.data.usdcSize) }}</span>
                <span class="text-gray-300">{{ ev.data.outcome }}</span>
                <span v-if="ev.data.wallet" class="text-gray-600 ml-1">· {{ shortAddr(ev.data.wallet) }}</span>
              </template>

              <!-- price_spike -->
              <template v-else-if="ev.type === 'price_spike'">
                <span class="font-mono text-gray-400">{{ ev.data.priceFrom?.toFixed(2) }}</span>
                <span class="mx-1" :class="ev.data.direction === 'up' ? 'text-green-400' : 'text-red-400'">
                  {{ ev.data.direction === 'up' ? '↑' : '↓' }}
                </span>
                <span class="font-mono text-gray-200">{{ ev.data.priceTo?.toFixed(2) }}</span>
                <span class="ml-1 font-semibold" :class="ev.data.direction === 'up' ? 'text-green-400' : 'text-red-400'">
                  ({{ ev.data.changePp?.toFixed(1) }}pp)
                </span>
              </template>

              <!-- orderbook_thin -->
              <template v-else-if="ev.type === 'orderbook_thin'">
                <span class="text-gray-400">ask liq:</span>
                <span class="font-mono text-yellow-400 ml-1">{{ formatUsdc(ev.data.totalAskUsdc) }}</span>
                <span class="text-gray-600 ml-1">({{ ev.data.askLevels }} levels)</span>
              </template>

              <!-- fallback -->
              <template v-else>
                <span class="text-gray-600 font-mono">{{ ev.type }}</span>
              </template>
            </td>

            <!-- Status (whale_buy only has exec status; others blank) -->
            <td class="py-2">
              <template v-if="execBadge(ev)">
                <span
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                  :class="execBadge(ev)!.cls"
                >{{ execBadge(ev)!.label }}</span>
                <p v-if="ev.data.skipReason" class="text-xs text-gray-600 mt-0.5">
                  {{ ev.data.skipReason.split(':')[0].replace(/_/g, ' ') }}
                </p>
              </template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
