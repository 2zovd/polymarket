<script setup lang="ts">
import type { ResolvedPositionRow } from '../../../entities/position/model/types'

defineProps<{ positions: ResolvedPositionRow[]; loading?: boolean }>()
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th class="pb-2 pr-4 font-medium">Market</th>
          <th class="pb-2 pr-4 font-medium">Outcome</th>
          <th class="pb-2 pr-4 font-medium text-right">Size</th>
          <th class="pb-2 pr-4 font-medium text-right">Entry</th>
          <th class="pb-2 pr-4 font-medium text-right">Payout</th>
          <th class="pb-2 pr-4 font-medium text-right">P&amp;L</th>
          <th class="pb-2 pr-4 font-medium">Resolved</th>
          <th class="pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="8"><USkeleton class="h-4 w-full mt-2" /></td>
        </tr>
        <tr v-else-if="!positions.length">
          <td colspan="8" class="py-8 text-center text-gray-500">No resolved positions</td>
        </tr>
        <tr
          v-for="p in positions"
          v-else
          :key="p.id"
          class="border-b border-gray-800/50 hover:bg-gray-800/20"
        >
          <td class="py-2 pr-4 max-w-xs">
            <MarketLink v-if="p.question" :question="p.question" :event-slug="p.event_slug" :max-len="45" />
            <span v-else class="text-gray-500">—</span>
          </td>
          <td class="py-2 pr-4 text-gray-300">{{ p.outcome }}</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ formatUsdc(p.size) }}</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-400">{{ (p.entry_price * 100).toFixed(1) }}¢</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ formatUsdc(p.payout) }}</td>
          <td class="py-2 pr-4 text-right"><PnlBadge :pnl="p.pnl" /></td>
          <td class="py-2 pr-4 text-gray-400 whitespace-nowrap">{{ formatIso(p.resolved_at) }}</td>
          <td class="py-2">
            <UBadge :color="p.status === 'won' ? 'green' : 'red'" variant="subtle" size="xs">
              {{ p.status === 'won' ? 'Won' : 'Lost' }}
            </UBadge>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
