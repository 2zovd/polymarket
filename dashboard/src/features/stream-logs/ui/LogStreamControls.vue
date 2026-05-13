<script setup lang="ts">
const props = defineProps<{
  paused: boolean
  connected: boolean
  levelFilter: string
}>()

const emit = defineEmits<{
  (e: 'update:paused', v: boolean): void
  (e: 'update:levelFilter', v: string): void
  (e: 'clear'): void
}>()

const levelOptions = [
  { label: 'All', value: 'all' },
  { label: 'Info+', value: 'info' },
  { label: 'Warn+', value: 'warn' },
  { label: 'Error', value: 'error' },
]
</script>

<template>
  <div class="flex items-center gap-3 flex-wrap">
    <UBadge :color="connected ? 'green' : 'red'" variant="subtle" size="xs">
      {{ connected ? 'Live' : 'Disconnected' }}
    </UBadge>
    <UButton
      size="xs"
      :icon="paused ? 'i-heroicons-play' : 'i-heroicons-pause'"
      :color="paused ? 'green' : 'gray'"
      variant="outline"
      @click="emit('update:paused', !paused)"
    >{{ paused ? 'Resume' : 'Pause' }}</UButton>
    <UButton size="xs" icon="i-heroicons-trash" color="gray" variant="ghost" @click="emit('clear')">Clear</UButton>
    <div class="flex gap-1 ml-auto">
      <UButton
        v-for="opt in levelOptions"
        :key="opt.value"
        size="xs"
        :variant="levelFilter === opt.value ? 'solid' : 'outline'"
        :color="levelFilter === opt.value ? 'primary' : 'gray'"
        @click="emit('update:levelFilter', opt.value)"
      >{{ opt.label }}</UButton>
    </div>
  </div>
</template>
