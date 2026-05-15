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

const EXEC_BADGE: Record<string, { label: string; cls: string }> = {
  executed: { label: 'executed', cls: 'text-green-400 bg-green-400/10' },
  'dry-run': { label: 'dry-run', cls: 'text-blue-400 bg-blue-400/10' },
  skipped: { label: 'skipped', cls: 'text-gray-500 bg-gray-700/50' },
  failed: { label: 'failed', cls: 'text-red-400 bg-red-400/10' },
}

function execStatus(ev: LiveEvent): { label: string; cls: string } {
  if (ev.data.executionStatus) return EXEC_BADGE[ev.data.executionStatus] ?? EXEC_BADGE.failed
  if (ev.data.signalStatus === 'skipped') return EXEC_BADGE.skipped
  return EXEC_BADGE.failed
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

// Refresh relative timestamps every 30s.
const tick = ref(0)
let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => tick.value++, 30_000) })
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="overflow-x-auto">
    <!-- Empty state -->
    <div v-if="!loading && !events.length" class="py-12 text-center text-gray-500 text-sm">
      No live events yet — waiting for whale activity…
    </div>

    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th class="pb-2 pr-3 font-medium w-4" />
          <th class="pb-2 pr-4 font-medium">Time</th>
          <th class="pb-2 pr-4 font-medium">Whale</th>
          <th class="pb-2 pr-4 font-medium">Market</th>
          <th class="pb-2 pr-4 font-medium">Outcome</th>
          <th class="pb-2 pr-4 font-medium text-right">Size</th>
          <th class="pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="7" class="py-4"><USkeleton class="h-4 w-full" /></td>
        </tr>
        <template v-else>
          <!-- Use tick in key to force re-render of timestamps -->
          <tr
            v-for="ev in events"
            :key="`${ev.id}-${tick}`"
            class="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
          >
            <!-- Severity dot -->
            <td class="py-2 pr-3">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="SEVERITY_DOT[ev.severity] ?? 'bg-gray-600'"
              />
            </td>

            <!-- Time -->
            <td class="py-2 pr-4 text-gray-400 whitespace-nowrap text-xs">
              {{ msAgo(ev.detectedAt) }}
            </td>

            <!-- Wallet -->
            <td class="py-2 pr-4">
              <NuxtLink
                :to="`/whales/${ev.data.wallet}`"
                class="font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {{ truncate(ev.data.wallet, 6) }}…{{ ev.data.wallet.slice(-4) }}
              </NuxtLink>
            </td>

            <!-- Market -->
            <td class="py-2 pr-4 max-w-xs">
              <span v-if="ev.question" class="text-gray-300 text-xs">
                {{ truncate(ev.question, 55) }}
              </span>
              <span v-else class="text-gray-600 font-mono text-xs">
                {{ ev.marketId.slice(0, 10) }}…
              </span>
            </td>

            <!-- Outcome -->
            <td class="py-2 pr-4 text-gray-300 text-xs whitespace-nowrap">
              {{ ev.data.outcome }}
            </td>

            <!-- Size -->
            <td class="py-2 pr-4 text-right font-mono text-xs whitespace-nowrap">
              <span :class="ev.data.usdcSize >= 10_000 ? 'text-red-400' : ev.data.usdcSize >= 1_000 ? 'text-yellow-400' : 'text-gray-300'">
                {{ formatUsdc(ev.data.usdcSize) }}
              </span>
            </td>

            <!-- Execution status -->
            <td class="py-2">
              <span
                class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                :class="execStatus(ev).cls"
              >
                {{ execStatus(ev).label }}
              </span>
              <p v-if="ev.data.skipReason" class="text-xs text-gray-600 mt-0.5">
                {{ ev.data.skipReason.split(':')[0].replace(/_/g, ' ') }}
              </p>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
