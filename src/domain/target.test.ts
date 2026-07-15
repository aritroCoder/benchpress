import { describe, expect, it } from 'vitest'
import { parseTarget } from './target'

describe('parseTarget — real fixture descriptions', () => {
  it.each([
    ['4 sets × 5–8 reps', { sets: 4, repLow: 5, repHigh: 8 }],
    ['3 sets × 6–10 reps', { sets: 3, repLow: 6, repHigh: 10 }],
    ['3 sets × 8–12', { sets: 3, repLow: 8, repHigh: 12 }],
    ['2 set × 8–12 reps', { sets: 2, repLow: 8, repHigh: 12 }], // singular "set" appears in real data
    ['3 sets × 10–15 reps', { sets: 3, repLow: 10, repHigh: 15 }],
    ['3 sets x 6-8 reps', { sets: 3, repLow: 6, repHigh: 8 }], // ascii x + hyphen
    ['3 × 8–12', { sets: 3, repLow: 8, repHigh: 12 }],
    ['3 × 6–10', { sets: 3, repLow: 6, repHigh: 10 }],
    ['4 × 10–15', { sets: 4, repLow: 10, repHigh: 15 }],
    ['3 sets × 15–20', { sets: 3, repLow: 15, repHigh: 20 }],
    ['3 sets x 6-8 reps (neutral, supinated, jumping pronated)', { sets: 3, repLow: 6, repHigh: 8 }],
    ['2 × 12–20 lateral + same reps front', { sets: 2, repLow: 12, repHigh: 20 }],
    ['3 × 12–20 lateral + same reps front', { sets: 3, repLow: 12, repHigh: 20 }],
    ['2 sets x 10-15', { sets: 2, repLow: 10, repHigh: 15 }],
  ])('%s', (input, expected) => {
    expect(parseTarget(input)).toEqual(expected)
  })

  it('sums superset set-groups (the v1 footgun)', () => {
    expect(parseTarget('1 set + 1 set + 1 set x 10–15 reps')).toEqual({ sets: 3, repLow: 10, repHigh: 15 })
    expect(parseTarget('2 sets + 1 set x 8–12')).toEqual({ sets: 3, repLow: 8, repHigh: 12 })
  })

  it('accepts fixed-rep NxM', () => {
    expect(parseTarget('3 x 8')).toEqual({ sets: 3, repLow: 8, repHigh: 8 })
    expect(parseTarget('4 sets x 12 reps')).toEqual({ sets: 4, repLow: 12, repHigh: 12 })
  })
})

describe('parseTarget — ineligible descriptions', () => {
  it.each([
    [''],
    ['   '],
    ['shoulder warmup'],
    ['2–3 sets'], // no rep range
    ['ab crunches'],
    ['yoga mat ab crunches'],
    ['forearm'],
  ])('%s → null', (input) => {
    expect(parseTarget(input)).toBeNull()
  })
})

describe('parseTarget — sanity bounds', () => {
  it('rejects zero/absurd sets and reps', () => {
    expect(parseTarget('0 sets x 8-12')).toBeNull()
    expect(parseTarget('11 sets x 8-12')).toBeNull()
    expect(parseTarget('3 sets x 0-12')).toBeNull()
    expect(parseTarget('3 sets x 8-120')).toBeNull()
  })
  it('rejects reversed ranges', () => {
    expect(parseTarget('3 sets x 12-8')).toBeNull()
  })
})
