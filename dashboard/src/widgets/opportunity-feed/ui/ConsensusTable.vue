<script setup lang="ts">
interface WhaleDetail {
  wallet_address: string
  size: number
  avg_price: number
  win_rate: number | null
  roi: number | null
  brier_score: number | null
  is_sharp: number
  is_profitable: number
}

interface ConsensusRow {
  condition_id: string
  outcome: string
  whale_count: number
  total_usdc: number
  weighted_avg_entry: number
  question: string | null
  event_slug: string | null
  end_date_iso: string | null
  current_prob: number | null
  drift: number | null
  whales: WhaleDetail[]
}

interface AnomalyMeta {
  outcome: string
  whale_count: number
  earliest_entry: string | null
  latest_entry: string | null
  window_hours: string | null
}

interface Anomaly {
  id: number
  type: string
  market_id: string | null
  severity: string
  detected_at: string
  metadata: AnomalyMeta
}

const props = defineProps<{
  rows: ConsensusRow[]
  loading?: boolean
  sort?: string
}>()

const emit = defineEmits<{ (e: 'sort', key: string): void }>()

const expanded = ref(new Set<string>())

function rowKey(r: ConsensusRow): string {
  return `${r.condition_id}-${r.outcome}`
}

function toggleExpand(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}

function driftClass(drift: number | null): string {
  if (drift == null) return 'text-gray-400'
  if (drift > 0.02) return 'text-green-400'
  if (drift < -0.02) return 'text-red-400'
  return 'text-gray-400'
}

function formatTotal(usdc: number): string {
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(2)}M`
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}k`
  return `$${Math.round(usdc)}`
}

function formatSize(size: number, avgPrice: number): string {
  const usdc = size * avgPrice
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}k`
  return `$${Math.round(usdc)}`
}

function sortIcon(key: string): string {
  return props.sort === key ? 'i-heroicons-arrow-down' : 'i-heroicons-arrows-up-down'
}

// Fetch coordinated-entry anomalies for all visible markets
const marketIds = computed(() =>
  [...new Set(props.rows.map((r) => r.condition_id))].join(','),
)

const { data: anomalyData } = useFetch<{ data: Anomaly[] }>('/api/anomalies', {
  query: computed(() => ({ marketIds: marketIds.value, type: 'coordinated_entry' })),
  server: false,
  watch: [marketIds],
})

// Build a lookup: `${condition_id}-${outcome}` → anomaly
const clusterMap = computed(() => {
  const map = new Map<string, Anomaly>()
  for (const a of anomalyData.value?.data ?? []) {
    if (a.market_id && a.metadata?.outcome) {
      const key = `${a.market_id}-${a.metadata.outcome}`
      // Keep the most recent anomaly per key (data is already DESC)
      if (!map.has(key)) map.set(key, a)
    }
  }
  return map
})

function clusterAnomaly(r: ConsensusRow): Anomaly | null {
  return clusterMap.value.get(rowKey(r)) ?? null
}

function clusterBadgeClass(severity: string): string {
  if (severity === 'high') return 'bg-orange-500/20 text-orange-400 border-orange-500/40'
  if (severity === 'medium') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
  return 'bg-gray-600/20 text-gray-400 border-gray-600/40'
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th class="pb-2 pr-2 w-6"></th>
          <th class="pb-2 pr-4 font-medium">Market</th>
          <th class="pb-2 pr-4 font-medium">Outcome</th>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="Number of tracked whales holding this position">
              <button class="inline-flex items-center gap-1 hover:text-gray-300" @click="emit('sort', 'whale_count')">
                Whales
                <UIcon :name="sortIcon('whale_count')" class="w-3 h-3" />
              </button>
            </UTooltip>
          </th>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="Total USDC committed by all tracked whales on this outcome">
              <button class="inline-flex items-center gap-1 hover:text-gray-300" @click="emit('sort', 'total_usdc')">
                Total $
                <UIcon :name="sortIcon('total_usdc')" class="w-3 h-3" />
              </button>
            </UTooltip>
          </th>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="Dollar-weighted average entry price across all whales (total USDC ÷ total shares)">
              <span>Avg entry</span>
            </UTooltip>
          </th>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="Current market price for this outcome">
              <span>Now</span>
            </UTooltip>
          </th>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="Price move since whales' weighted average entry">
              <span>Drift</span>
            </UTooltip>
          </th>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="When the market resolves">
              <span>Ends</span>
            </UTooltip>
          </th>
          <th class="pb-2 font-medium text-right">Signal</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="10" class="py-4">
            <USkeleton class="h-4 w-full" />
          </td>
        </tr>
        <tr v-else-if="!rows.length">
          <td colspan="10" class="py-8 text-center text-gray-500">No consensus positions found</td>
        </tr>
        <template v-for="r in rows" v-else :key="rowKey(r)">
          <tr
            class="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer select-none"
            @click="toggleExpand(rowKey(r))"
          >
            <td class="py-2 pr-2 text-gray-500">
              <UIcon
                :name="expanded.has(rowKey(r)) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                class="w-4 h-4"
              />
            </td>
            <td class="py-2 pr-4 max-w-xs" @click.stop>
              <MarketLink v-if="r.question" :question="r.question" :event-slug="r.event_slug" :max-len="55" />
              <span v-else class="text-gray-500 font-mono text-xs">{{ r.condition_id.slice(0, 10) }}…</span>
            </td>
            <td class="py-2 pr-4 text-gray-300">{{ r.outcome }}</td>
            <td class="py-2 pr-4 text-right font-mono text-blue-400 font-medium">
              {{ r.whale_count }} 🐋
            </td>
            <td class="py-2 pr-4 text-right font-mono text-white font-medium">{{ formatTotal(r.total_usdc) }}</td>
            <td class="py-2 pr-4 text-right font-mono text-gray-400">
              {{ (r.weighted_avg_entry * 100).toFixed(1) }}¢
            </td>
            <td class="py-2 pr-4 text-right font-mono text-gray-300">
              {{ r.current_prob != null ? (r.current_prob * 100).toFixed(1) + '¢' : '—' }}
            </td>
            <td class="py-2 pr-4 text-right font-mono" :class="driftClass(r.drift)">
              {{ r.drift != null ? (r.drift > 0 ? '+' : '') + (r.drift * 100).toFixed(1) + '¢' : '—' }}
            </td>
            <td class="py-2 pr-4 text-right font-mono text-xs" :class="endsInClass(r.end_date_iso)">
              {{ formatEndsIn(r.end_date_iso) }}
            </td>
            <td class="py-2 text-right">
              <UTooltip
                v-if="clusterAnomaly(r)"
                :text="`${clusterAnomaly(r)!.metadata.whale_count} whales entered within ${clusterAnomaly(r)!.metadata.window_hours}h`"
              >
                <span
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border"
                  :class="clusterBadgeClass(clusterAnomaly(r)!.severity)"
                >
                  <UIcon name="i-heroicons-bolt" class="w-3 h-3" />
                  Cluster
                </span>
              </UTooltip>
            </td>
          </tr>

          <tr v-if="expanded.has(rowKey(r))" class="bg-gray-900/50">
            <td></td>
            <td colspan="9" class="pt-1 pb-2">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-gray-600">
                    <th class="py-1 pr-4 font-medium text-left pl-2">Whale</th>
                    <th class="py-1 pr-4 font-medium text-right">Size</th>
                    <th class="py-1 pr-4 font-medium text-right">Entry</th>
                    <th class="py-1 pr-4 font-medium text-right">Win%</th>
                    <th class="py-1 pr-4 font-medium text-right">ROI</th>
                    <th class="py-1 pr-4 font-medium text-right">Brier</th>
                    <th class="py-1 font-medium text-right">Type</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="w in r.whales"
                    :key="w.wallet_address"
                    class="border-t border-gray-800/30"
                  >
                    <td class="py-1 pr-4 pl-2">
                      <AddressTag :address="w.wallet_address" short />
                    </td>
                    <td class="py-1 pr-4 text-right font-mono text-gray-300">
                      {{ formatSize(w.size, w.avg_price) }}
                    </td>
                    <td class="py-1 pr-4 text-right font-mono text-gray-400">
                      {{ (w.avg_price * 100).toFixed(1) }}¢
                    </td>
                    <td class="py-1 pr-4 text-right font-mono text-gray-300">
                      {{ formatPct(w.win_rate) }}
                    </td>
                    <td
                      class="py-1 pr-4 text-right font-mono"
                      :class="(w.roi ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'"
                    >
                      {{ w.roi != null ? (w.roi >= 0 ? '+' : '') + formatPct(w.roi) : '—' }}
                    </td>
                    <td class="py-1 pr-4 text-right font-mono text-gray-300">
                      {{ w.brier_score != null ? w.brier_score.toFixed(3) : '—' }}
                    </td>
                    <td class="py-1 text-right">
                      <span v-if="w.is_sharp" class="text-blue-400">Sharp</span>
                      <span v-else-if="w.is_profitable" class="text-green-400">Profitable</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
