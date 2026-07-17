import { describe, expect, it } from 'vitest'
import { addDaysIso, dayOfWeekMon0, isoLocalDate, mondayOf, parseIso, weekDateRange, weekLabel } from './dates'

// vitest runs under TZ=America/New_York (see package.json) so DST is actually exercised.

describe('mondayOf', () => {
  it('maps every weekday of Jul 13–19 2026 to Monday Jul 13', () => {
    for (let d = 13; d <= 19; d++) {
      expect(mondayOf(new Date(2026, 6, d))).toBe('2026-07-13')
    }
  })
  it('Sunday belongs to the week that started the previous Monday', () => {
    expect(mondayOf(new Date(2026, 6, 19))).toBe('2026-07-13') // Sun Jul 19
    expect(mondayOf(new Date(2026, 6, 20))).toBe('2026-07-20') // Mon Jul 20
  })
  it('crosses month and year boundaries', () => {
    expect(mondayOf(new Date(2026, 0, 1))).toBe('2025-12-29') // Thu Jan 1 2026
    expect(mondayOf(new Date(2026, 7, 1))).toBe('2026-07-27') // Sat Aug 1
  })
  it('is stable across DST transitions (America/New_York)', () => {
    // Spring forward: Sun Mar 8 2026
    expect(mondayOf(new Date(2026, 2, 8))).toBe('2026-03-02')
    expect(mondayOf(new Date(2026, 2, 9))).toBe('2026-03-09')
    // Fall back: Sun Nov 1 2026
    expect(mondayOf(new Date(2026, 10, 1))).toBe('2026-10-26')
    expect(mondayOf(new Date(2026, 10, 2))).toBe('2026-11-02')
  })
})

describe('addDaysIso', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysIso('2026-07-27', 7)).toBe('2026-08-03')
    expect(addDaysIso('2026-07-13', -7)).toBe('2026-07-06')
  })
  it('is DST-safe across spring-forward week', () => {
    expect(addDaysIso('2026-03-02', 7)).toBe('2026-03-09')
    expect(addDaysIso('2026-10-26', 7)).toBe('2026-11-02')
  })
})

describe('parseIso / isoLocalDate', () => {
  it('round-trips in local time', () => {
    const d = parseIso('2026-07-13')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(13)
    expect(isoLocalDate(d)).toBe('2026-07-13')
  })
  it('rejects garbage', () => {
    expect(() => parseIso('13/07/2026')).toThrow()
  })
})

describe('dayOfWeekMon0', () => {
  it('Monday-zero convention', () => {
    expect(dayOfWeekMon0(new Date(2026, 6, 13))).toBe(0) // Mon
    expect(dayOfWeekMon0(new Date(2026, 6, 14))).toBe(1) // Tue
    expect(dayOfWeekMon0(new Date(2026, 6, 19))).toBe(6) // Sun
  })
})

describe('labels', () => {
  it('weekLabel', () => {
    expect(weekLabel({ mesoNumber: 9, weekNumber: 2 })).toBe('Mesocycle 9 · Week 2')
  })
  it('weekDateRange same month and across months', () => {
    expect(weekDateRange({ startDate: '2026-07-13' })).toBe('Jul 13 – 19')
    expect(weekDateRange({ startDate: '2026-07-27' })).toBe('Jul 27 – Aug 2')
  })
})
