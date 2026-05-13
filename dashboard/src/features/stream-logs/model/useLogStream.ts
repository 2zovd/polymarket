import type { LogLine } from '../../../entities/log-entry/model/types'

export function useLogStream() {
  const lines = ref<LogLine[]>([])
  const paused = ref(false)
  const connected = ref(false)
  let source: EventSource | null = null

  function connect() {
    source?.close()
    source = new EventSource('/api/logs/stream')
    connected.value = false

    source.onopen = () => { connected.value = true }

    source.onmessage = (e: MessageEvent) => {
      if (paused.value) return
      try {
        const line = JSON.parse(e.data) as LogLine
        lines.value.push(line)
        if (lines.value.length > 2000) lines.value.splice(0, lines.value.length - 2000)
      } catch { /* malformed line */ }
    }

    source.onerror = () => {
      connected.value = false
      setTimeout(connect, 3000)
    }
  }

  onMounted(connect)
  onUnmounted(() => source?.close())

  function clear() { lines.value = [] }

  return { lines, paused, connected, clear }
}
