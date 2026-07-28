import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addExercise,
  copyExercisesToDay,
  ensureRolledOver,
  ensureSeeded,
  exportData,
  importData,
  moveExercisesToDay,
  removeExercise,
  resetToSeed,
  setExerciseDescription,
  setExerciseOrder,
  setRep,
  setWeightText,
  validateImport,
} from './repo'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('boot flow', () => {
  it('ensureSeeded is idempotent (StrictMode / two tabs)', async () => {
    await Promise.all([ensureSeeded(), ensureSeeded()])
    await ensureSeeded()
    expect(await db.weeks.count()).toBe(2)
    const w2 = await db.weeks.get('2026-07-13')
    expect(w2?.weekNumber).toBe(2)
    expect(w2?.prevWeekId).toBe('2026-07-06')
  })

  it('no rollover fires mid-week (Wed Jul 15)', async () => {
    await ensureSeeded()
    expect(await ensureRolledOver(new Date(2026, 6, 15))).toBeNull()
    expect(await db.weeks.count()).toBe(2)
  })

  it('Sunday Jul 19 generates Meso 9 Week 3 with carried weights + lineage', async () => {
    await ensureSeeded()
    const id = await ensureRolledOver(new Date(2026, 6, 19))
    expect(id).toBe('2026-07-20')
    const w3 = (await db.weeks.get('2026-07-20'))!
    expect(w3.mesoNumber).toBe(9)
    expect(w3.weekNumber).toBe(3)
    expect(w3.prevWeekId).toBe('2026-07-13')
    const bench = w3.days[0].exercises.find((e) => e.name === 'Barbell Bench Press')!
    expect(bench.prevWeightText).toBe('15+15') // week 2 logged weight
    expect(bench.setReps).toEqual([null, null, null, null])
    const w2bench = (await db.weeks.get('2026-07-13'))!.days[0].exercises.find(
      (e) => e.name === 'Barbell Bench Press',
    )!
    expect(bench.sourceId).toBe(w2bench.id)
  })

  it('concurrent rollover calls create exactly one week', async () => {
    await ensureSeeded()
    const today = new Date(2026, 6, 19)
    await Promise.all([ensureRolledOver(today), ensureRolledOver(today), ensureRolledOver(today)])
    expect(await db.weeks.count()).toBe(3)
  })

  it('multi-week gap → single jump (no phantom weeks)', async () => {
    await ensureSeeded()
    const id = await ensureRolledOver(new Date(2026, 7, 12)) // Wed Aug 12, 4 weeks later
    expect(id).toBe('2026-08-10')
    expect(await db.weeks.count()).toBe(3) // seed 2 + exactly one new
    const w = (await db.weeks.get('2026-08-10'))!
    expect(w.weekNumber).toBe(3) // tracked weeks, not calendar weeks
    expect(w.prevWeekId).toBe('2026-07-13')
  })

  it('walking Sundays crosses the meso boundary: W3 → W4 → Meso 10 W1', async () => {
    await ensureSeeded()
    await ensureRolledOver(new Date(2026, 6, 19)) // → W3 (Jul 20)
    await ensureRolledOver(new Date(2026, 6, 26)) // → W4 (Jul 27)
    const id = await ensureRolledOver(new Date(2026, 7, 2)) // → Meso 10 W1 (Aug 3)
    expect(id).toBe('2026-08-03')
    const w = (await db.weeks.get('2026-08-03'))!
    expect(w.mesoNumber).toBe(10)
    expect(w.weekNumber).toBe(1)
  })

  it('plan edits carry forward through rollover', async () => {
    await ensureSeeded()
    await addExercise('2026-07-13', 4, 'Kroc Row', '2 × 8–12')
    const w2 = (await db.weeks.get('2026-07-13'))!
    const warmup = w2.days[0].exercises.find((e) => e.name === 'shoulder warmup')!
    await removeExercise('2026-07-13', warmup.id)
    await ensureRolledOver(new Date(2026, 6, 19))
    const w3 = (await db.weeks.get('2026-07-20'))!
    expect(w3.days[4].exercises.some((e) => e.name === 'Kroc Row')).toBe(true)
    expect(w3.days[0].exercises.some((e) => e.name === 'shoulder warmup')).toBe(false)
  })
})

describe('mutations', () => {
  it('setRep grows the array, clamps, and persists', async () => {
    await ensureSeeded()
    const w2 = (await db.weeks.get('2026-07-13'))!
    const ex = w2.days[3].exercises.find((e) => e.name === 'Incline Machine Press')!
    await setRep('2026-07-13', ex.id, 5, 150)
    const after = (await db.weeks.get('2026-07-13'))!.days[3].exercises.find((e) => e.id === ex.id)!
    expect(after.setReps[5]).toBe(99) // clamped
    expect(after.setReps.length).toBe(6)
  })

  it('description edits reconcile setReps without deleting logged values', async () => {
    await ensureSeeded()
    const w2 = (await db.weeks.get('2026-07-13'))!
    const curl = w2.days[1].exercises.find((e) => e.name === 'hammer curl')! // 3 × 8–12, logged 12/12/12
    await setExerciseDescription('2026-07-13', curl.id, '5 sets × 8–12')
    let after = (await db.weeks.get('2026-07-13'))!.days[1].exercises.find((e) => e.id === curl.id)!
    expect(after.setReps).toEqual([12, 12, 12, null, null]) // grown
    await setExerciseDescription('2026-07-13', curl.id, '2 sets × 8–12')
    after = (await db.weeks.get('2026-07-13'))!.days[1].exercises.find((e) => e.id === curl.id)!
    expect(after.setReps).toEqual([12, 12, 12]) // trailing nulls trimmed, logged values kept
  })

  it('copyExercisesToDay appends clean clones in plan order, sources untouched', async () => {
    await ensureSeeded()
    const w2 = (await db.weeks.get('2026-07-13'))!
    const [first, second] = w2.days[0].exercises
    const before5 = w2.days[5].exercises.length
    // ids passed in reverse — plan order must win
    await copyExercisesToDay('2026-07-13', [second.id, first.id], 5)
    const after = (await db.weeks.get('2026-07-13'))!
    const clones = after.days[5].exercises.slice(before5)
    expect(clones.map((e) => e.name)).toEqual([first.name, second.name])
    for (const [i, src] of [first, second].entries()) {
      const clone = clones[i]
      expect(clone.id).not.toBe(src.id)
      expect(clone.sourceId).toBeNull()
      expect(clone.description).toBe(src.description)
      expect(clone.setReps).toEqual(new Array(src.setReps.length).fill(null))
      expect(clone.weightText).toBe('')
      expect(clone.prevWeightText).toBe(src.weightText || src.prevWeightText)
    }
    expect(after.days[0].exercises.map((e) => e.id)).toEqual(w2.days[0].exercises.map((e) => e.id))
  })

  it('moveExercisesToDay appends across days in plan order and keeps logged data', async () => {
    await ensureSeeded()
    const w2 = (await db.weeks.get('2026-07-13'))!
    const [d0a, d0b] = w2.days[0].exercises
    const d1a = w2.days[1].exercises[0]
    const before5 = w2.days[5].exercises.length
    // scrambled input order — result must follow day-then-position order
    await moveExercisesToDay('2026-07-13', [d1a.id, d0b.id, d0a.id], 5)
    const after = (await db.weeks.get('2026-07-13'))!
    const moved = after.days[5].exercises.slice(before5)
    expect(moved.map((e) => e.id)).toEqual([d0a.id, d0b.id, d1a.id])
    expect(moved[1].setReps).toEqual(d0b.setReps) // logged reps travel
    expect(moved[1].weightText).toBe(d0b.weightText)
    expect(after.days[0].exercises.map((e) => e.id)).toEqual(w2.days[0].exercises.slice(2).map((e) => e.id))
    expect(after.days[1].exercises.some((e) => e.id === d1a.id)).toBe(false)
  })

  it('moveExercisesToDay to the same day appends at the end', async () => {
    await ensureSeeded()
    const w2 = (await db.weeks.get('2026-07-13'))!
    const ids = w2.days[1].exercises.map((e) => e.id)
    await moveExercisesToDay('2026-07-13', [ids[0]], 1)
    const after = (await db.weeks.get('2026-07-13'))!
    expect(after.days[1].exercises.map((e) => e.id)).toEqual([...ids.slice(1), ids[0]])
  })

  it('reorder validates id sets and applies order', async () => {
    await ensureSeeded()
    const w2 = (await db.weeks.get('2026-07-13'))!
    const ids = w2.days[1].exercises.map((e) => e.id)
    const reversed = [...ids].reverse()
    await setExerciseOrder('2026-07-13', 1, reversed)
    const after = (await db.weeks.get('2026-07-13'))!
    expect(after.days[1].exercises.map((e) => e.id)).toEqual(reversed)
    await setExerciseOrder('2026-07-13', 1, reversed.slice(1)) // wrong length → ignored
    expect((await db.weeks.get('2026-07-13'))!.days[1].exercises.map((e) => e.id)).toEqual(reversed)
  })
})

describe('export / import / reset', () => {
  it('round-trips through validateImport + importData', async () => {
    await ensureSeeded()
    const w2 = (await db.weeks.get('2026-07-13'))!
    await setWeightText('2026-07-13', w2.days[0].exercises[0].id, 'test-weight')
    const dump = await exportData()
    expect(dump.version).toBe(1)
    await resetToSeed()
    const fresh = (await db.weeks.get('2026-07-13'))!
    expect(fresh.days[0].exercises[0].weightText).not.toBe('test-weight')
    const weeks = validateImport(JSON.parse(JSON.stringify(dump)))
    await importData(weeks)
    const restored = (await db.weeks.get('2026-07-13'))!
    expect(restored.days[0].exercises[0].weightText).toBe('test-weight')
    expect(await db.weeks.count()).toBe(2)
  })

  it('validateImport rejects malformed backups', async () => {
    await ensureSeeded()
    const dump = JSON.parse(JSON.stringify(await exportData())) as Record<string, unknown>
    expect(() => validateImport({})).toThrow(/version/)
    expect(() => validateImport({ version: 1, weeks: [] })).toThrow(/no weeks/)
    const badDay = JSON.parse(JSON.stringify(dump))
    badDay.weeks[0].days[6].dayOfWeek = 0 // duplicate Monday, no Sunday
    expect(() => validateImport(badDay)).toThrow(/Mon–Sun/)
    const badRep = JSON.parse(JSON.stringify(dump))
    badRep.weeks[1].days[0].exercises[1].setReps[0] = 3.5
    expect(() => validateImport(badRep)).toThrow(/rep value/)
    const notMonday = JSON.parse(JSON.stringify(dump))
    notMonday.weeks[0].id = '2026-07-07'
    notMonday.weeks[0].startDate = '2026-07-07'
    expect(() => validateImport(notMonday)).toThrow(/Monday/)
  })
})
