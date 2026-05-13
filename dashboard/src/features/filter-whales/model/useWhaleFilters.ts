const ALLOWED_SORT = ['roi', 'win_rate', 'resolved_trades', 'brier_score', 'total_trades', 'updated_at'] as const
type SortKey = (typeof ALLOWED_SORT)[number]

export function useWhaleFilters() {
  const filter = ref<'all' | 'sharp' | 'profitable'>('all')
  const sort = ref<SortKey>('roi')
  const order = ref<'desc' | 'asc'>('desc')

  const filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Sharp', value: 'sharp' },
    { label: 'Profitable', value: 'profitable' },
  ]

  const sortOptions = [
    { label: 'ROI', value: 'roi' },
    { label: 'Win Rate', value: 'win_rate' },
    { label: 'Resolved Trades', value: 'resolved_trades' },
    { label: 'Brier Score', value: 'brier_score' },
  ]

  function toggleSort(key: SortKey) {
    if (sort.value === key) order.value = order.value === 'desc' ? 'asc' : 'desc'
    else { sort.value = key; order.value = 'desc' }
  }

  return { filter, sort, order, filterOptions, sortOptions, toggleSort }
}
