export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function formatIso(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function hoursRemaining(endDateIso: string | null | undefined): number | null {
  if (!endDateIso) return null
  const dateStr = endDateIso.includes('T') ? endDateIso : `${endDateIso}T23:59:59Z`
  return (new Date(dateStr).getTime() - Date.now()) / 3_600_000
}

export function isStale(iso: string | null | undefined, thresholdMinutes = 5): boolean {
  if (!iso) return true
  return Date.now() - new Date(iso).getTime() > thresholdMinutes * 60_000
}

export function formatEndsIn(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = new Date(iso.includes('T') ? iso : `${iso}T23:59:59Z`).getTime() - Date.now()
  if (ms <= 0) return '—'
  const hours = ms / 3_600_000
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.ceil(hours / 24)
  if (days <= 60) return `${days}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function endsInClass(iso: string | null | undefined): string {
  if (!iso) return 'text-gray-500'
  const days = (new Date(iso.includes('T') ? iso : `${iso}T23:59:59Z`).getTime() - Date.now()) / 86_400_000
  if (days < 1) return 'text-red-400'
  if (days < 7) return 'text-yellow-400'
  return 'text-gray-400'
}
