export interface Exercise {
  id: string
  /** id of the prev-week exercise this was copied from at generation time */
  sourceId: string | null
  name: string
  /** free-text target: sets, rep ranges, form cues — e.g. "4 sets × 5–8 reps" */
  description: string
  setReps: (number | null)[]
  /** one free-text weight per exercise, e.g. "12.5+12.5, large barbell" */
  weightText: string
  /** snapshot written at generation/seed time; display fallback only, never rewritten */
  prevWeightText: string
}

export interface Day {
  /** 0 = Monday … 6 = Sunday (Monday-zero; converted from JS getDay() only inside dates.ts) */
  dayOfWeek: number
  split: string
  exercises: Exercise[]
}

export interface Week {
  /** === startDate, local Monday "YYYY-MM-DD"; sorts chronologically as a string */
  id: string
  startDate: string
  mesoNumber: number
  /** 1..4 within the mesocycle — counts TRACKED weeks, not calendar weeks */
  weekNumber: number
  /** generation chain; the authority for "previous week", never date math */
  prevWeekId: string | null
  /** always 7 entries, dayOfWeek 0..6 exactly once */
  days: Day[]
  createdAt: number
  updatedAt: number
}

export interface TargetSpec {
  sets: number
  repLow: number
  repHigh: number
}

export const WEEKS_PER_MESO = 4
