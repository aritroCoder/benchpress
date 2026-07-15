import { useEffect, useState } from 'react'
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Day, Exercise, Week } from '../domain/types'
import { DAY_NAMES, weekDateRange, weekLabel } from '../domain/dates'
import { parseTarget } from '../domain/target'
import {
  addExercise,
  removeExercise,
  setExerciseDescription,
  setExerciseName,
  setExerciseOrder,
  setSplit,
} from '../db/repo'
import { useTextField } from './useTextField'

function hasLoggedData(ex: Exercise): boolean {
  return ex.weightText.trim() !== '' || ex.setReps.some((r) => r != null)
}

function ExerciseEditorRow({ weekId, ex }: { weekId: string; ex: Exercise }) {
  const controls = useDragControls()
  const name = useTextField(ex.name, (v) => void setExerciseName(weekId, ex.id, v))
  const desc = useTextField(ex.description, (v) => void setExerciseDescription(weekId, ex.id, v))
  const target = parseTarget(desc.text)

  const del = () => {
    if (hasLoggedData(ex) && !window.confirm(`Delete "${ex.name}"? It has logged sets/weights this week.`)) return
    void removeExercise(weekId, ex.id)
  }

  return (
    <Reorder.Item
      value={ex.id}
      dragListener={false}
      dragControls={controls}
      className="editor-row"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label="reorder"
        onPointerDown={(e) => {
          e.preventDefault()
          controls.start(e)
        }}
      >
        ⠿
      </button>
      <div className="editor-fields">
        <input
          className="editor-name"
          value={name.text}
          onChange={(e) => name.onChange(e.target.value)}
          onBlur={name.flush}
          placeholder="exercise name"
        />
        <input
          className="editor-desc"
          value={desc.text}
          onChange={(e) => desc.onChange(e.target.value)}
          onBlur={desc.flush}
          placeholder="target — e.g. 3 sets × 8–12 reps, form cues"
          autoCapitalize="off"
        />
        <span className={target ? 'target-hint ok' : 'target-hint warn'}>
          {target
            ? `${target.sets} × ${target.repLow}–${target.repHigh}`
            : 'not parseable — no progression tracking'}
        </span>
      </div>
      <motion.button type="button" className="del-btn" whileTap={{ scale: 0.88 }} onClick={del} aria-label="delete">
        ✕
      </motion.button>
    </Reorder.Item>
  )
}

function DayEditor({ week, day }: { week: Week; day: Day }) {
  const split = useTextField(day.split, (v) => void setSplit(week.id, day.dayOfWeek, v))
  const [order, setOrder] = useState(() => day.exercises.map((e) => e.id))

  useEffect(() => {
    setOrder(day.exercises.map((e) => e.id))
  }, [day.exercises])

  const byId = new Map(day.exercises.map((e) => [e.id, e]))

  return (
    <section className="day-editor">
      <div className="day-editor-head">
        <h3>{DAY_NAMES[day.dayOfWeek]}</h3>
        <input
          className="split-input"
          value={split.text}
          onChange={(e) => split.onChange(e.target.value)}
          onBlur={split.flush}
          placeholder="split"
        />
      </div>
      <Reorder.Group
        axis="y"
        values={order}
        onReorder={(ids: string[]) => {
          setOrder(ids)
          void setExerciseOrder(week.id, day.dayOfWeek, ids)
        }}
        as="div"
      >
        <AnimatePresence initial={false}>
          {order.map((id) => {
            const ex = byId.get(id)
            return ex ? <ExerciseEditorRow key={id} weekId={week.id} ex={ex} /> : null
          })}
        </AnimatePresence>
      </Reorder.Group>
      <motion.button
        type="button"
        className="add-ex-btn"
        whileTap={{ scale: 0.95 }}
        onClick={() => void addExercise(week.id, day.dayOfWeek, 'New exercise', '')}
      >
        ＋ Add exercise
      </motion.button>
    </section>
  )
}

export function WeekEditorScreen() {
  const weeks = useLiveQuery(() => db.weeks.orderBy('id').toArray(), [])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!weeks || weeks.length === 0) return null

  const latest = weeks[weeks.length - 1]
  const week = weeks.find((w) => w.id === selectedId) ?? latest
  const isPast = week.id !== latest.id

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Plan</h1>
        <select className="week-select" value={week.id} onChange={(e) => setSelectedId(e.target.value)}>
          {[...weeks].reverse().map((w) => (
            <option key={w.id} value={w.id}>
              {weekLabel(w)} · {weekDateRange(w)}
            </option>
          ))}
        </select>
      </header>
      {isPast && (
        <div className="banner banner-muted">
          <span>Past week — edits here never carry forward. Only the latest week is copied on Sunday.</span>
        </div>
      )}
      {week.days.map((day) => (
        <DayEditor key={`${week.id}:${day.dayOfWeek}`} week={week} day={day} />
      ))}
    </div>
  )
}
