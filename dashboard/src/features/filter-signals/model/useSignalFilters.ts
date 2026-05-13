export function useSignalFilters() {
  const status = ref<string>('all')
  const since = ref<string>('7d')

  const statusOptions = [
    { label: 'All', value: 'all' },
    { label: 'Executed', value: 'executed' },
    { label: 'Dry Run', value: 'dry-run' },
    { label: 'Skipped', value: 'skipped' },
    { label: 'Error', value: 'error' },
  ]

  const sinceOptions = [
    { label: '1h', value: '1h' },
    { label: '24h', value: '24h' },
    { label: '7d', value: '7d' },
    { label: 'All time', value: 'all' },
  ]

  return { status, since, statusOptions, sinceOptions }
}
