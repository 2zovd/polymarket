<script setup lang="ts">
defineProps<{ modelValue: boolean }>()
defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>

<template>
  <div class="flex items-center gap-2">
    <UToggle
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <span class="text-sm text-gray-400">Include Dry Run</span>
  </div>
</template>
