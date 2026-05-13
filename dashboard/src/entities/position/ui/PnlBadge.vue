<script setup lang="ts">
defineProps<{ pnl: number | null | undefined; size?: 'sm' | 'lg' }>()
</script>

<template>
  <span
    :class="[
      size === 'lg' ? 'text-lg font-bold' : 'text-sm font-medium',
      pnl == null ? 'text-gray-400' : pnl >= 0 ? 'text-green-400' : 'text-red-400',
    ]"
  >
    {{ pnl == null ? '—' : (pnl >= 0 ? '+' : '') + formatUsdc(pnl) }}
  </span>
</template>
