import type { Exercise, Week } from './types'
import { parseTarget } from './target'

export function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** True iff every prescribed set was logged at reps >= top of the target range. */
export function metProgression(description: string, setReps: (number | null)[]): boolean {
  const t = parseTarget(description)
  if (!t) return false
  for (let i = 0; i < t.sets; i++) {
    const r = setReps[i]
    if (r == null || r < t.repHigh) return false
  }
  return true
}

export interface BadgeInfo {
  /** matched a prev-week exercise (same name rule satisfied) */
  matched: boolean
  /** marked for progression: matched AND prev week met its own target */
  progress: boolean
  /** best-known previous weight for display ("last:") */
  lastWeightText: string
  /** previous week's logged reps (lineage or match), for per-set "last N" ghosts */
  lastReps: (number | null)[] | null
}

interface PrevEntry {
  ex: Exercise
  dayOfWeek: number
}

/**
 * One-to-one matching of this week's exercises against the previous week, in passes:
 *  1. sourceId lineage; name still equal → matched. Name changed → NOT matched
 *     (renamed = new exercise, per user rule) but lineage still supplies lastWeightText.
 *  2. Same-day-slot name match among unconsumed prev exercises (in order ≈ ordinal).
 *  3. Fallback: name unique among unconsumed prev AND unmatched current → matched.
 * Each prev exercise is consumed at most once.
 */
export function progressionBadges(week: Week, prevWeek: Week | null): Map<string, BadgeInfo> {
  const result = new Map<string, BadgeInfo>()
  const current: { ex: Exercise; dayOfWeek: number }[] = []
  for (const day of week.days) for (const ex of day.exercises) current.push({ ex, dayOfWeek: day.dayOfWeek })

  if (!prevWeek) {
    for (const { ex } of current) {
      result.set(ex.id, { matched: false, progress: false, lastWeightText: ex.prevWeightText, lastReps: null })
    }
    return result
  }

  const prevById = new Map<string, PrevEntry>()
  const prevList: PrevEntry[] = []
  for (const day of prevWeek.days) {
    for (const ex of day.exercises) {
      const entry = { ex, dayOfWeek: day.dayOfWeek }
      prevById.set(ex.id, entry)
      prevList.push(entry)
    }
  }

  const consumed = new Set<string>()
  // ex.id → { prevEx (lineage or match, for weight display), matched }
  const resolution = new Map<string, { prevEx: Exercise; matched: boolean }>()

  // Pass 1: sourceId lineage
  for (const { ex } of current) {
    if (!ex.sourceId) continue
    const entry = prevById.get(ex.sourceId)
    if (!entry || consumed.has(ex.sourceId)) continue
    consumed.add(ex.sourceId)
    resolution.set(ex.id, { prevEx: entry.ex, matched: normName(entry.ex.name) === normName(ex.name) })
  }

  const unresolved = current.filter(({ ex }) => !resolution.has(ex.id))

  // Pass 2: same-day-slot name match
  for (const { ex, dayOfWeek } of unresolved) {
    if (resolution.has(ex.id)) continue
    const hit = prevList.find(
      (p) => !consumed.has(p.ex.id) && p.dayOfWeek === dayOfWeek && normName(p.ex.name) === normName(ex.name),
    )
    if (hit) {
      consumed.add(hit.ex.id)
      resolution.set(ex.id, { prevEx: hit.ex, matched: true })
    }
  }

  // Pass 3: week-unique fallback (unique among unconsumed prev AND unmatched current)
  const stillUnresolved = current.filter(({ ex }) => !resolution.has(ex.id))
  for (const { ex } of stillUnresolved) {
    if (resolution.has(ex.id)) continue
    const name = normName(ex.name)
    const currCount = stillUnresolved.filter((c) => !resolution.has(c.ex.id) && normName(c.ex.name) === name).length
    const prevMatches = prevList.filter((p) => !consumed.has(p.ex.id) && normName(p.ex.name) === name)
    if (currCount === 1 && prevMatches.length === 1) {
      consumed.add(prevMatches[0].ex.id)
      resolution.set(ex.id, { prevEx: prevMatches[0].ex, matched: true })
    }
  }

  for (const { ex } of current) {
    const r = resolution.get(ex.id)
    const prevEx = r?.prevEx
    const matched = r?.matched ?? false
    result.set(ex.id, {
      matched,
      progress: matched && prevEx != null && metProgression(prevEx.description, prevEx.setReps),
      lastWeightText: prevEx ? prevEx.weightText || prevEx.prevWeightText || ex.prevWeightText : ex.prevWeightText,
      lastReps: prevEx ? prevEx.setReps : null,
    })
  }
  return result
}
