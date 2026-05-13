import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

export interface LogLine {
  level: number
  time: string
  pid?: number
  msg: string
  module?: string
  [key: string]: unknown
}

export function getLogPath(): string {
  // LOG_PATH can be set explicitly (nuxt preview changes cwd internally)
  if (process.env.LOG_PATH) return process.env.LOG_PATH

  const projectLog = resolve(process.cwd(), '../logs/bot.log')
  const pm2Log = resolve(process.env.HOME ?? '', '.pm2/logs/polymarket-monitor-out.log')
  try {
    const projMtime = statSync(projectLog).mtimeMs
    const pm2Mtime = statSync(pm2Log).mtimeMs
    return projMtime >= pm2Mtime ? projectLog : pm2Log
  } catch {
    try { statSync(pm2Log); return pm2Log } catch { return projectLog }
  }
}

export function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

function parseLine(raw: string): LogLine | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Strip PM2 timestamp prefix "YYYY-MM-DD HH:mm:ss ±HH:MM: {json}"
  const jsonStart = trimmed.indexOf('{')
  if (jsonStart === -1) return null
  try {
    return JSON.parse(trimmed.slice(jsonStart)) as LogLine
  } catch {
    return null
  }
}

export async function readLastNLines(filePath: string, n: number): Promise<LogLine[]> {
  const MAX_BYTES = 5 * 1024 * 1024 // 5 MB cap
  const size = getFileSize(filePath)
  if (size === 0) return []

  const start = Math.max(0, size - MAX_BYTES)
  const lines: LogLine[] = []

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, { start, encoding: 'utf8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    rl.on('line', (raw) => {
      const line = parseLine(raw)
      if (line) lines.push(line)
    })
    rl.on('close', () => resolve())
    rl.on('error', reject)
    stream.on('error', reject)
  })

  return lines.slice(-n)
}

export async function readNewLines(
  filePath: string,
  fromOffset: number,
): Promise<{ lines: LogLine[]; bytesRead: number }> {
  const size = getFileSize(filePath)
  if (size <= fromOffset) return { lines: [], bytesRead: 0 }

  const lines: LogLine[] = []

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, { start: fromOffset, encoding: 'utf8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    rl.on('line', (raw) => {
      const line = parseLine(raw)
      if (line) lines.push(line)
    })
    rl.on('close', () => resolve())
    rl.on('error', reject)
    stream.on('error', reject)
  })

  return { lines, bytesRead: size - fromOffset }
}

// Count log lines at or above a given pino level in the last hour
export async function countRecentByLevel(
  filePath: string,
  minLevel: number,
  windowMs = 60 * 60 * 1000,
): Promise<number> {
  const cutoff = Date.now() - windowMs
  const lines = await readLastNLines(filePath, 10_000)
  return lines.filter((l) => l.level >= minLevel && new Date(l.time).getTime() >= cutoff).length
}
