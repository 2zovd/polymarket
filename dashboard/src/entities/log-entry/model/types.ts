export interface LogLine {
  level: number
  levelName: string
  time: string
  pid?: number
  msg: string
  module?: string
  [key: string]: unknown
}

export const LEVEL_COLORS: Record<string, string> = {
  trace: 'text-gray-500',
  debug: 'text-gray-400',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  fatal: 'text-red-600',
}

export const LEVEL_BG: Record<string, string> = {
  warn: 'bg-yellow-900/20',
  error: 'bg-red-900/20',
  fatal: 'bg-red-900/40',
}
