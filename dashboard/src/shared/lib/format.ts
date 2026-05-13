export function formatUsdc(value: number | null | undefined): string {
  if (value == null) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatProbability(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(1)}¢`
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatSkipReason(reason: string | null | undefined): string {
  if (!reason) return '—'
  // Extract the prefix before the first colon
  const prefix = reason.split(':')[0]
  return prefix.replace(/_/g, ' ')
}

export function pnlColor(pnl: number | null | undefined): string {
  if (pnl == null) return 'text-gray-400'
  return pnl >= 0 ? 'text-green-400' : 'text-red-400'
}
