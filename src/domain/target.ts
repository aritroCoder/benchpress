import type { TargetSpec } from './types'

const MAX_SETS = 10
const MAX_REPS = 99

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function bounded(sets: number, repLow: number, repHigh: number): TargetSpec | null {
  if (sets < 1 || sets > MAX_SETS) return null
  if (repLow < 1 || repHigh < 1 || repLow > MAX_REPS || repHigh > MAX_REPS) return null
  if (repLow > repHigh) return null
  return { sets, repLow, repHigh }
}

// Superset-sum: "1 set + 1 set + 1 set x 10-15 reps" → 3 sets × 10–15.
// Must run BEFORE the simple pattern, which would read it as 1 set and over-award progression.
const SUPERSET = /((?:\d+\s*sets?\s*\+\s*)+\d+\s*sets?)\s*x\s*(\d+)\s*-\s*(\d+)/
// "4 sets x 5-8 reps", "2 set x 8-12 reps", "3 x 6-10", trailing prose OK (first match wins)
const RANGE = /(\d+)\s*(?:sets?)?\s*x\s*(\d+)\s*-\s*(\d+)(?:\s*reps?)?/
// Fixed reps: "3 x 8" → 3 sets × 8–8 (must not be the prefix of a range)
const FIXED = /(\d+)\s*(?:sets?)?\s*x\s*(\d+)(?:\s*reps?)?(?!\s*-)/

/** Parse a free-text description into a target, or null if progression-ineligible. */
export function parseTarget(description: string): TargetSpec | null {
  const s = normalize(description)
  if (!s) return null

  const superset = SUPERSET.exec(s)
  if (superset) {
    const sets = superset[1]
      .split('+')
      .reduce((sum, part) => sum + Number(/\d+/.exec(part)![0]), 0)
    return bounded(sets, Number(superset[2]), Number(superset[3]))
  }

  const range = RANGE.exec(s)
  if (range) return bounded(Number(range[1]), Number(range[2]), Number(range[3]))

  const fixed = FIXED.exec(s)
  if (fixed) return bounded(Number(fixed[1]), Number(fixed[2]), Number(fixed[2]))

  return null
}
