<script setup lang="ts">
const props = defineProps<{ page: number; total: number; pageSize: number }>()
const emit = defineEmits<{ (e: 'change', page: number): void }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>

<template>
  <div class="flex items-center justify-between text-sm text-gray-400">
    <span>{{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }}</span>
    <UPagination
      :model-value="page"
      :total="total"
      :page-size="pageSize"
      :max="5"
      @update:model-value="emit('change', $event)"
    />
  </div>
</template>
