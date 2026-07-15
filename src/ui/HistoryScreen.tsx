import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Week } from '../domain/types'
import { DAY_NAMES, weekDateRange, weekLabel } from '../domain/dates'
import { progressionBadges } from '../domain/progression'
import { ExerciseCard } from './components/ExerciseCard'

function loggedDayCount(w: Week): number {
  return w.days.filter((d) => d.exercises.some((e) => e.setReps.some((r) => r != null))).length
}

function WeekDetail({ week, weeks }: { week: Week; weeks: Week[] }) {
  const [editing, setEditing] = useState(false)
  const prevWeek = weeks.find((w) => w.id === week.prevWeekId) ?? null
  const badges = useMemo(() => progressionBadges(week, prevWeek), [week, prevWeek])
  const days = week.days.filter((d) => d.exercises.length > 0)

  return (
    <motion.div
      className="week-detail"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
    >
      <div className="detail-tools">
        <button type="button" className={editing ? 'toggle on' : 'toggle'} onClick={() => setEditing(!editing)}>
          {editing ? 'done' : 'edit logs'}
        </button>
        {editing && <span className="detail-note">badges recompute live — fixing past logs is fine</span>}
      </div>
      {days.map((day) => (
        <div key={day.dayOfWeek} className="detail-day">
          <div className="detail-day-head">
            <h4>{DAY_NAMES[day.dayOfWeek]}</h4>
            {day.split && <span className="split-tag">{day.split}</span>}
          </div>
          {editing
            ? day.exercises.map((ex) => (
                <ExerciseCard key={ex.id} weekId={week.id} ex={ex} badge={badges.get(ex.id)} editable />
              ))
            : day.exercises.map((ex) => {
                const b = badges.get(ex.id)
                const logged = ex.setReps.filter((r) => r != null)
                return (
                  <div key={ex.id} className="detail-row">
                    <span className="detail-name">
                      {ex.name}
                      {b?.progress && <span className="mini-badge">↑</span>}
                    </span>
                    <span className="detail-reps">{logged.length > 0 ? logged.join(' · ') : '—'}</span>
                    <span className="detail-wt">{ex.weightText}</span>
                  </div>
                )
              })}
        </div>
      ))}
    </motion.div>
  )
}

export function HistoryScreen() {
  const weeks = useLiveQuery(() => db.weeks.orderBy('id').toArray(), [])
  const [openId, setOpenId] = useState<string | null>(null)

  if (!weeks || weeks.length === 0) return null

  const byMeso = new Map<number, Week[]>()
  for (const w of [...weeks].reverse()) {
    const list = byMeso.get(w.mesoNumber) ?? []
    list.push(w)
    byMeso.set(w.mesoNumber, list)
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>History</h1>
      </header>
      {[...byMeso.entries()].map(([meso, mesoWeeks]) => (
        <section key={meso} className="meso-group">
          <h2 className="meso-title">Mesocycle {meso}</h2>
          {mesoWeeks.map((w) => (
            <div key={w.id} className="week-item">
              <button type="button" className="week-row" onClick={() => setOpenId(openId === w.id ? null : w.id)}>
                <span className="week-row-label">{weekLabel(w)}</span>
                <span className="week-row-range">{weekDateRange(w)}</span>
                <span className="week-row-count">{loggedDayCount(w)}d logged</span>
              </button>
              <AnimatePresence initial={false}>
                {openId === w.id && <WeekDetail key="detail" week={w} weeks={weeks} />}
              </AnimatePresence>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
