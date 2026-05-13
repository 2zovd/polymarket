<script setup lang="ts">
import type { WhaleRow } from '../../../entities/whale/model/types'
defineProps<{ stats: WhaleRow }>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <AddressTag :address="stats.wallet_address" />
      <WhaleBadge :is-sharp="Boolean(stats.is_sharp)" :is-profitable="Boolean(stats.is_profitable)" />
    </div>
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <UCard>
        <div class="text-xs text-gray-500 mb-1">ROI</div>
        <div class="text-xl font-bold" :class="(stats.roi ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'">
          {{ stats.roi != null ? (stats.roi >= 0 ? '+' : '') + formatPct(stats.roi) : '—' }}
        </div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Win Rate</div>
        <div class="text-xl font-bold text-white">{{ formatPct(stats.win_rate) }}</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Resolved Trades</div>
        <div class="text-xl font-bold text-white">{{ stats.resolved_trades }}</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">Brier Score</div>
        <div class="text-xl font-bold text-white">{{ stats.brier_score?.toFixed(3) ?? '—' }}</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 mb-1">p-value</div>
        <div class="text-xl font-bold text-white">{{ stats.p_value?.toExponential(2) ?? '—' }}</div>
      </UCard>
    </div>
  </div>
</template>
