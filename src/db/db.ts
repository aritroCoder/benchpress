import Dexie, { type Table } from 'dexie'
import type { Week } from '../domain/types'

export interface MetaRow {
  key: string
  value: unknown
}

export class BenchpressDB extends Dexie {
  weeks!: Table<Week, string>
  meta!: Table<MetaRow, string>

  constructor(name = 'benchpress') {
    super(name)
    // Schema evolution happens via additional version(n).upgrade() blocks here.
    // meta.schemaVersion stamps the EXPORT format only.
    this.version(1).stores({
      weeks: 'id, [mesoNumber+weekNumber]',
      meta: 'key',
    })
  }
}

export const db = new BenchpressDB()
