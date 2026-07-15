import type { Week } from './types'
import { WEEKS_PER_MESO } from './types'
import { addDaysIso, isoLocalDate, mondayOf } from './dates'
import { parseTarget } from './target'

/**
 * Which week (if any) should be generated, given the latest tracked week and today.
 * target = Monday of the week containing (today + 1 day): on/after Sunday this is
 * next Monday, so the new week appears Sunday (planning day) or whenever the app
 * is next opened. Called once → multi-week gaps produce a SINGLE jump.
 */
export function rolloverPlan(latestStartDate: string, today: Date): string | null {
  const target = mondayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
  return latestStartDate >= target ? null : target
}

/** Deep-copy src's structure into a fresh week starting at startDate. */
export function generateNextWeek(src: Week, startDate: string, now: number): Week {
  const atMesoBoundary = src.weekNumber >= WEEKS_PER_MESO
  return {
    id: startDate,
    startDate,
    mesoNumber: atMesoBoundary ? src.mesoNumber + 1 : src.mesoNumber,
    weekNumber: atMesoBoundary ? 1 : src.weekNumber + 1,
    prevWeekId: src.id,
    days: src.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      split: day.split,
      exercises: day.exercises.map((ex) => ({
        id: crypto.randomUUID(),
        sourceId: ex.id,
        name: ex.name,
        description: ex.description,
        setReps: new Array<number | null>(Math.max(parseTarget(ex.description)?.sets ?? 3, 1)).fill(null),
        weightText: '',
        prevWeightText: ex.weightText || ex.prevWeightText,
      })),
    })),
    createdAt: now,
    updatedAt: now,
  }
}

/** Date (ISO) of a given day slot within a week. */
export function dateOfDay(weekStartDate: string, dayOfWeek: number): string {
  return addDaysIso(weekStartDate, dayOfWeek)
}

/** True if today falls inside the week starting at startDate. */
export function weekContains(startDate: string, today: Date): boolean {
  return mondayOf(today) === startDate
}

export function todayIso(today: Date): string {
  return isoLocalDate(today)
}
