<script setup lang="ts">
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)

const props = defineProps<{ reasons: { reason: string; count: number }[] }>()

const chartData = computed(() => ({
  labels: props.reasons.map((r) => formatSkipReason(r.reason)),
  datasets: [
    {
      data: props.reasons.map((r) => r.count),
      backgroundColor: '#3b82f6',
      borderRadius: 4,
    },
  ],
}))

const options = {
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } },
    y: { ticks: { color: '#d1d5db', font: { size: 11 } }, grid: { display: false } },
  },
}
</script>

<template>
  <div class="h-64">
    <Bar v-if="reasons.length" :data="chartData" :options="options" />
    <div v-else class="flex items-center justify-center h-full text-gray-500 text-sm">No skip data</div>
  </div>
</template>
