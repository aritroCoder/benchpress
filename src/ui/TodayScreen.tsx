import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Week } from '../domain/types'
import { DAY_ABBR, DAY_NAMES, dayOfWeekMon0, mondayOf, todayDate, weekDateRange, weekLabel } from '../domain/dates'
import { progressionBadges } from '../domain/progression'
import { ExerciseCard } from './components/ExerciseCard'


function DayPage({ week, dayIdx, editable }: { week: Week; dayIdx: number; editable: boolean }) {
  const prevWeek = useLiveQuery(
    async () => (week.prevWeekId ? await db.weeks.get(week.prevWeekId) : undefined),
    [week.prevWeekId],
  )
  const badges = useMemo(() => progressionBadges(week, prevWeek ?? null), [week, prevWeek])
  const day = week.days[dayIdx]
  const isRest = day.exercises.length === 0

  return (
    <div className="day-page">
      <div className="day-head">
        <h2>{DAY_NAMES[day.dayOfWeek]}</h2>
        {day.split && <span className="split-tag">{day.split}</span>}
      </div>
      {isRest ? (
        <div className="empty-state">
          <p className="empty-big">{day.split.toLowerCase() === 'rest' ? 'Rest day' : 'Nothing planned'}</p>
          <p className="empty-sub">
            {day.split.toLowerCase() === 'rest' ? 'Recovery is training too.' : 'Add exercises in the Plan tab.'}
          </p>
        </div>
      ) : (
        day.exercises.map((ex) => (
          <ExerciseCard key={ex.id} weekId={week.id} ex={ex} badge={badges.get(ex.id)} editable={editable} />
        ))
      )}
    </div>
  )
}

export function TodayScreen({ goPlan }: { goPlan: () => void }) {
  const weeks = useLiveQuery(() => db.weeks.orderBy('id').toArray(), [])
  const today = todayDate()
  const [dayIdx, setDayIdx] = useState(() => dayOfWeekMon0(today))
  const dirRef = useRef(0)

  if (!weeks || weeks.length === 0) return null

  const activeId = mondayOf(today)
  const activeWeek = weeks.find((w) => w.id === activeId)
  const latest = weeks[weeks.length - 1]
  // Sunday-gap fallback: no week contains today → preview the upcoming week read-only
  const week = activeWeek ?? latest
  const previewMode = !activeWeek
  const isSunday = dayOfWeekMon0(today) === 6
  const nextWeekReady = activeWeek != null && latest.id > activeWeek.id

  const go = (n: number) => {
    if (n < 0 || n > 6 || n === dayIdx) return
    dirRef.current = n > dayIdx ? 1 : -1
    setDayIdx(n)
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{weekLabel(week)}</h1>
        <span className="date-range">{weekDateRange(week)}</span>
      </header>

      {previewMode && (
        <div className="banner">
          <span>
            Next week is ready — starts Monday. <strong>View only until then.</strong>
          </span>
        </div>
      )}
      {nextWeekReady && isSunday && (
        <button type="button" className="banner banner-action" onClick={goPlan}>
          <span>
            Next week is ready → <strong>plan it</strong>
          </span>
        </button>
      )}

      <div className="pager">
        <motion.div
          key={`${week.id}:${dayIdx}`}
          initial={{ x: dirRef.current * 10, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          dragSnapToOrigin
          onDragEnd={(_, info) => {
            if (info.offset.x < -56) go(dayIdx + 1)
            else if (info.offset.x > 56) go(dayIdx - 1)
          }}
        >
          <DayPage week={week} dayIdx={dayIdx} editable={!previewMode} />
        </motion.div>
      </div>

      <div className="day-chips">
        {week.days.map((d, i) => (
          <button
            key={i}
            type="button"
            className={i === dayIdx ? 'chip active' : 'chip'}
            onClick={() => go(i)}
          >
            {i === dayIdx && (
              <motion.span className="chip-ind" layoutId="chip-ind" transition={{ duration: 0.18, ease: 'easeOut' }} />
            )}
            <span className="chip-day">
              {DAY_ABBR[i]}
              {!previewMode && i === dayOfWeekMon0(today) && <span className="today-dot" />}
            </span>
            <span className="chip-split">{d.split ? d.split[0] : '·'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
