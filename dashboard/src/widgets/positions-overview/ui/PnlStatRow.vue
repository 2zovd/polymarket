<script setup lang="ts">
import type { PositionStats } from '../../../entities/position/model/types'

const props = defineProps<{ stats: PositionStats | null; isDryRun: boolean }>()

const bucket = computed(() => props.isDryRun ? props.stats?.dryRun : props.stats?.live)

const totalInvested = computed(() =>
  bucket.value ? Object.values(bucket.value).reduce((s, v) => s + v.invested, 0) : 0,
)
const totalPnl = computed(() =>
  bucket.value ? Object.values(bucket.value).reduce((s, v) => s + v.pnl, 0) : 0,
)
const totalPayout = computed(() =>
  bucket.value ? Object.values(bucket.value).reduce((s, v) => s + v.payout, 0) : 0,
)
const wonCount = computed(() => bucket.value?.won?.count ?? 0)
const lostCount = computed(() => bucket.value?.lost?.count ?? 0)
const winRate = computed(() => {
  const total = wonCount.value + lostCount.value
  return total > 0 ? wonCount.value / total : null
})
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Invested</div>
      <div class="text-lg font-bold text-white">{{ formatUsdc(totalInvested) }}</div>
    </UCard>
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Payout</div>
      <div class="text-lg font-bold text-white">{{ formatUsdc(totalPayout) }}</div>
    </UCard>
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Net P&amp;L</div>
      <PnlBadge :pnl="totalPnl" size="lg" />
    </UCard>
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Win Rate</div>
      <div class="text-lg font-bold text-white">{{ winRate != null ? formatPct(winRate) : '—' }}</div>
    </UCard>
    <UCard>
      <div class="text-xs text-gray-500 mb-1">Won / Lost</div>
      <div class="text-lg font-bold">
        <span class="text-green-400">{{ wonCount }}</span>
        <span class="text-gray-500"> / </span>
        <span class="text-red-400">{{ lostCount }}</span>
      </div>
    </UCard>
  </div>
</template>
