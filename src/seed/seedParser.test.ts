import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MESO9_OPTIONS, parseCsv, parseSeedCsv } from './seedParser'
import { progressionBadges } from '../domain/progression'
import type { Week } from '../domain/types'

const csv = readFileSync(join(__dirname, '../../fixtures/mesocycle_9.csv'), 'utf8')

function findEx(w: Week, dayOfWeek: number, name: string) {
  return w.days[dayOfWeek].exercises.find((e) => e.name === name)
}

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas/newlines, CRLF', () => {
    const rows = parseCsv('a,"b,c","d""e"\r\n"multi\nline",x,')
    expect(rows).toEqual([
      ['a', 'b,c', 'd"e'],
      ['multi\nline', 'x', ''],
    ])
  })
  it('strips BOM', () => {
    expect(parseCsv('﻿a,b')).toEqual([['a', 'b']])
  })
})

describe('parseSeedCsv on the real Mesocycle 9 fixture', () => {
  const { weeks, issues } = parseSeedCsv(csv, MESO9_OPTIONS)
  const [w1, w2] = weeks

  it('parses exactly 2 weeks with correct identity and chain', () => {
    expect(weeks).toHaveLength(2)
    expect(issues).toEqual([])
    expect(w1.id).toBe('2026-07-06')
    expect(w2.id).toBe('2026-07-13')
    expect(w1.prevWeekId).toBeNull()
    expect(w2.prevWeekId).toBe('2026-07-06')
    expect(w1.mesoNumber).toBe(9)
    expect(w1.weekNumber).toBe(1)
    expect(w2.weekNumber).toBe(2)
  })

  it('every week has 7 days, Monday-zero, Sunday is Rest with no exercises', () => {
    for (const w of weeks) {
      expect(w.days.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6])
      expect(w.days[6].split).toBe('Rest')
      expect(w.days[6].exercises).toEqual([])
    }
    expect(w1.days[0].split).toBe('Push')
    expect(w1.days[1].split).toBe('Pull')
    expect(w1.days[2].split).toBe('Legs')
  })

  it('Week 1 Monday bench: logged 8/8/8 with a visible 4th prescribed slot', () => {
    const bench = findEx(w1, 0, 'Barbell Bench Press')!
    expect(bench.description).toBe('4 sets × 5–8 reps')
    expect(bench.setReps).toEqual([8, 8, 8, null]) // 4 slots: max(logged=3, prescribed=4)
    expect(bench.prevWeightText).toBe('15+15')
    expect(bench.weightText).toBe('12.5+12.5')
  })

  it('quoted weight cells with embedded commas survive', () => {
    const squat = findEx(w1, 5, 'Barbell Squat')!
    expect(squat.weightText).toBe('12.5+12.5, large barbell')
    const rdl = findEx(w2, 5, 'barbell rdl')!
    expect(rdl.prevWeightText).toBe('5+5, large barbell')
  })

  it('unparseable target keeps 3 slots; logged sets kept', () => {
    const dragon = findEx(w1, 2, 'dragon flags (abs)')!
    expect(dragon.description).toBe('ab crunches')
    expect(dragon.setReps).toEqual([15, 15, 15])
  })

  it('week 2 exercises are lineage-linked to week 1 same-day counterparts', () => {
    const bench2 = findEx(w2, 0, 'Barbell Bench Press')!
    const bench1 = findEx(w1, 0, 'Barbell Bench Press')!
    expect(bench2.sourceId).toBe(bench1.id)
    // pullups renamed variants stay unlinked where names differ
    const w2Pullups = findEx(w2, 1, 'pullups')!
    const w1Pullups = findEx(w1, 1, 'pullups')!
    expect(w2Pullups.sourceId).toBe(w1Pullups.id)
  })

  it('full parse output snapshot (guards against silent column drift)', () => {
    expect(weeks).toMatchSnapshot()
  })
})

describe('Week 2 badge truth table (fixture-derived)', () => {
  const { weeks } = parseSeedCsv(csv, MESO9_OPTIONS)
  const [w1, w2] = weeks
  const badges = progressionBadges(w2, w1)

  const expectBadge = (dayOfWeek: number, name: string, progress: boolean) => {
    const ex = findEx(w2, dayOfWeek, name)
    expect(ex, `${name} on day ${dayOfWeek}`).toBeDefined()
    expect(badges.get(ex!.id)?.progress, `${name} progress`).toBe(progress)
  }

  it('ON: exercises that hit top of range on all prescribed sets in week 1', () => {
    expectBadge(0, 'tricep overhead extn (db)', true) // 12/12/12 vs 3×8–12
    expectBadge(5, 'barbell rdl', true) // 12/12 vs 2×8–12 (extra 3rd set ignored)
    expectBadge(5, 'Barbell Squat', true) // 8/8/8/8 vs 4×5–8
    expectBadge(5, 'db lateral raise + front raise (superset)', true) // 20/20/20 vs 3×12–20
  })

  it('renamed in the live sheet: Wed "dumbbel rdl" → "barbell rdl" gets no badge', () => {
    // w1 Wed dumbbel rdl hit 12/12/12 (would qualify), but the w2 name differs and
    // w1's only "barbell rdl" (Saturday) is consumed by w2 Saturday's — no match.
    const wedRdl = findEx(w2, 2, 'barbell rdl')!
    expect(wedRdl).toBeDefined()
    expect(badges.get(wedRdl.id)?.matched).toBe(false)
    expect(badges.get(wedRdl.id)?.progress).toBe(false)
    expectBadge(2, 'Hack Squat', false) // w1: 10/9/8 vs 3×6–10, two sets short
  })

  it('OFF: short sets, unlogged, or unparseable', () => {
    expectBadge(0, 'Barbell Bench Press', false) // only 3 of 4 prescribed sets logged
    expectBadge(0, 'dips', false) // 10/10/9, third set short
    expectBadge(1, 'pullups', false) // 5/4/3 < 8
    expectBadge(1, 'machine Lateral Raise', false) // 19/18/18 < 20
    expectBadge(2, 'dragon flags (abs)', false) // unparseable target
    expectBadge(3, 'Incline Machine Press', false) // unlogged in week 1
    expectBadge(0, 'shoulder warmup', false) // no target
  })

  it('last-weight display prefers week 1 logged weight, falls back to carried prev', () => {
    const lat = findEx(w2, 1, 'Lat pulldown')!
    expect(badges.get(lat.id)?.lastWeightText).toBe('35') // w1 logged Wt
    const inclinePress = findEx(w2, 3, 'Incline Machine Press')!
    expect(badges.get(inclinePress.id)?.lastWeightText).toBe('12.5+12.5') // w1 unlogged → its prev
  })
})
