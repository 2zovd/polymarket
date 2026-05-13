<script setup lang="ts">
defineProps<{ isSharp: boolean; isProfitable: boolean }>()
</script>

<template>
  <span class="inline-flex gap-1">
    <UBadge v-if="isSharp" color="blue" variant="subtle" size="xs">Sharp</UBadge>
    <UBadge v-else-if="isProfitable" color="green" variant="subtle" size="xs">Profitable</UBadge>
    <UBadge v-else color="gray" variant="subtle" size="xs">Tracked</UBadge>
  </span>
</template>
