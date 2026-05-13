<script setup lang="ts">
import type { SignalStatus } from '../model/types'

const props = defineProps<{ status: SignalStatus }>()

const config = computed(() => {
  const map: Record<SignalStatus, { color: string; label: string }> = {
    executed: { color: 'green', label: 'Executed' },
    'dry-run': { color: 'blue', label: 'Dry Run' },
    skipped: { color: 'yellow', label: 'Skipped' },
    error: { color: 'red', label: 'Error' },
  }
  return map[props.status] ?? { color: 'gray', label: props.status }
})
</script>

<template>
  <UBadge :color="config.color as any" variant="subtle" size="xs">{{ config.label }}</UBadge>
</template>
