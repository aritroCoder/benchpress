// Sole owner of Date construction. Never `new Date(string)` / `toISOString()`
// anywhere in the app — both operate in UTC and skew dates across timezones.

import type { Week } from './types'

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export function isoLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse "YYYY-MM-DD" into a local-time Date (midnight local). */
export function parseIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`invalid ISO date: ${iso}`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Monday-zero day index (0=Mon..6=Sun) for a local Date. */
export function dayOfWeekMon0(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** Local Monday of the week containing d. Sunday belongs to the week that STARTED the previous Monday. */
export function mondayOf(d: Date): string {
  const shifted = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeekMon0(d))
  return isoLocalDate(shifted)
}

/** DST-safe day arithmetic via local Date components. */
export function addDaysIso(iso: string, n: number): string {
  const d = parseIso(iso)
  return isoLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

export function weekLabel(w: Pick<Week, 'mesoNumber' | 'weekNumber'>): string {
  return `Meso ${w.mesoNumber} · Week ${w.weekNumber}`
}

export function weekDateRange(w: Pick<Week, 'startDate'>): string {
  const start = parseIso(w.startDate)
  const end = parseIso(addDaysIso(w.startDate, 6))
  const s = `${MONTHS[start.getMonth()]} ${start.getDate()}`
  if (start.getMonth() === end.getMonth()) return `${s} – ${end.getDate()}`
  return `${s} – ${MONTHS[end.getMonth()]} ${end.getDate()}`
}

// --- "today" with a dev-only override (?today=YYYY-MM-DD) for e2e rollover testing ---

let todayOverride: string | null = null

export function setTodayOverride(iso: string | null): void {
  todayOverride = iso
}

export function todayDate(): Date {
  if (todayOverride) return parseIso(todayOverride)
  return new Date()
}
