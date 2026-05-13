export function useMarketSearch() {
  const query = ref('')
  const debouncedQuery = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(query, (val) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { debouncedQuery.value = val }, 300)
  })

  return { query, debouncedQuery }
}
