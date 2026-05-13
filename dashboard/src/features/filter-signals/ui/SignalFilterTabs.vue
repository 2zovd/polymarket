<script setup lang="ts">
const props = defineProps<{
  status: string
  since: string
  statusOptions: { label: string; value: string }[]
  sinceOptions: { label: string; value: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:status', v: string): void
  (e: 'update:since', v: string): void
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex gap-1">
      <UButton
        v-for="opt in statusOptions"
        :key="opt.value"
        size="xs"
        :variant="status === opt.value ? 'solid' : 'outline'"
        :color="status === opt.value ? 'primary' : 'gray'"
        @click="emit('update:status', opt.value)"
      >{{ opt.label }}</UButton>
    </div>
    <div class="flex gap-1 ml-auto">
      <UButton
        v-for="opt in sinceOptions"
        :key="opt.value"
        size="xs"
        :variant="since === opt.value ? 'solid' : 'outline'"
        :color="since === opt.value ? 'primary' : 'gray'"
        @click="emit('update:since', opt.value)"
      >{{ opt.label }}</UButton>
    </div>
  </div>
</template>
