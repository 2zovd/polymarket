<script setup lang="ts">
const props = defineProps<{ address: string; short?: boolean }>()

const display = computed(() =>
  props.short ? truncateAddress(props.address) : props.address,
)

const copied = ref(false)
async function copy() {
  await navigator.clipboard.writeText(props.address)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <span class="inline-flex items-center gap-1 font-mono text-sm">
    <NuxtLink
      :to="`https://polygonscan.com/address/${address}`"
      target="_blank"
      class="text-blue-400 hover:text-blue-300 transition-colors"
    >{{ display }}</NuxtLink>
    <UButton
      size="2xs"
      variant="ghost"
      :icon="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
      :color="copied ? 'green' : 'gray'"
      @click="copy"
    />
  </span>
</template>
