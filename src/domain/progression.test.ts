import { describe, expect, it } from 'vitest'
import type { Day, Exercise, Week } from './types'
import { metProgression, normName, progressionBadges } from './progression'

let uid = 0
function ex(partial: Partial<Exercise> & { name: string }): Exercise {
  return {
    id: `e${++uid}`,
    sourceId: null,
    description: '',
    setReps: [],
    weightText: '',
    prevWeightText: '',
    ...partial,
  }
}

function week(days: Partial<Day>[], partial: Partial<Week> = {}): Week {
  const fullDays: Day[] = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    split: '',
    exercises: [],
  }))
  for (const d of days) Object.assign(fullDays[d.dayOfWeek!], d)
  return {
    id: '2026-07-13',
    startDate: '2026-07-13',
    mesoNumber: 9,
    weekNumber: 2,
    prevWeekId: '2026-07-06',
    days: fullDays,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('normName', () => {
  it('trims, lowercases, collapses whitespace', () => {
    expect(normName('  Barbell   Bench Press ')).toBe('barbell bench press')
  })
})

describe('metProgression', () => {
  const desc = '3 sets × 5–8 reps'
  it('true when all prescribed sets at top of range', () => {
    expect(metProgression(desc, [8, 8, 8])).toBe(true)
    expect(metProgression(desc, [9, 8, 10])).toBe(true)
  })
  it('false when any prescribed set below top', () => {
    expect(metProgression(desc, [8, 8, 7])).toBe(false)
    expect(metProgression(desc, [5, 6, 8])).toBe(false)
  })
  it('false when a prescribed slot is unlogged', () => {
    expect(metProgression(desc, [8, 8, null])).toBe(false)
    expect(metProgression(desc, [8, 8])).toBe(false)
  })
  it('extra sets beyond prescription are ignored', () => {
    expect(metProgression(desc, [8, 8, 8, 2])).toBe(true)
  })
  it('unparseable target → false', () => {
    expect(metProgression('shoulder warmup', [8, 8, 8])).toBe(false)
  })
})

describe('progressionBadges', () => {
  it('no prev week → nothing matched, snapshot weight shown', () => {
    const w = week([{ dayOfWeek: 0, exercises: [ex({ name: 'Bench', prevWeightText: '15+15' })] }])
    const badges = progressionBadges(w, null)
    const b = badges.get(w.days[0].exercises[0].id)!
    expect(b).toEqual({ matched: false, progress: false, lastWeightText: '15+15' })
  })

  it('sourceId lineage matches regardless of day/order and awards progress', () => {
    const prevEx = ex({ name: 'Bench', description: '3 × 5–8', setReps: [8, 8, 8], weightText: '15+15' })
    const prev = week([{ dayOfWeek: 0, exercises: [prevEx] }], { id: '2026-07-06', startDate: '2026-07-06' })
    // moved to Thursday, reordered — lineage still resolves
    const cur = week([{ dayOfWeek: 3, exercises: [ex({ name: 'bench', sourceId: prevEx.id })] }])
    const b = progressionBadges(cur, prev).get(cur.days[3].exercises[0].id)!
    expect(b.matched).toBe(true)
    expect(b.progress).toBe(true)
    expect(b.lastWeightText).toBe('15+15')
  })

  it('renamed exercise (same lineage) → no badge, but lineage weight still shown', () => {
    const prevEx = ex({ name: 'Bench', description: '3 × 5–8', setReps: [8, 8, 8], weightText: '15+15' })
    const prev = week([{ dayOfWeek: 0, exercises: [prevEx] }], { id: '2026-07-06' })
    const cur = week([{ dayOfWeek: 0, exercises: [ex({ name: 'Incline Bench', sourceId: prevEx.id })] }])
    const b = progressionBadges(cur, prev).get(cur.days[0].exercises[0].id)!
    expect(b.matched).toBe(false)
    expect(b.progress).toBe(false)
    expect(b.lastWeightText).toBe('15+15')
  })

  it('per-day-slot: same exercise on two days evaluated independently', () => {
    const wedPrev = ex({ name: 'Calf Raises', description: '3 × 10–15', setReps: [15, 15, 15], weightText: 'wed-wt' })
    const satPrev = ex({ name: 'Calf Raises', description: '4 × 10–15', setReps: [15, 15, 15, 10], weightText: 'sat-wt' })
    const prev = week(
      [
        { dayOfWeek: 2, exercises: [wedPrev] },
        { dayOfWeek: 5, exercises: [satPrev] },
      ],
      { id: '2026-07-06' },
    )
    const cur = week([
      { dayOfWeek: 2, exercises: [ex({ name: 'Calf Raises' })] },
      { dayOfWeek: 5, exercises: [ex({ name: 'Calf Raises' })] },
    ])
    const badges = progressionBadges(cur, prev)
    const wed = badges.get(cur.days[2].exercises[0].id)!
    const sat = badges.get(cur.days[5].exercises[0].id)!
    expect(wed.progress).toBe(true) // 3×10–15 all at 15
    expect(wed.lastWeightText).toBe('wed-wt')
    expect(sat.progress).toBe(false) // 4th set 10 < 15
    expect(sat.lastWeightText).toBe('sat-wt')
  })

  it('one-to-one: same-day match consumes; fallback cannot reuse a consumed exercise', () => {
    const prevEx = ex({ name: 'Curls', description: '3 × 8–12', setReps: [12, 12, 12] })
    const prev = week([{ dayOfWeek: 0, exercises: [prevEx] }], { id: '2026-07-06' })
    const monday = ex({ name: 'Curls' })
    const friday = ex({ name: 'Curls' })
    const cur = week([
      { dayOfWeek: 0, exercises: [monday] },
      { dayOfWeek: 4, exercises: [friday] },
    ])
    const badges = progressionBadges(cur, prev)
    expect(badges.get(monday.id)!.matched).toBe(true)
    expect(badges.get(friday.id)!.matched).toBe(false) // prev already consumed
  })

  it('fallback matches a moved exercise iff name unique in both weeks', () => {
    const prevEx = ex({ name: 'Facepulls', description: '3 × 12–15', setReps: [15, 15, 15], weightText: '30' })
    const prev = week([{ dayOfWeek: 1, exercises: [prevEx] }], { id: '2026-07-06' })
    const moved = ex({ name: 'Facepulls' })
    const cur = week([{ dayOfWeek: 4, exercises: [moved] }]) // moved Tue → Fri, no sourceId
    const b = progressionBadges(cur, prev).get(moved.id)!
    expect(b.matched).toBe(true)
    expect(b.progress).toBe(true)
    expect(b.lastWeightText).toBe('30')
  })

  it('ambiguous fallback (duplicate names) → no match', () => {
    const p1 = ex({ name: 'forearm' })
    const p2 = ex({ name: 'forearm' })
    const prev = week(
      [
        { dayOfWeek: 0, exercises: [p1] },
        { dayOfWeek: 2, exercises: [p2] },
      ],
      { id: '2026-07-06' },
    )
    const moved = ex({ name: 'forearm' })
    const cur = week([{ dayOfWeek: 4, exercises: [moved] }])
    expect(progressionBadges(cur, prev).get(moved.id)!.matched).toBe(false)
  })

  it('lastWeightText cascades: prev weight → prev snapshot → own snapshot', () => {
    const prevEx = ex({ name: 'Squat', weightText: '', prevWeightText: 'carried-fwd' })
    const prev = week([{ dayOfWeek: 0, exercises: [prevEx] }], { id: '2026-07-06' })
    const cur = week([{ dayOfWeek: 0, exercises: [ex({ name: 'Squat', sourceId: prevEx.id, prevWeightText: 'snap' })] }])
    expect(progressionBadges(cur, prev).get(cur.days[0].exercises[0].id)!.lastWeightText).toBe('carried-fwd')
  })
})
