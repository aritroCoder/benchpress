import { db } from './db'
import seedData from '../seed/seed.json'
import type { Day, Exercise, Week } from '../domain/types'
import { parseIso, dayOfWeekMon0 } from '../domain/dates'
import { generateNextWeek, rolloverPlan } from '../domain/rollover'
import { parseTarget } from '../domain/target'

export const EXPORT_VERSION = 1

function seedWeeks(now: number): Week[] {
  return (structuredClone(seedData) as unknown as Week[]).map((w) => ({ ...w, createdAt: now, updatedAt: now }))
}

/** Atomic + idempotent: safe under React StrictMode double-effects and two tabs. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.weeks, db.meta, async () => {
    const seeded = await db.meta.get('seeded')
    if (seeded) return
    await db.weeks.bulkAdd(seedWeeks(Date.now()))
    await db.meta.put({ key: 'seeded', value: true })
  })
}

/** Generate the current week if we're on/after Sunday. `add` (not `put`) makes
 *  concurrent callers harmless. Single call = single jump across gaps. */
export async function ensureRolledOver(today: Date): Promise<string | null> {
  const latest = await db.weeks.orderBy('id').last()
  if (!latest) return null
  const target = rolloverPlan(latest.id, today)
  if (!target) return null
  const next = generateNextWeek(latest, target, Date.now())
  try {
    await db.weeks.add(next)
    return next.id
  } catch (e) {
    if (e instanceof Error && e.name === 'ConstraintError') return null
    throw e
  }
}

// ---------- targeted mutations (never write stale whole-doc snapshots) ----------

const MAX_REP = 99

function clampRep(v: number): number {
  return Math.max(0, Math.min(MAX_REP, Math.round(v)))
}

async function withWeek(weekId: string, mutate: (w: Week) => void): Promise<void> {
  await db.transaction('rw', db.weeks, async () => {
    const w = await db.weeks.get(weekId)
    if (!w) throw new Error(`week ${weekId} not found`)
    mutate(w)
    w.updatedAt = Date.now()
    await db.weeks.put(w)
  })
}

function findEx(w: Week, exerciseId: string): Exercise {
  for (const day of w.days) {
    const ex = day.exercises.find((e) => e.id === exerciseId)
    if (ex) return ex
  }
  throw new Error(`exercise ${exerciseId} not found in week ${w.id}`)
}

function findDay(w: Week, dayOfWeek: number): Day {
  const day = w.days.find((d) => d.dayOfWeek === dayOfWeek)
  if (!day) throw new Error(`day ${dayOfWeek} not found in week ${w.id}`)
  return day
}

export const setRep = (weekId: string, exerciseId: string, setIdx: number, value: number | null) =>
  withWeek(weekId, (w) => {
    const ex = findEx(w, exerciseId)
    while (ex.setReps.length <= setIdx) ex.setReps.push(null)
    ex.setReps[setIdx] = value == null ? null : clampRep(value)
  })

/** Capped at the parsed target's set count (8 when unparseable). */
export const addSetSlot = (weekId: string, exerciseId: string) =>
  withWeek(weekId, (w) => {
    const ex = findEx(w, exerciseId)
    const cap = parseTarget(ex.description)?.sets ?? 8
    if (ex.setReps.length < cap) ex.setReps.push(null)
  })

/** Removes the last set row (minimum 1 row — delete the exercise instead). */
export const removeSetSlot = (weekId: string, exerciseId: string) =>
  withWeek(weekId, (w) => {
    const ex = findEx(w, exerciseId)
    if (ex.setReps.length > 1) ex.setReps.pop()
  })

export const setWeightText = (weekId: string, exerciseId: string, text: string) =>
  withWeek(weekId, (w) => {
    findEx(w, exerciseId).weightText = text
  })

export const setExerciseName = (weekId: string, exerciseId: string, name: string) =>
  withWeek(weekId, (w) => {
    findEx(w, exerciseId).name = name
  })

/** Description edits reconcile setReps: grow with nulls, trim only trailing nulls. */
export const setExerciseDescription = (weekId: string, exerciseId: string, description: string) =>
  withWeek(weekId, (w) => {
    const ex = findEx(w, exerciseId)
    ex.description = description
    const t = parseTarget(description)
    if (t) {
      while (ex.setReps.length < t.sets) ex.setReps.push(null)
      while (ex.setReps.length > t.sets && ex.setReps[ex.setReps.length - 1] == null) ex.setReps.pop()
    }
  })

export const addExercise = (weekId: string, dayOfWeek: number, name: string, description: string) =>
  withWeek(weekId, (w) => {
    findDay(w, dayOfWeek).exercises.push({
      id: crypto.randomUUID(),
      sourceId: null,
      name,
      description,
      setReps: new Array<number | null>(Math.max(parseTarget(description)?.sets ?? 3, 1)).fill(null),
      weightText: '',
      prevWeightText: '',
    })
  })

export const removeExercise = (weekId: string, exerciseId: string) =>
  withWeek(weekId, (w) => {
    for (const day of w.days) {
      const i = day.exercises.findIndex((e) => e.id === exerciseId)
      if (i !== -1) {
        day.exercises.splice(i, 1)
        return
      }
    }
  })

export const setExerciseOrder = (weekId: string, dayOfWeek: number, orderedIds: string[]) =>
  withWeek(weekId, (w) => {
    const day = findDay(w, dayOfWeek)
    const byId = new Map(day.exercises.map((e) => [e.id, e]))
    if (orderedIds.length !== day.exercises.length || orderedIds.some((id) => !byId.has(id))) return
    day.exercises = orderedIds.map((id) => byId.get(id)!)
  })

export const setSplit = (weekId: string, dayOfWeek: number, split: string) =>
  withWeek(weekId, (w) => {
    findDay(w, dayOfWeek).split = split
  })

/** Appends clones to the target day in plan order (day, then position) regardless of
 *  the order ids are passed in. Copies never carry logged data; the source's weight
 *  becomes the clone's prev-weight hint (same rule as week generation). */
export const copyExercisesToDay = (weekId: string, exerciseIds: string[], targetDayOfWeek: number) =>
  withWeek(weekId, (w) => {
    const wanted = new Set(exerciseIds)
    const clones: Exercise[] = []
    for (const day of w.days) {
      for (const ex of day.exercises) {
        if (!wanted.has(ex.id)) continue
        clones.push({
          id: crypto.randomUUID(),
          sourceId: null,
          name: ex.name,
          description: ex.description,
          setReps: new Array<number | null>(Math.max(ex.setReps.length, 1)).fill(null),
          weightText: '',
          prevWeightText: ex.weightText || ex.prevWeightText,
        })
      }
    }
    findDay(w, targetDayOfWeek).exercises.push(...clones)
  })

/** Appends the exercises themselves (logged data travels) to the target day,
 *  in plan order regardless of the order ids are passed in. */
export const moveExercisesToDay = (weekId: string, exerciseIds: string[], targetDayOfWeek: number) =>
  withWeek(weekId, (w) => {
    const wanted = new Set(exerciseIds)
    const moved: Exercise[] = []
    for (const day of w.days) {
      const keep: Exercise[] = []
      for (const ex of day.exercises) (wanted.has(ex.id) ? moved : keep).push(ex)
      day.exercises = keep
    }
    findDay(w, targetDayOfWeek).exercises.push(...moved)
  })

// ---------- export / import / reset ----------

export interface ExportData {
  version: number
  exportedAtMs: number
  weeks: Week[]
}

export async function exportData(): Promise<ExportData> {
  const weeks = await db.weeks.orderBy('id').toArray()
  return { version: EXPORT_VERSION, exportedAtMs: Date.now(), weeks }
}

export async function markExported(): Promise<void> {
  await db.meta.put({ key: 'lastExportAtMs', value: Date.now() })
}

export async function getLastExportAt(): Promise<number | null> {
  const row = await db.meta.get('lastExportAtMs')
  return typeof row?.value === 'number' ? row.value : null
}

/** Throws with a human-readable message on any structural problem. */
export function validateImport(data: unknown): Week[] {
  const fail = (msg: string): never => {
    throw new Error(`invalid backup: ${msg}`)
  }
  if (typeof data !== 'object' || data === null) fail('not an object')
  const d = data as Record<string, unknown>
  if (d.version !== EXPORT_VERSION) fail(`unsupported version ${String(d.version)}`)
  if (!Array.isArray(d.weeks) || d.weeks.length === 0) fail('no weeks')
  const ids = new Set<string>()
  for (const w of d.weeks as Week[]) {
    if (typeof w.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.id)) fail(`bad week id ${String(w.id)}`)
    if (ids.has(w.id)) fail(`duplicate week ${w.id}`)
    ids.add(w.id)
    if (w.startDate !== w.id) fail(`week ${w.id}: startDate mismatch`)
    if (dayOfWeekMon0(parseIso(w.id)) !== 0) fail(`week ${w.id} does not start on a Monday`)
    if (!Number.isInteger(w.mesoNumber) || !Number.isInteger(w.weekNumber) || w.weekNumber < 1)
      fail(`week ${w.id}: bad meso/week numbers`)
    if (w.prevWeekId !== null && typeof w.prevWeekId !== 'string') fail(`week ${w.id}: bad prevWeekId`)
    if (!Array.isArray(w.days) || w.days.length !== 7) fail(`week ${w.id}: needs exactly 7 days`)
    const seen = w.days.map((day) => day.dayOfWeek).sort((a, b) => a - b)
    if (seen.join(',') !== '0,1,2,3,4,5,6') fail(`week ${w.id}: days must cover Mon–Sun exactly once`)
    for (const day of w.days) {
      if (typeof day.split !== 'string' || !Array.isArray(day.exercises)) fail(`week ${w.id}: malformed day`)
      for (const ex of day.exercises) {
        if (typeof ex.id !== 'string' || typeof ex.name !== 'string' || typeof ex.description !== 'string')
          fail(`week ${w.id}: malformed exercise`)
        if (typeof ex.weightText !== 'string' || typeof ex.prevWeightText !== 'string')
          fail(`week ${w.id}: malformed exercise weights`)
        if (ex.sourceId !== null && typeof ex.sourceId !== 'string') fail(`week ${w.id}: bad sourceId`)
        if (!Array.isArray(ex.setReps)) fail(`week ${w.id}: malformed setReps`)
        for (const r of ex.setReps) {
          if (r !== null && (!Number.isInteger(r) || r < 0 || r > MAX_REP)) fail(`week ${w.id}: bad rep value ${r}`)
        }
      }
    }
  }
  return d.weeks as Week[]
}

/** Atomic replace-all. Callers must flush pending edits and back up first. */
export async function importData(weeks: Week[]): Promise<void> {
  await db.transaction('rw', db.weeks, db.meta, async () => {
    await db.weeks.clear()
    await db.weeks.bulkAdd(weeks)
    await db.meta.put({ key: 'seeded', value: true })
  })
}

export async function resetToSeed(): Promise<void> {
  await db.transaction('rw', db.weeks, db.meta, async () => {
    await db.weeks.clear()
    await db.weeks.bulkAdd(seedWeeks(Date.now()))
    await db.meta.put({ key: 'seeded', value: true })
  })
}
