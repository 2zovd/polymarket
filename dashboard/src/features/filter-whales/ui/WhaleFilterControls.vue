<script setup lang="ts">
const props = defineProps<{
  filter: string
  sort: string
  filterOptions: { label: string; value: string }[]
  sortOptions: { label: string; value: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:filter', v: string): void
  (e: 'sort', v: string): void
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex gap-1">
      <UButton
        v-for="opt in filterOptions"
        :key="opt.value"
        size="xs"
        :variant="filter === opt.value ? 'solid' : 'outline'"
        :color="filter === opt.value ? 'primary' : 'gray'"
        @click="emit('update:filter', opt.value)"
      >{{ opt.label }}</UButton>
    </div>
    <div class="flex gap-1 ml-auto items-center">
      <span class="text-xs text-gray-500">Sort:</span>
      <UButton
        v-for="opt in sortOptions"
        :key="opt.value"
        size="xs"
        :variant="sort === opt.value ? 'solid' : 'ghost'"
        :color="sort === opt.value ? 'primary' : 'gray'"
        @click="emit('sort', opt.value)"
      >{{ opt.label }}</UButton>
    </div>
  </div>
</template>
