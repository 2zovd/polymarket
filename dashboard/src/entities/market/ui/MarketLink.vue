<script setup lang="ts">
const props = defineProps<{ question: string; eventSlug: string | null; maxLen?: number }>()

const url = computed(() =>
  props.eventSlug
    ? `https://polymarket.com/event/${props.eventSlug}`
    : 'https://polymarket.com',
)

const label = computed(() => {
  const max = props.maxLen ?? 80
  return props.question.length > max ? `${props.question.slice(0, max)}…` : props.question
})
</script>

<template>
  <NuxtLink :to="url" target="_blank" class="text-blue-400 hover:text-blue-300 transition-colors" :title="question">
    {{ label }}
  </NuxtLink>
</template>
