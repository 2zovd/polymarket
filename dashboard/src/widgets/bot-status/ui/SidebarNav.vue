<script setup lang="ts">
import { NAV_ITEMS } from '../../../shared/config/routes'
</script>

<template>
  <nav class="flex flex-col gap-1 p-3">
    <div class="px-3 py-2 mb-2">
      <h1 class="text-sm font-bold text-white tracking-wide">Polymarket</h1>
      <p class="text-xs text-gray-500">Copy Trading Monitor</p>
    </div>
    <UTooltip
      v-for="item in NAV_ITEMS"
      :key="item.to"
      :text="item.tooltip"
      :popper="{ placement: 'right' }"
    >
      <NuxtLink
        :to="item.to"
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
        :class="$route.path === item.to
          ? 'bg-gray-700 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'"
      >
        <UIcon :name="item.icon" class="w-4 h-4 shrink-0" />
        {{ item.label }}
      </NuxtLink>
    </UTooltip>
  </nav>
</template>
