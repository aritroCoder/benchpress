import { describe, expect, it } from 'vitest'
import type { Week } from './types'
import { generateNextWeek, rolloverPlan, weekContains } from './rollover'

function makeWeek(partial: Partial<Week> = {}): Week {
  return {
    id: '2026-07-13',
    startDate: '2026-07-13',
    mesoNumber: 9,
    weekNumber: 2,
    prevWeekId: '2026-07-06',
    days: Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      split: i === 6 ? 'Rest' : 'Push',
      exercises:
        i === 0
          ? [
              {
                id: 'src-bench',
                sourceId: 'w1-bench',
                name: 'Barbell Bench Press',
                description: '4 sets × 5–8 reps',
                setReps: [6, 6, 6, null],
                weightText: '15+15',
                prevWeightText: '12.5+12.5',
              },
              {
                id: 'src-warmup',
                sourceId: null,
                name: 'shoulder warmup',
                description: '',
                setReps: [null, null, null],
                weightText: '',
                prevWeightText: '',
              },
            ]
          : [],
    })),
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('rolloverPlan', () => {
  const latest = '2026-07-13'
  it('Saturday → no rollover', () => {
    expect(rolloverPlan(latest, new Date(2026, 6, 18))).toBeNull()
  })
  it('Sunday → next Monday generated', () => {
    expect(rolloverPlan(latest, new Date(2026, 6, 19))).toBe('2026-07-20')
  })
  it('Monday after a missed Sunday → this Monday', () => {
    expect(rolloverPlan(latest, new Date(2026, 6, 20))).toBe('2026-07-20')
  })
  it('mid-week, current week exists → null', () => {
    expect(rolloverPlan(latest, new Date(2026, 6, 14))).toBeNull()
  })
  it('3-week gap → single jump to the current week', () => {
    expect(rolloverPlan(latest, new Date(2026, 7, 12))).toBe('2026-08-10')
  })
  it('future week already generated → null', () => {
    expect(rolloverPlan('2026-07-20', new Date(2026, 6, 19))).toBeNull()
  })
})

describe('generateNextWeek', () => {
  it('copies structure, resets logs, carries weights, links prevWeekId + sourceId', () => {
    const src = makeWeek()
    const next = generateNextWeek(src, '2026-07-20', 123)
    expect(next.id).toBe('2026-07-20')
    expect(next.mesoNumber).toBe(9)
    expect(next.weekNumber).toBe(3)
    expect(next.prevWeekId).toBe('2026-07-13')
    const bench = next.days[0].exercises[0]
    expect(bench.name).toBe('Barbell Bench Press')
    expect(bench.sourceId).toBe('src-bench')
    expect(bench.id).not.toBe('src-bench')
    expect(bench.setReps).toEqual([null, null, null, null]) // sized from parsed target (4 sets)
    expect(bench.weightText).toBe('')
    expect(bench.prevWeightText).toBe('15+15')
    expect(next.days[6].split).toBe('Rest')
  })

  it('prev-weight cascade when src was never logged', () => {
    const src = makeWeek()
    src.days[0].exercises[0].weightText = ''
    const next = generateNextWeek(src, '2026-07-20', 0)
    expect(next.days[0].exercises[0].prevWeightText).toBe('12.5+12.5')
  })

  it('unparseable target → 3 null slots', () => {
    const next = generateNextWeek(makeWeek(), '2026-07-20', 0)
    expect(next.days[0].exercises[1].setReps).toEqual([null, null, null])
  })

  it('meso boundary: week 4 → Meso N+1 Week 1', () => {
    const src = makeWeek({ weekNumber: 4 })
    const next = generateNextWeek(src, '2026-07-20', 0)
    expect(next.mesoNumber).toBe(10)
    expect(next.weekNumber).toBe(1)
  })

  it('deep-copy independence: mutating the new week does not touch the source', () => {
    const src = makeWeek()
    const next = generateNextWeek(src, '2026-07-20', 0)
    next.days[0].exercises[0].setReps[0] = 99
    next.days[0].exercises[0].name = 'changed'
    expect(src.days[0].exercises[0].setReps[0]).toBe(6)
    expect(src.days[0].exercises[0].name).toBe('Barbell Bench Press')
  })

  it('edits to src carry forward (add/remove/rename before generation)', () => {
    const src = makeWeek()
    src.days[0].exercises.pop() // remove warmup
    src.days[0].exercises[0].name = 'Paused Bench Press'
    src.days[1].exercises.push({
      id: 'new-row',
      sourceId: null,
      name: 'Kroc Row',
      description: '2 × 8–12',
      setReps: [null, null],
      weightText: '',
      prevWeightText: '',
    })
    const next = generateNextWeek(src, '2026-07-20', 0)
    expect(next.days[0].exercises).toHaveLength(1)
    expect(next.days[0].exercises[0].name).toBe('Paused Bench Press')
    expect(next.days[1].exercises[0].name).toBe('Kroc Row')
    expect(next.days[1].exercises[0].sourceId).toBe('new-row')
  })
})

describe('weekContains', () => {
  it('true for every day Mon–Sun of the week', () => {
    expect(weekContains('2026-07-13', new Date(2026, 6, 13))).toBe(true)
    expect(weekContains('2026-07-13', new Date(2026, 6, 19))).toBe(true)
    expect(weekContains('2026-07-13', new Date(2026, 6, 20))).toBe(false)
  })
})
