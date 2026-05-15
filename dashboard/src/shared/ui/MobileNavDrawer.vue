<script setup lang="ts">
import SidebarNav from '~/src/widgets/bot-status/ui/SidebarNav.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()
</script>

<template>
  <USlideover
    :model-value="props.modelValue"
    side="left"
    :ui="{ width: 'max-w-52' }"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="flex flex-col h-full bg-gray-950">
      <div class="flex justify-end p-2 shrink-0">
        <UButton
          icon="i-heroicons-x-mark"
          variant="ghost"
          color="gray"
          @click="emit('update:modelValue', false)"
        />
      </div>
      <div class="flex-1 overflow-y-auto">
        <SidebarNav />
      </div>
    </div>
  </USlideover>
</template>
