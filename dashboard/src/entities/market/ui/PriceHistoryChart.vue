<script setup lang="ts">
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)

interface TradePoint {
  t: string
  p: number
  size: number
  is_whale: number
}

interface PriceHistoryResponse {
  points: TradePoint[]
  whaleEntryAt: string | null
  whaleAvgPrice: number | null
  insufficientData: boolean
}

const props = defineProps<{
  conditionId: string
  outcome: string
  walletAddress: string
  avgPrice: number
  currentProb: number | null
}>()

const since = ref<'7d' | '30d' | 'all'>('30d')

const { data, pending } = useFetch<PriceHistoryResponse>(
  () => `/api/markets/${props.conditionId}/price-history`,
  {
    query: computed(() => ({
      outcome: props.outcome,
      walletAddress: props.walletAddress,
      since: since.value,
    })),
    server: false,
  },
)

const points = computed(() => data.value?.points ?? [])

function formatLabel(iso: string): string {
  const d = new Date(iso)
  const month = d.toLocaleString('en', { month: 'short' })
  const day = d.getDate()
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${month} ${day} ${hh}:${mm}`
}

// Index of the data point closest to the whale's entry timestamp
const entryLabelIndex = computed<number | null>(() => {
  if (!data.value?.whaleEntryAt || !points.value.length) return null
  const entryMs = new Date(data.value.whaleEntryAt).getTime()
  let closest = 0
  let minDiff = Infinity
  points.value.forEach((p, i) => {
    const diff = Math.abs(new Date(p.t).getTime() - entryMs)
    if (diff < minDiff) {
      minDiff = diff
      closest = i
    }
  })
  return closest
})

const chartData = computed(() => {
  const labels = points.value.map((p) => formatLabel(p.t))
  const len = labels.length

  const datasets: any[] = [
    {
      label: 'Price',
      data: points.value.map((p) => +(p.p * 100).toFixed(1)),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.07)',
      fill: true,
      tension: 0.2,
      pointRadius: 1,
      pointHoverRadius: 4,
      borderWidth: 2,
    },
  ]

  // Whale avg entry reference line
  const whaleAvg = data.value?.whaleAvgPrice ?? props.avgPrice
  datasets.push({
    label: 'Whale entry',
    data: Array(len).fill(+(whaleAvg * 100).toFixed(1)),
    borderColor: '#f59e0b',
    backgroundColor: 'transparent',
    fill: false,
    tension: 0,
    pointRadius: 0,
    pointHoverRadius: 0,
    borderWidth: 1.5,
    borderDash: [5, 4],
  })

  // Current market probability reference line
  if (props.currentProb != null) {
    datasets.push({
      label: 'Current',
      data: Array(len).fill(+(props.currentProb * 100).toFixed(1)),
      borderColor: '#22c55e',
      backgroundColor: 'transparent',
      fill: false,
      tension: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      borderWidth: 1.5,
      borderDash: [6, 3],
    })
  }

  return { labels, datasets }
})

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      display: true,
      position: 'top' as const,
      labels: { color: '#9ca3af', boxWidth: 16, padding: 10, font: { size: 11 } },
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y}¢`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: '#6b7280', maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } },
      grid: { color: '#1f2937' },
    },
    y: {
      ticks: { color: '#9ca3af', callback: (v: any) => `${v}¢`, font: { size: 10 } },
      grid: { color: '#1f2937' },
      min: 0,
      max: 100,
    },
  },
}))

// Inline Chart.js plugin — draws a dashed vertical line at the whale's entry point.
// Closes over entryLabelIndex (computed) which is always up-to-date when afterDraw fires.
const entryLinePlugin = {
  id: 'whaleEntryLine',
  afterDraw(chart: any) {
    const idx = entryLabelIndex.value
    if (idx == null || idx < 0) return
    const { ctx, chartArea, scales } = chart
    if (!chartArea) return
    const x = scales.x.getPixelForValue(idx)
    if (x < chartArea.left || x > chartArea.right) return

    ctx.save()
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.moveTo(x, chartArea.top)
    ctx.lineTo(x, chartArea.bottom)
    ctx.stroke()

    ctx.setLineDash([])
    ctx.fillStyle = '#f59e0b'
    ctx.globalAlpha = 0.75
    ctx.font = 'bold 9px sans-serif'
    ctx.fillText('Entry', x + 4, chartArea.top + 12)
    ctx.restore()
  },
}
</script>

<template>
  <div class="space-y-2">
    <!-- Time range selector -->
    <div class="flex items-center gap-1.5">
      <span class="text-xs text-gray-500">Range:</span>
      <button
        v-for="r in [
          { label: '7d', value: '7d' },
          { label: '30d', value: '30d' },
          { label: 'All', value: 'all' },
        ]"
        :key="r.value"
        class="px-2 py-0.5 text-xs rounded transition-colors"
        :class="
          since === r.value
            ? 'bg-indigo-600 text-white'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
        "
        @click="since = r.value as '7d' | '30d' | 'all'"
      >
        {{ r.label }}
      </button>
    </div>

    <!-- Chart area -->
    <div class="h-56 relative">
      <div v-if="pending" class="flex items-center justify-center h-full">
        <USkeleton class="h-full w-full rounded" />
      </div>
      <div
        v-else-if="!data || data.insufficientData"
        class="flex flex-col items-center justify-center h-full gap-1"
      >
        <UIcon name="i-heroicons-chart-bar" class="w-8 h-8 text-gray-700" />
        <span class="text-gray-500 text-sm">Insufficient price history</span>
        <span class="text-gray-600 text-xs">Not enough trades recorded yet</span>
      </div>
      <Line v-else :data="chartData" :options="options" :plugins="[entryLinePlugin]" />
    </div>
  </div>
</template>
