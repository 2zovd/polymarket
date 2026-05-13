<script setup lang="ts">
import type { WatchedPositionRow } from '../../../entities/whale/model/types'
const props = defineProps<{ positions: WatchedPositionRow[] }>()

const liveOnly = ref(true)

const displayed = computed(() =>
  liveOnly.value
    ? props.positions.filter((p) => p.accepting_orders === 1)
    : props.positions,
)

function seenClass(dateStr: string | null | undefined): string {
  if (!dateStr) return 'text-gray-400'
  const hAgo = (Date.now() - new Date(dateStr).getTime()) / 3_600_000
  if (hAgo < 24) return 'text-green-400'
  if (hAgo < 168) return 'text-yellow-400'
  return 'text-red-400'
}

function isVeryStale(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return (Date.now() - new Date(dateStr).getTime()) > 7 * 24 * 3_600_000
}
</script>

<template>
  <div class="overflow-x-auto">
    <!-- Filter toggle -->
    <div class="flex items-center gap-2 mb-3">
      <UToggle v-model="liveOnly" size="xs" />
      <span class="text-xs text-gray-400">Live markets only</span>
      <span class="text-xs text-gray-600">({{ displayed.length }} / {{ positions.length }})</span>
    </div>

    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th class="pb-2 pr-4 font-medium">Market</th>
          <th class="pb-2 pr-4 font-medium">Outcome</th>
          <th class="pb-2 pr-4 font-medium text-right">Size</th>
          <th class="pb-2 pr-4 font-medium text-right">Avg Price</th>
          <th class="pb-2 pr-4 font-medium text-right">Exposure</th>
          <th class="pb-2 pr-4 font-medium">Probability</th>
          <th class="pb-2 font-medium">Seen</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!displayed.length">
          <td colspan="7" class="py-6 text-center text-gray-500">
            {{ liveOnly ? 'No live positions' : 'No watched positions' }}
          </td>
        </tr>
        <tr
          v-for="p in displayed"
          v-else
          :key="p.token_id"
          :class="['border-b border-gray-800/50 hover:bg-gray-800/20 transition-opacity', isVeryStale(p.updated_at) ? 'opacity-50' : '']"
        >
          <td class="py-2 pr-4 max-w-xs">
            <MarketLink v-if="p.question" :question="p.question" :event-slug="p.event_slug" :max-len="50" />
            <span v-else class="text-gray-500 font-mono text-xs">{{ p.condition_id.slice(0, 10) }}…</span>
          </td>
          <td class="py-2 pr-4 text-gray-300">{{ p.outcome }}</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ p.size.toFixed(0) }}</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ (p.avg_price * 100).toFixed(1) }}¢</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ formatUsdc(p.size * p.avg_price) }}</td>
          <td class="py-2 pr-4"><ProbabilityBar :outcome-prices="p.outcome_prices" :outcomes="null" /></td>
          <td class="py-2 text-xs" :class="seenClass(p.updated_at)">{{ timeAgo(p.updated_at) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
