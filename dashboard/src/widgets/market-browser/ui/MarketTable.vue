<script setup lang="ts">
import type { MarketRow } from '../../../entities/market/model/types'
defineProps<{ markets: MarketRow[]; loading?: boolean }>()
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th class="pb-2 pr-4 font-medium">Market</th>
          <th class="pb-2 pr-4 font-medium text-right">Volume</th>
          <th class="pb-2 pr-4 font-medium text-right">Liquidity</th>
          <th class="pb-2 pr-4 font-medium">Probability</th>
          <th class="pb-2 pr-4 font-medium">Expires</th>
          <th class="pb-2 pr-4 font-medium">Status</th>
          <th class="pb-2 font-medium text-center">Whales</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="7"><USkeleton class="h-4 w-full mt-2" /></td>
        </tr>
        <tr v-else-if="!markets.length">
          <td colspan="7" class="py-8 text-center text-gray-500">No markets found</td>
        </tr>
        <tr
          v-for="m in markets"
          v-else
          :key="m.condition_id"
          class="border-b border-gray-800/50 hover:bg-gray-800/20"
        >
          <td class="py-2 pr-4 max-w-xs">
            <MarketLink :question="m.question" :event-slug="m.event_slug" :max-len="60" />
          </td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ formatUsdc(m.volume_num) }}</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-400">{{ formatUsdc(m.liquidity_num) }}</td>
          <td class="py-2 pr-4"><ProbabilityBar :outcome-prices="m.outcome_prices" :outcomes="m.outcomes" /></td>
          <td class="py-2 pr-4 text-gray-400 whitespace-nowrap">{{ formatIso(m.end_date_iso) }}</td>
          <td class="py-2 pr-4">
            <UBadge
              :color="m.accepting_orders ? 'green' : m.closed ? 'red' : 'yellow'"
              variant="subtle"
              size="xs"
            >{{ m.accepting_orders ? 'Open' : m.closed ? 'Closed' : 'Active' }}</UBadge>
          </td>
          <td class="py-2 text-center">
            <UBadge v-if="m.whale_count > 0" color="blue" variant="subtle" size="xs">
              {{ m.whale_count }}
            </UBadge>
            <span v-else class="text-gray-700">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
