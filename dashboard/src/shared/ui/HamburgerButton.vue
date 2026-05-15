<template>
  <UButton
    icon="i-heroicons-bars-3"
    variant="ghost"
    color="gray"
    @click="$emit('click')"
  />
</template>

<script setup lang="ts">
defineEmits<{ (e: 'click'): void }>()
</script>
