import type { LiveEvent } from '../../../entities/live-event/model/types'

const MAX_EVENTS = 200

export function useLiveEventStream() {
  const events = ref<LiveEvent[]>([])
  const connected = ref(false)
  const paused = ref(false)
  let source: EventSource | null = null

  function connect() {
    source?.close()
    source = new EventSource('/api/live/events')
    connected.value = false

    source.onopen = () => { connected.value = true }

    source.onmessage = (e: MessageEvent) => {
      if (paused.value) return
      try {
        const ev = JSON.parse(e.data) as LiveEvent
        // Prepend so newest is always at the top.
        events.value.unshift(ev)
        if (events.value.length > MAX_EVENTS) events.value.length = MAX_EVENTS
      } catch { /* malformed */ }
    }

    source.onerror = () => {
      connected.value = false
      source?.close()
      setTimeout(connect, 3000)
    }
  }

  onMounted(connect)
  onUnmounted(() => source?.close())

  function clear() { events.value = [] }

  return { events, connected, paused, clear }
}
