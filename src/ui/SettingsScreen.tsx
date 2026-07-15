import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  exportData,
  getLastExportAt,
  importData,
  markExported,
  resetToSeed,
  validateImport,
} from '../db/repo'
import { isoLocalDate } from '../domain/dates'

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function SettingsScreen() {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)
  const weekCount = useLiveQuery(() => db.weeks.count(), [])
  const lastExport = useLiveQuery(() => getLastExportAt(), [])

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
    void navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null) setUsage(`${(e.usage / 1024).toFixed(0)} KB used`)
    })
  }, [])

  const requestPersist = async () => {
    const ok = await navigator.storage?.persist?.()
    setPersisted(ok ?? false)
  }

  const doExport = async () => {
    const data = await exportData()
    downloadJson(data, `benchpress-export-${isoLocalDate(new Date())}.json`)
    await markExported()
    setStatus('Exported.')
  }

  const doImport = async (file: File) => {
    setStatus('')
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const weeks = validateImport(parsed)
      if (!window.confirm(`Replace ALL current data with ${weeks.length} weeks from this backup?`)) return
      // safety net: auto-export current data before replacing
      downloadJson(await exportData(), `benchpress-pre-import-backup-${isoLocalDate(new Date())}.json`)
      await importData(weeks)
      setStatus(`Imported ${weeks.length} weeks.`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'import failed')
    }
  }

  const doReset = async () => {
    if (!window.confirm('Reset to the original Mesocycle 9 seed? ALL logged data will be lost.')) return
    await resetToSeed()
    setStatus('Reset to seed.')
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Settings</h1>
      </header>

      <section className="settings-group">
        <h2>Backup</h2>
        <p className="settings-note">
          Your data lives only in this browser. The export file is the real backup — take one regularly.
          {lastExport != null && lastExport > 0 ? ` Last export: ${isoLocalDate(new Date(lastExport))}` : ' Never exported yet.'}
        </p>
        <button type="button" className="btn primary" onClick={() => void doExport()}>
          Export JSON
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Import backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void doImport(f)
            e.target.value = ''
          }}
        />
      </section>

      <section className="settings-group">
        <h2>Storage</h2>
        <p className="settings-note">
          {weekCount ?? '…'} weeks stored. {usage}
          <br />
          Persistent storage: {persisted == null ? 'unknown' : persisted ? 'granted' : 'not granted'} — this is a
          request, not a guarantee. Install to home screen and keep exports.
        </p>
        {persisted === false && (
          <button type="button" className="btn" onClick={() => void requestPersist()}>
            Request persistent storage
          </button>
        )}
      </section>

      <section className="settings-group">
        <h2>Danger zone</h2>
        <button type="button" className="btn danger" onClick={() => void doReset()}>
          Reset to seed
        </button>
      </section>

      {status && <p className="status-line">{status}</p>}
      <p className="version-line">Benchpress v2.0.0 · local-first · offline</p>
    </div>
  )
}
