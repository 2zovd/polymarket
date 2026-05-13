<template>
  <div class="flex h-screen bg-gray-950 text-gray-100">
    <!-- Sidebar -->
    <aside class="w-52 shrink-0 border-r border-gray-800 overflow-y-auto">
      <SidebarNav />
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto p-6">
      <slot />
    </main>
  </div>
</template>
