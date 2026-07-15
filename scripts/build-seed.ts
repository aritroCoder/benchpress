// Converts fixtures/mesocycle_9.csv into src/seed/seed.json (committed).
// The app seeds from the JSON — no CSV parsing at runtime.
// Run: npm run build-seed
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MESO9_OPTIONS, parseSeedCsv } from '../src/seed/seedParser'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const csv = readFileSync(join(root, 'fixtures/mesocycle_9.csv'), 'utf8')
const { weeks, issues } = parseSeedCsv(csv, MESO9_OPTIONS)

for (const issue of issues) console.warn('issue:', issue)
const out = join(root, 'src/seed/seed.json')
writeFileSync(out, JSON.stringify(weeks, null, 2) + '\n')
console.log(
  `wrote ${out}: ${weeks.length} weeks,`,
  weeks.map((w) => `W${w.weekNumber}=${w.days.reduce((n, d) => n + d.exercises.length, 0)}ex`).join(' '),
)
