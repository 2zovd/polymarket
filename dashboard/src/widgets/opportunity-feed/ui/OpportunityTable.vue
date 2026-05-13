<script setup lang="ts">
import type { OpportunityRow } from '../../../entities/opportunity/model/types'

const props = defineProps<{
  rows: OpportunityRow[]
  loading?: boolean
  mini?: boolean
  sort?: string
}>()

const emit = defineEmits<{ (e: 'sort', key: string): void }>()

const colSpan = computed(() => (props.mini ? 7 : 10))

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
          <th class="pb-2 font-medium text-right">
            <UTooltip text="Quality score: A ≥ 80, B ≥ 60, C ≥ 40, D < 40">
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
          class="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
        >
          <td class="py-2 pr-4 max-w-xs">
            <MarketLink v-if="r.question" :question="r.question" :event-slug="r.event_slug" :max-len="mini ? 35 : 55" />
            <span v-else class="text-gray-500 font-mono text-xs">{{ r.condition_id.slice(0, 10) }}…</span>
          </td>
          <td class="py-2 pr-4 text-gray-300">{{ r.outcome }}</td>
          <td class="py-2 pr-4"><AddressTag :address="r.wallet_address" short /></td>
          <template v-if="!mini">
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
</template>
