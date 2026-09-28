export const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 3725 → "1h 02m", 540 → "9m" */
export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Total hours, for lifetime stats: 12345678 s → "3,429 h" */
export function fmtHours(seconds: number): string {
  return `${intFmt.format(seconds / 3600)} h`
}

/** "2024-06-03T07:14:00" → "Mon, Jun 3, 2024" (the string is already local time) */
export function fmtDate(startLocal: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return localDate(startLocal).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...opts,
  })
}

export function fmtTime(startLocal: string): string {
  return localDate(startLocal).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

/** Treats a local "YYYY-MM-DDTHH:mm:ss" as UTC so date math is timezone-proof in the browser. */
export function localDate(startLocal: string): Date {
  return new Date(`${startLocal}Z`)
}

export const stravaUrl = (id: string) => `https://www.strava.com/activities/${id}`
