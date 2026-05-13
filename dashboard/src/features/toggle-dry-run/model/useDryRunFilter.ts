export function useDryRunFilter() {
  const includeDryRun = ref(true)
  const isDryRunOnly = ref(false)

  const isDryRunParam = computed(() => {
    if (isDryRunOnly.value) return 1
    if (!includeDryRun.value) return 0
    return -1 // all
  })

  return { includeDryRun, isDryRunOnly, isDryRunParam }
}
