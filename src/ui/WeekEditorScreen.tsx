import { useEffect, useState } from 'react'
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Day, Exercise, Week } from '../domain/types'
import { DAY_ABBR, DAY_NAMES, weekDateRange, weekLabel } from '../domain/dates'
import { parseTarget } from '../domain/target'
import {
  addExercise,
  copyExercisesToDay,
  moveExercisesToDay,
  removeExercise,
  setExerciseDescription,
  setExerciseName,
  setExerciseOrder,
  setSplit,
} from '../db/repo'
import { useTextField } from './useTextField'
import { haptics } from './haptics'

function hasLoggedData(ex: Exercise): boolean {
  return ex.weightText.trim() !== '' || ex.setReps.some((r) => r != null)
}

function ExerciseEditorRow({
  weekId,
  ex,
  selectMode,
  isSelected,
  onToggle,
}: {
  weekId: string
  ex: Exercise
  selectMode: boolean
  isSelected: boolean
  onToggle: () => void
}) {
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
      className={selectMode ? (isSelected ? 'editor-row selectable selected' : 'editor-row selectable') : 'editor-row'}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      role={selectMode ? 'checkbox' : undefined}
      aria-checked={selectMode ? isSelected : undefined}
      onClick={selectMode ? onToggle : undefined}
    >
      {selectMode ? (
        <span className={isSelected ? 'check-dot on' : 'check-dot'} aria-hidden>
          {isSelected ? '✓' : ''}
        </span>
      ) : (
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
      )}
      {selectMode ? (
        <div className="editor-fields select-fields">
          <span className="select-name">{ex.name}</span>
          {ex.description && <span className="select-desc">{ex.description}</span>}
        </div>
      ) : (
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
      )}
      {!selectMode && (
        <motion.button type="button" className="del-btn" whileTap={{ scale: 0.88 }} onClick={del} aria-label="delete">
          ✕
        </motion.button>
      )}
    </Reorder.Item>
  )
}

function DayEditor({
  week,
  day,
  selectMode,
  selected,
  onToggle,
}: {
  week: Week
  day: Day
  selectMode: boolean
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
}) {
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
            return ex ? (
              <ExerciseEditorRow
                key={id}
                weekId={week.id}
                ex={ex}
                selectMode={selectMode}
                isSelected={selected.has(id)}
                onToggle={() => onToggle(id)}
              />
            ) : null
          })}
        </AnimatePresence>
      </Reorder.Group>
      {!selectMode && (
        <motion.button
          type="button"
          className="add-ex-btn"
          whileTap={{ scale: 0.95 }}
          onClick={() => void addExercise(week.id, day.dayOfWeek, 'New exercise', '')}
        >
          ＋ Add exercise
        </motion.button>
      )}
    </section>
  )
}

function PlanEditor({ week }: { week: Week }) {
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<'copy' | 'move' | null>(null)

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
    setPending(null)
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const apply = (dayOfWeek: number) => {
    if (selected.size === 0 || !pending) return
    const op = pending === 'copy' ? copyExercisesToDay : moveExercisesToDay
    void op(week.id, [...selected], dayOfWeek)
    haptics.commit()
    exitSelect()
  }

  return (
    <>
      <div className="plan-tools">
        <button
          type="button"
          className={selectMode ? 'toggle on' : 'toggle'}
          onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
        >
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>
      {week.days.map((day) => (
        <DayEditor
          key={`${week.id}:${day.dayOfWeek}`}
          week={week}
          day={day}
          selectMode={selectMode}
          selected={selected}
          onToggle={toggle}
        />
      ))}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            className="select-bar"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {pending == null ? (
              <>
                <span className="select-count">{selected.size} selected</span>
                <button
                  type="button"
                  className="select-action"
                  disabled={selected.size === 0}
                  onClick={() => setPending('copy')}
                >
                  Copy to…
                </button>
                <button
                  type="button"
                  className="select-action"
                  disabled={selected.size === 0}
                  onClick={() => setPending('move')}
                >
                  Move to…
                </button>
              </>
            ) : (
              <>
                <button type="button" className="select-back" onClick={() => setPending(null)} aria-label="back">
                  ‹
                </button>
                <span className="select-verb">{pending === 'copy' ? 'Copy to' : 'Move to'}</span>
                <div className="select-days">
                  {DAY_ABBR.map((abbr, i) => (
                    <button key={abbr} type="button" className="select-day" onClick={() => apply(i)}>
                      {abbr}
                    </button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
      <PlanEditor key={week.id} week={week} />
    </div>
  )
}
