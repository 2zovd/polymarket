<script setup lang="ts">
const drawerOpen = ref(false)
const route = useRoute()
watch(() => route.path, () => { drawerOpen.value = false })
</script>

<template>
  <div class="flex h-screen bg-gray-950 text-gray-100">
    <!-- Desktop sidebar: hidden on mobile, visible from md+ -->
    <aside class="hidden md:flex md:w-52 md:shrink-0 md:flex-col border-r border-gray-800 overflow-y-auto">
      <SidebarNav />
    </aside>

    <!-- Mobile drawer -->
    <MobileNavDrawer v-model="drawerOpen" />

    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Mobile top bar: visible only below md -->
      <header class="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
        <HamburgerButton @click="drawerOpen = true" />
        <span class="text-sm font-bold text-white">Polymarket</span>
      </header>

      <main class="flex-1 overflow-y-auto p-4 md:p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
