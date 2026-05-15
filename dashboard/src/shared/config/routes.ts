export const NAV_ITEMS = [
  { label: 'Operations', icon: 'i-heroicons-chart-bar', to: '/', tooltip: 'Bot status and recent activity' },
  { label: 'Signals', icon: 'i-heroicons-bolt', to: '/signals', tooltip: 'All trading signals from tracked whales' },
  { label: 'Opportunities', icon: 'i-heroicons-fire', to: '/opportunities', tooltip: 'Live whale positions ranked by quality score' },
  { label: 'Positions', icon: 'i-heroicons-currency-dollar', to: '/positions', tooltip: 'Open positions and P&L history' },
  { label: 'Whales', icon: 'i-heroicons-user-group', to: '/whales', tooltip: 'Tracked smart-money wallets' },
  { label: 'Markets', icon: 'i-heroicons-globe-alt', to: '/markets', tooltip: 'Prediction markets browser' },
  { label: 'Live', icon: 'i-heroicons-signal', to: '/live', tooltip: 'Real-time whale trade feed' },
  { label: 'Logs', icon: 'i-heroicons-command-line', to: '/logs', tooltip: 'Live bot activity log' },
] as const
