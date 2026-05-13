<script setup lang="ts">
import type { WhaleRow } from '../../../entities/whale/model/types'

const props = defineProps<{
  whales: WhaleRow[]
  sort: string
  order: 'asc' | 'desc'
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'sort', key: string): void
  (e: 'select', whale: WhaleRow): void
}>()

function sortIcon(key: string) {
  if (props.sort !== key) return 'i-heroicons-arrows-up-down'
  return props.order === 'desc' ? 'i-heroicons-arrow-down' : 'i-heroicons-arrow-up'
}

function th(key: string, label: string, align = 'right') {
  return { key, label, align }
}

const cols = [
  { key: 'wallet_address', label: 'Wallet', align: 'left', sortable: false },
  { key: 'roi', label: 'ROI', align: 'right', sortable: true },
  { key: 'win_rate', label: 'Win Rate', align: 'right', sortable: true },
  { key: 'resolved_trades', label: 'Resolved', align: 'right', sortable: true },
  { key: 'brier_score', label: 'Brier', align: 'right', sortable: true },
  { key: 'avg_position_size_usdc', label: 'Avg Size', align: 'right', sortable: false },
  { key: 'watched_count', label: 'Positions', align: 'right', sortable: false },
  { key: 'badges', label: '', align: 'right', sortable: false },
]
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-gray-500 border-b border-gray-800">
          <th
            v-for="col in cols"
            :key="col.key"
            class="pb-2 pr-4 font-medium"
            :class="col.align === 'right' ? 'text-right' : ''"
          >
            <button
              v-if="col.sortable"
              class="inline-flex items-center gap-1 hover:text-gray-300"
              @click="emit('sort', col.key)"
            >
              {{ col.label }}
              <UIcon :name="sortIcon(col.key)" class="w-3 h-3" />
            </button>
            <span v-else>{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="8"><USkeleton class="h-4 w-full mt-2" /></td>
        </tr>
        <tr v-else-if="!whales.length">
          <td colspan="8" class="py-8 text-center text-gray-500">No whales found</td>
        </tr>
        <tr
          v-for="w in whales"
          v-else
          :key="w.wallet_address"
          class="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
          @click="emit('select', w)"
        >
          <td class="py-2 pr-4"><AddressTag :address="w.wallet_address" short /></td>
          <td class="py-2 pr-4 text-right font-mono" :class="(w.roi ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'">
            {{ w.roi != null ? (w.roi >= 0 ? '+' : '') + formatPct(w.roi) : '—' }}
          </td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">{{ formatPct(w.win_rate) }}</td>
          <td class="py-2 pr-4 text-right text-gray-300">{{ w.resolved_trades }}</td>
          <td class="py-2 pr-4 text-right font-mono text-gray-300">
            {{ w.brier_score != null ? w.brier_score.toFixed(3) : '—' }}
          </td>
          <td class="py-2 pr-4 text-right font-mono text-gray-400">{{ formatUsdc(w.avg_position_size_usdc) }}</td>
          <td class="py-2 pr-4 text-right text-gray-400">{{ w.watched_count }}</td>
          <td class="py-2 text-right">
            <WhaleBadge :is-sharp="Boolean(w.is_sharp)" :is-profitable="Boolean(w.is_profitable)" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
