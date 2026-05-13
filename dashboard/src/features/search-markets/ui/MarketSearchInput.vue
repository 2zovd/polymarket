<script setup lang="ts">
defineProps<{ modelValue: string }>()
defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <UInput
    :model-value="modelValue"
    placeholder="Search markets…"
    icon="i-heroicons-magnifying-glass"
    size="sm"
    class="w-64"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
