<script setup lang="ts">
const props = defineProps<{ lastUpdated: Date | null; refreshing?: boolean }>()

const label = computed(() => {
  if (!props.lastUpdated) return 'Never updated'
  return `Updated ${timeAgo(props.lastUpdated.toISOString())}`
})
</script>

<template>
  <span class="inline-flex items-center gap-1 text-xs text-gray-500">
    <UIcon
      name="i-heroicons-arrow-path"
      class="w-3 h-3"
      :class="{ 'animate-spin': refreshing }"
    />
    {{ label }}
  </span>
</template>
