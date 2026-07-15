import type { Day, Exercise, Week } from '../domain/types'
import { DAY_NAMES, addDaysIso } from '../domain/dates'
import { normName } from '../domain/progression'
import { parseTarget } from '../domain/target'

export interface SeedOptions {
  mesoNumber: number
  /** local Monday of "Week 1" in the sheet, e.g. "2026-07-06" */
  week1StartDate: string
}

export interface SeedResult {
  weeks: Week[]
  issues: string[]
}

/** Character-scanning CSV → rows of cells. Handles quoted fields ("" escapes,
 *  embedded commas/newlines), CRLF, BOM, trailing empty cells. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else {
      cell += c
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// Fixed Mesocycle-9 column layout:
// Day(0), Split(1), Exercise(2), target(3), Set1–4(4–7), Wt prev(8), Wt(9)
const COL = { day: 0, split: 1, name: 2, desc: 3, set1: 4, prevWt: 8, wt: 9 } as const

function parseRep(cell: string): number | null {
  const m = /^\s*(\d+)/.exec(cell)
  if (!m) return null
  const n = Number(m[1])
  return n >= 0 && n <= 99 ? n : null
}

function emptyDays(): Day[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, split: '', exercises: [] }))
}

export function parseSeedCsv(csv: string, opts: SeedOptions): SeedResult {
  const rows = parseCsv(csv)
  const issues: string[] = []
  const weeks: Week[] = []
  let currentWeek: Week | null = null
  let currentDay: Day | null = null
  let exSeq = 0

  for (const rawRow of rows) {
    const cells = [...rawRow]
    while (cells.length < 10) cells.push('')
    const [c0, c1] = [cells[COL.day].trim(), cells[COL.split].trim()]

    const weekHeader = /^Week\s+(\d+)\b/i.exec(c0)
    if (weekHeader) {
      const weekNumber = Number(weekHeader[1])
      const startDate = addDaysIso(opts.week1StartDate, (weekNumber - 1) * 7)
      currentWeek = {
        id: startDate,
        startDate,
        mesoNumber: opts.mesoNumber,
        weekNumber,
        prevWeekId: weeks.length > 0 ? weeks[weeks.length - 1].id : null,
        days: emptyDays(),
        createdAt: 0,
        updatedAt: 0,
      }
      weeks.push(currentWeek)
      currentDay = null
      exSeq = 0
      continue
    }

    if (/^Day$/i.test(c0)) continue // column header row
    if (cells.every((c) => c.trim() === '')) continue // blank separator

    if (!currentWeek) {
      issues.push(`row before any week header: ${cells.slice(0, 3).join(',')}`)
      continue
    }

    if (c0 !== '') {
      const dayIdx = DAY_NAMES.findIndex((d) => d.toLowerCase() === c0.toLowerCase())
      if (dayIdx === -1) {
        issues.push(`unknown day "${c0}" in week ${currentWeek.weekNumber}`)
        currentDay = null
        continue
      }
      currentDay = currentWeek.days[dayIdx]
    }
    if (c1 !== '' && currentDay) currentDay.split = c1

    const name = cells[COL.name].trim()
    if (name === '' || name === '-') continue
    if (!currentDay) {
      issues.push(`exercise "${name}" outside any day in week ${currentWeek.weekNumber}`)
      continue
    }

    const description = cells[COL.desc].trim()
    const raw = [0, 1, 2, 3].map((i) => parseRep(cells[COL.set1 + i]))
    let lastLogged = raw.length
    while (lastLogged > 0 && raw[lastLogged - 1] == null) lastLogged--
    const slots = Math.max(lastLogged, parseTarget(description)?.sets ?? 3, 1)
    const setReps = Array.from({ length: slots }, (_, i) => raw[i] ?? null)

    const ex: Exercise = {
      id: `w${currentWeek.weekNumber}d${currentDay.dayOfWeek}e${exSeq++}`,
      sourceId: null,
      name,
      description,
      setReps,
      weightText: cells[COL.wt].trim(),
      prevWeightText: cells[COL.prevWt].trim(),
    }
    currentDay.exercises.push(ex)
  }

  // Wire sourceId lineage between consecutive weeks (same-day + name, in order)
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1]
    const cur = weeks[i]
    for (const day of cur.days) {
      const consumed = new Set<string>()
      const prevDay = prev.days[day.dayOfWeek]
      for (const ex of day.exercises) {
        const hit = prevDay.exercises.find((p) => !consumed.has(p.id) && normName(p.name) === normName(ex.name))
        if (hit) {
          consumed.add(hit.id)
          ex.sourceId = hit.id
        }
      }
    }
  }

  // Fail-fast structural validation: silent column drift must not produce plausible data
  if (weeks.length === 0) throw new Error('seed parse: no week headers found')
  for (const w of weeks) {
    if (w.days.length !== 7) throw new Error(`seed parse: week ${w.weekNumber} has ${w.days.length} days`)
    const total = w.days.reduce((n, d) => n + d.exercises.length, 0)
    if (total === 0) throw new Error(`seed parse: week ${w.weekNumber} has no exercises`)
    for (const d of w.days) {
      for (const e of d.exercises) {
        if (!e.name) throw new Error(`seed parse: empty exercise name in week ${w.weekNumber}`)
      }
    }
  }

  return { weeks, issues }
}

export const MESO9_OPTIONS: SeedOptions = { mesoNumber: 9, week1StartDate: '2026-07-06' }
