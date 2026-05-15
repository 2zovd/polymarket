<script setup lang="ts">
import type { MarketCandidate } from '../../../entities/market/model/types'
import { endsInClass, formatEndsIn } from '../../../shared/lib/time'
defineProps<{ candidates: MarketCandidate[] }>()
</script>

<template>
  <div class="space-y-2">
    <div v-if="!candidates.length" class="text-center text-gray-500 py-6">
      No candidates — no sharp/profitable whales in active markets
    </div>
    <div
      v-for="c in candidates"
      :key="c.condition_id"
      class="flex items-center gap-3 p-3 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
    >
      <div class="flex-1 min-w-0">
        <MarketLink :question="c.question" :event-slug="c.event_slug" :max-len="65" />
        <div class="flex items-center gap-3 mt-1 text-xs">
          <span :class="endsInClass(c.end_date_iso)">Expires in {{ formatEndsIn(c.end_date_iso) }}</span>
          <span v-if="c.outcomes_held" class="text-gray-500">Held: {{ c.outcomes_held }}</span>
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="flex items-center justify-end gap-1.5 mb-0.5">
          <UBadge
            :color="c.accepting_orders ? 'green' : 'gray'"
            variant="subtle"
            size="xs"
          >{{ c.accepting_orders ? 'Open' : 'Closed' }}</UBadge>
        </div>
        <div class="text-sm font-bold text-white">{{ c.whale_count }} whale{{ c.whale_count > 1 ? 's' : '' }}</div>
        <div class="text-xs text-gray-400">{{ formatUsdc(c.total_exposure) }} exposure</div>
      </div>
      <ProbabilityBar :outcome-prices="c.outcome_prices" :outcomes="c.outcomes" />
    </div>
  </div>
</template>
