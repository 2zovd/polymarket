<script setup lang="ts">
import type { OpenPositionRow } from '../../../entities/position/model/types'

defineProps<{ positions: OpenPositionRow[]; loading?: boolean }>()
</script>

<template>
  <div>
    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <USkeleton v-for="i in 4" :key="i" class="h-24" />
    </div>
    <div v-else-if="!positions.length" class="text-center text-gray-500 py-8">
      No open positions
    </div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <UCard
        v-for="pos in positions"
        :key="pos.id"
        class="border border-gray-700"
      >
        <div class="space-y-2">
          <MarketLink
            v-if="pos.question"
            :question="pos.question"
            :event-slug="pos.event_slug"
            :max-len="55"
          />
          <div class="flex items-center justify-between">
            <UBadge color="blue" variant="subtle" size="xs">{{ pos.outcome }}</UBadge>
            <UBadge v-if="pos.is_dry_run" color="yellow" variant="subtle" size="xs">Dry Run</UBadge>
          </div>
          <div class="grid grid-cols-3 gap-1 text-xs">
            <div>
              <div class="text-gray-500">Size</div>
              <div class="text-white font-mono">{{ formatUsdc(pos.size) }}</div>
            </div>
            <div>
              <div class="text-gray-500">Entry</div>
              <div class="text-white font-mono">{{ (pos.entry_price * 100).toFixed(1) }}¢</div>
            </div>
            <div>
              <div class="text-gray-500">Whale @</div>
              <div class="text-white font-mono">{{ (pos.whale_avg_price * 100).toFixed(1) }}¢</div>
            </div>
          </div>
          <div class="flex items-center justify-between text-xs text-gray-500">
            <AddressTag :address="pos.wallet_address" short />
            <span>{{ timeAgo(pos.entry_at) }}</span>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
