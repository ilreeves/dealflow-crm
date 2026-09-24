import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  // Clamp: sub-byte values would index -1, and anything past the last unit
  // would render "undefined".
  const i = Math.min(Math.max(Math.floor(Math.log(bytes) / Math.log(k)), 0), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// `timeZone` is for server components: they run in UTC, so a timestamp from
// an Eastern evening would otherwise print as the next day. Omitted, it keeps
// the runtime's zone — the browser's local time for client callers.
export function formatDate(dateStr: string, timeZone?: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  })
}
