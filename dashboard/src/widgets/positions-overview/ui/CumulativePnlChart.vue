<script setup lang="ts">
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler)

interface PnlPoint { resolved_at: string | null; pnl: number | null; is_dry_run: number }

const props = defineProps<{ history: PnlPoint[]; isDryRun: boolean }>()

const filtered = computed(() =>
  props.history.filter((p) => Boolean(p.is_dry_run) === props.isDryRun && p.resolved_at != null),
)

const chartData = computed(() => {
  let cum = 0
  const points = filtered.value.map((p) => {
    cum += p.pnl ?? 0
    return { x: p.resolved_at!.slice(0, 10), y: Number(cum.toFixed(2)) }
  })

  return {
    labels: points.map((p) => p.x),
    datasets: [
      {
        data: points.map((p) => p.y),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  }
})

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#6b7280', maxTicksLimit: 8 }, grid: { color: '#1f2937' } },
    y: { ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } },
  },
}
</script>

<template>
  <div class="h-48">
    <Line v-if="filtered.length > 1" :data="chartData" :options="options" />
    <div v-else class="flex items-center justify-center h-full text-gray-500 text-sm">
      Not enough data
    </div>
  </div>
</template>
