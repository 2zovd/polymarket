<script setup lang="ts">
import type { OpportunityRow } from '../src/entities/opportunity/model/types'

useHead({ title: 'Opportunities — Polymarket Dashboard' })

const page = ref(1)
const sort = ref('score')
const filter = ref('all')
const minTrades = ref(5)

const { data, pending, refresh } = useFetch('/api/opportunities', {
  query: computed(() => ({
    page: page.value,
    sort: sort.value,
    filter: filter.value,
    minTrades: minTrades.value,
  })),
  server: false,
})

watch([sort, filter, minTrades], () => {
  page.value = 1
})

onMounted(() => {
  const t = setInterval(() => data.value && refresh(), 60_000)
  onUnmounted(() => clearInterval(t))
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-bold text-white">Opportunities</h1>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-4">
          <!-- Whale filter -->
          <div class="flex items-center gap-1">
            <UButton
              v-for="f in [{ label: 'All', value: 'all' }, { label: 'Sharp', value: 'sharp' }, { label: 'Profitable', value: 'profitable' }]"
              :key="f.value"
              size="xs"
              :variant="filter === f.value ? 'solid' : 'ghost'"
              :color="filter === f.value ? 'primary' : 'gray'"
              @click="filter = f.value"
            >{{ f.label }}</UButton>
          </div>

          <!-- Min resolved trades -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400">Min trades:</span>
            <div class="flex gap-1">
              <UButton
                v-for="n in [5, 10, 20]"
                :key="n"
                size="xs"
                :variant="minTrades === n ? 'solid' : 'ghost'"
                :color="minTrades === n ? 'primary' : 'gray'"
                @click="minTrades = n"
              >{{ n }}</UButton>
            </div>
          </div>

          <div class="ml-auto flex items-center gap-3">
            <span v-if="data" class="text-xs text-gray-500">{{ data.total }} results</span>
            <UButton
              size="xs"
              variant="ghost"
              color="gray"
              icon="i-heroicons-arrow-path"
              :loading="pending"
              @click="refresh()"
            >Refresh</UButton>
          </div>
        </div>
      </template>

      <OpportunityTable
        :rows="(data?.data as OpportunityRow[]) ?? []"
        :loading="pending && !data"
        :sort="sort"
        @sort="sort = $event"
      />

      <template #footer>
        <PaginationBar
          v-if="data && data.total > data.pageSize"
          :page="page"
          :total="data.total"
          :page-size="data.pageSize"
          @change="page = $event"
        />
      </template>
    </UCard>
  </div>
</template>
