<script setup lang="ts">
import type { OpportunityRow } from '../../../entities/opportunity/model/types'

const props = defineProps<{
  rows: OpportunityRow[]
  loading?: boolean
  mini?: boolean
  sort?: string
}>()

const emit = defineEmits<{ (e: 'sort', key: string): void }>()

const selectedRow = ref<OpportunityRow | null>(null)
const isOpen = computed({
  get: () => selectedRow.value !== null,
  set: (v) => { if (!v) selectedRow.value = null },
})

const colSpan = computed(() => (props.mini ? 7 : 12))

function driftClass(drift: number | null): string {
  if (drift == null) return 'text-gray-400'
  if (drift > 0.02) return 'text-green-400'
  if (drift < -0.02) return 'text-red-400'
  return 'text-gray-400'
}

function gradeClass(grade: string): string {
  if (grade === 'A') return 'bg-green-500/20 text-green-400 border-green-500/30'
  if (grade === 'B') return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  if (grade === 'C') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

function sortIcon(key: string): string {
  if (props.sort !== key) return 'i-heroicons-arrows-up-down'
  return key === 'brier' ? 'i-heroicons-arrow-up' : 'i-heroicons-arrow-down'
}

function formatSize(size: number, avgPrice: number): string {
  const usdc = size * avgPrice
  if (usdc >= 1000) return `$${(usdc / 1000).toFixed(1)}k`
  return `$${Math.round(usdc)}`
}

function openDetail(row: OpportunityRow) {
  selectedRow.value = row
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th class="pb-2 pr-4 font-medium">Market</th>
          <th class="pb-2 pr-4 font-medium">Outcome</th>
          <th class="pb-2 pr-4 font-medium">Whale</th>
          <template v-if="!mini">
            <th class="pb-2 pr-4 font-medium text-right">
              <UTooltip text="Whale's position size in USDC (shares × avg entry price)">
                <button class="inline-flex items-center gap-1 hover:text-gray-300" @click="emit('sort', 'size')">
                  Size
                  <UIcon :name="sortIcon('size')" class="w-3 h-3" />
                </button>
              </UTooltip>
            </th>
            <th class="pb-2 pr-4 font-medium text-right">
              <UTooltip text="Win rate on resolved trades">
                <button class="inline-flex items-center gap-1 hover:text-gray-300" @click="emit('sort', 'win_rate')">
                  Win%
                  <UIcon :name="sortIcon('win_rate')" class="w-3 h-3" />
                </button>
              </UTooltip>
            </th>
            <th class="pb-2 pr-4 font-medium text-right">
              <UTooltip text="Return on investment (resolved trades)">
                <button class="inline-flex items-center gap-1 hover:text-gray-300" @click="emit('sort', 'roi')">
                  ROI
                  <UIcon :name="sortIcon('roi')" class="w-3 h-3" />
                </button>
              </UTooltip>
            </th>
            <th class="pb-2 pr-4 font-medium text-right">
              <UTooltip text="Calibration score — lower is better (0.25 = random)">
                <button class="inline-flex items-center gap-1 hover:text-gray-300" @click="emit('sort', 'brier')">
                  Brier
                  <UIcon :name="sortIcon('brier')" class="w-3 h-3" />
                </button>
              </UTooltip>
            </th>
          </template>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="Whale's average entry price">
              <span>Entry</span>
            </UTooltip>
          </th>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="Current market price for this outcome">
              <span>Now</span>
            </UTooltip>
          </th>
          <th class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="Price move since whale entered">
              <span>Drift</span>
            </UTooltip>
          </th>
          <th v-if="!mini" class="pb-2 pr-4 font-medium text-right">
            <UTooltip text="When the market resolves">
              <span>Ends</span>
            </UTooltip>
          </th>
          <th class="pb-2 font-medium text-right">
            <UTooltip text="Composite whale quality score (0–100). Formula: Brier calibration 40% + Win rate 35% + ROI 15% + p-value significance 10%, with freshness decay over 72h. A ≥ 80 · B ≥ 60 · C ≥ 40 · D < 40">
              <button v-if="!mini" class="inline-flex items-center gap-1 hover:text-gray-300" @click="emit('sort', 'score')">
                Score
                <UIcon :name="sortIcon('score')" class="w-3 h-3" />
              </button>
              <span v-else>Score</span>
            </UTooltip>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="colSpan" class="py-4">
            <USkeleton class="h-4 w-full" />
          </td>
        </tr>
        <tr v-else-if="!rows.length">
          <td :colspan="colSpan" class="py-8 text-center text-gray-500">No opportunities found</td>
        </tr>
        <tr
          v-for="r in rows"
          v-else
          :key="`${r.wallet_address}-${r.condition_id}-${r.outcome}`"
          class="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer"
          @click="openDetail(r)"
        >
          <td class="py-2 pr-4 max-w-xs" @click.stop>
            <MarketLink v-if="r.question" :question="r.question" :event-slug="r.event_slug" :max-len="mini ? 35 : 55" />
            <span v-else class="text-gray-500 font-mono text-xs">{{ r.condition_id.slice(0, 10) }}…</span>
          </td>
          <td class="py-2 pr-4 text-gray-300">{{ r.outcome }}</td>
          <td class="py-2 pr-4" @click.stop><AddressTag :address="r.wallet_address" short /></td>
          <template v-if="!mini">
            <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ formatSize(r.size, r.avg_price) }}</td>
            <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ formatPct(r.win_rate) }}</td>
            <td
              class="py-2 pr-4 text-right font-mono"
              :class="(r.roi ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'"
            >
              {{ r.roi != null ? (r.roi >= 0 ? '+' : '') + formatPct(r.roi) : '—' }}
            </td>
            <td class="py-2 pr-4 text-right font-mono text-gray-300">
              {{ r.brier_score != null ? r.brier_score.toFixed(3) : '—' }}
            </td>
          </template>
          <td class="py-2 pr-4 text-right font-mono text-gray-400">{{ (r.avg_price * 100).toFixed(1) }}¢</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">
            {{ r.current_prob != null ? (r.current_prob * 100).toFixed(1) + '¢' : '—' }}
          </td>
          <td class="py-2 pr-4 text-right font-mono" :class="driftClass(r.drift)">
            {{ r.drift != null ? (r.drift > 0 ? '+' : '') + (r.drift * 100).toFixed(1) + '¢' : '—' }}
          </td>
          <td v-if="!mini" class="py-2 pr-4 text-right font-mono text-xs" :class="endsInClass(r.end_date_iso)">
            {{ formatEndsIn(r.end_date_iso) }}
          </td>
          <td class="py-2 text-right">
            <span
              class="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold border"
              :class="gradeClass(r.grade)"
            >{{ r.grade }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Market detail slide-over -->
  <USlideover v-model="isOpen" side="right" :ui="{ width: 'max-w-lg' }">
    <div v-if="selectedRow" class="flex flex-col h-full bg-gray-950 overflow-y-auto">
      <!-- Header -->
      <div class="flex items-start justify-between gap-3 p-4 border-b border-gray-800">
        <div class="flex-1 min-w-0">
          <p class="text-xs text-gray-500 mb-1">{{ selectedRow.outcome }} · {{ selectedRow.condition_id.slice(0, 8) }}…</p>
          <h3 class="text-sm font-medium text-white leading-snug">
            {{ selectedRow.question ?? 'Unknown market' }}
          </h3>
        </div>
        <button class="text-gray-500 hover:text-gray-300 shrink-0 mt-0.5" @click="selectedRow = null">
          <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
        </button>
      </div>

      <!-- Quick stats -->
      <div class="grid grid-cols-3 gap-px bg-gray-800 border-b border-gray-800">
        <div class="bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-500 mb-0.5">Entry</p>
          <p class="font-mono text-sm text-gray-200">{{ (selectedRow.avg_price * 100).toFixed(1) }}¢</p>
        </div>
        <div class="bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-500 mb-0.5">Now</p>
          <p class="font-mono text-sm text-gray-200">
            {{ selectedRow.current_prob != null ? (selectedRow.current_prob * 100).toFixed(1) + '¢' : '—' }}
          </p>
        </div>
        <div class="bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-500 mb-0.5">Drift</p>
          <p class="font-mono text-sm" :class="driftClass(selectedRow.drift)">
            {{ selectedRow.drift != null ? (selectedRow.drift > 0 ? '+' : '') + (selectedRow.drift * 100).toFixed(1) + '¢' : '—' }}
          </p>
        </div>
        <div class="bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-500 mb-0.5">Size</p>
          <p class="font-mono text-sm text-gray-200">{{ formatSize(selectedRow.size, selectedRow.avg_price) }}</p>
        </div>
        <div class="bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-500 mb-0.5">Score</p>
          <p class="text-sm font-bold" :class="gradeClass(selectedRow.grade)">
            {{ selectedRow.grade }} ({{ selectedRow.score.toFixed(0) }})
          </p>
        </div>
        <div class="bg-gray-950 px-4 py-3">
          <p class="text-xs text-gray-500 mb-0.5">Ends</p>
          <p class="font-mono text-xs" :class="endsInClass(selectedRow.end_date_iso)">
            {{ formatEndsIn(selectedRow.end_date_iso) }}
          </p>
        </div>
      </div>

      <!-- Price chart -->
      <div class="p-4 border-b border-gray-800">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-heroicons-chart-bar-square" class="w-4 h-4 text-gray-500" />
          <h4 class="text-xs font-medium text-gray-400 uppercase tracking-wide">Price History</h4>
        </div>
        <PriceHistoryChart
          :condition-id="selectedRow.condition_id"
          :outcome="selectedRow.outcome"
          :wallet-address="selectedRow.wallet_address"
          :avg-price="selectedRow.avg_price"
          :current-prob="selectedRow.current_prob"
        />
      </div>

      <!-- Whale quality metrics -->
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-gray-500" />
          <h4 class="text-xs font-medium text-gray-400 uppercase tracking-wide">Whale Quality</h4>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">Wallet</span>
            <AddressTag :address="selectedRow.wallet_address" short />
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Win rate</span>
            <span class="font-mono text-gray-300">{{ formatPct(selectedRow.win_rate) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">ROI</span>
            <span class="font-mono" :class="(selectedRow.roi ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'">
              {{ selectedRow.roi != null ? (selectedRow.roi >= 0 ? '+' : '') + formatPct(selectedRow.roi) : '—' }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Brier score</span>
            <span class="font-mono text-gray-300">
              {{ selectedRow.brier_score != null ? selectedRow.brier_score.toFixed(3) : '—' }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Resolved trades</span>
            <span class="font-mono text-gray-300">{{ selectedRow.resolved_trades }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Type</span>
            <span v-if="selectedRow.is_sharp" class="text-blue-400 text-xs font-medium">Sharp</span>
            <span v-else-if="selectedRow.is_profitable" class="text-green-400 text-xs font-medium">Profitable</span>
          </div>
        </div>
      </div>
    </div>
  </USlideover>
</template>
