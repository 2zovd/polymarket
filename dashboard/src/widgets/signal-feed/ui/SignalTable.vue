<script setup lang="ts">
import type { SignalRow } from '../../../entities/signal/model/types'

const props = defineProps<{
  signals: SignalRow[]
  loading?: boolean
  mini?: boolean
}>()

const emit = defineEmits<{ (e: 'select', signal: SignalRow): void }>()
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th class="pb-2 pr-4 font-medium">Time</th>
          <th class="pb-2 pr-4 font-medium">Whale</th>
          <th class="pb-2 pr-4 font-medium">Market</th>
          <th class="pb-2 pr-4 font-medium">Outcome</th>
          <th class="pb-2 pr-4 font-medium text-right">Edge</th>
          <th class="pb-2 pr-4 font-medium text-right">Kelly</th>
          <th class="pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="7" class="py-4">
            <USkeleton class="h-4 w-full" />
          </td>
        </tr>
        <tr v-else-if="!signals.length">
          <td colspan="7" class="py-8 text-center text-gray-500">No signals found</td>
        </tr>
        <template v-else>
          <tr
            v-for="s in signals"
            :key="s.id"
            class="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors"
            @click="emit('select', s)"
          >
            <td class="py-2 pr-4 text-gray-400 whitespace-nowrap">{{ formatIso(s.created_at) }}</td>
            <td class="py-2 pr-4"><AddressTag :address="s.wallet_address" short /></td>
            <td class="py-2 pr-4 max-w-xs">
              <MarketLink
                v-if="s.question"
                :question="s.question"
                :event-slug="s.event_slug"
                :max-len="mini ? 40 : 60"
              />
              <span v-else class="text-gray-500 font-mono text-xs">{{ s.condition_id.slice(0, 10) }}…</span>
            </td>
            <td class="py-2 pr-4 text-gray-300">{{ s.outcome }}</td>
            <td class="py-2 pr-4 text-right font-mono">
              <span :class="s.edge > 0 ? 'text-green-400' : 'text-gray-400'">
                {{ s.edge > 0 ? '+' : '' }}{{ (s.edge * 100).toFixed(1) }}¢
              </span>
            </td>
            <td class="py-2 pr-4 text-right font-mono text-gray-300">
              {{ formatUsdc(s.kelly_size) }}
            </td>
            <td class="py-2">
              <div class="flex flex-col gap-0.5">
                <SignalStatusBadge :status="s.status" />
                <span v-if="s.skip_reason" class="text-xs text-gray-500">{{ formatSkipReason(s.skip_reason) }}</span>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
