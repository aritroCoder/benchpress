import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Exercise } from '../../domain/types'
import type { BadgeInfo } from '../../domain/progression'
import { metProgression } from '../../domain/progression'
import { parseTarget } from '../../domain/target'
import { addSetSlot, setRep, setWeightText } from '../../db/repo'
import { haptics } from '../haptics'
import { useTextField } from '../useTextField'

const spring = { type: 'spring', stiffness: 500, damping: 30 } as const

function Odometer({ value }: { value: number }) {
  return (
    <span className="odometer">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={spring}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function Ring({ frac, met }: { frac: number; met: boolean }) {
  const r = 8
  const c = 2 * Math.PI * r
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="ring" aria-hidden>
      <circle cx="11" cy="11" r={r} className="ring-track" />
      <motion.circle
        cx="11"
        cy="11"
        r={r}
        className={met ? 'ring-fill met' : 'ring-fill'}
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c * (1 - Math.min(frac, 1)) }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        transform="rotate(-90 11 11)"
      />
    </svg>
  )
}

interface Props {
  weekId: string
  ex: Exercise
  badge?: BadgeInfo
  editable: boolean
}

export function ExerciseCard({ weekId, ex, badge, editable }: Props) {
  const target = parseTarget(ex.description)
  const slots = Math.max(target?.sets ?? 0, ex.setReps.length)
  const met = metProgression(ex.description, ex.setReps)
  const topCount = target
    ? ex.setReps.slice(0, target.sets).filter((r) => r != null && r >= target.repHigh).length
    : 0
  const frac = target ? topCount / target.sets : met ? 1 : 0

  const [selected, setSelected] = useState<number | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const interacted = useRef(false)
  const prevMet = useRef(met)

  useEffect(() => {
    const was = prevMet.current
    prevMet.current = met
    if (met && !was && interacted.current) {
      haptics.progress()
      setCelebrate(true)
      const id = setTimeout(() => setCelebrate(false), 1600)
      return () => clearTimeout(id)
    }
  }, [met])

  const weight = useTextField(ex.weightText, (v) => void setWeightText(weekId, ex.id, v))

  const fillValue = target?.repHigh ?? 10

  const tapPill = (i: number) => {
    if (!editable) return
    interacted.current = true
    if (ex.setReps[i] == null) {
      haptics.commit()
      void setRep(weekId, ex.id, i, fillValue)
      setSelected(i)
    } else {
      setSelected(selected === i ? null : i)
    }
  }

  const adjust = (delta: number) => {
    if (selected == null) return
    const v = ex.setReps[selected]
    if (v == null) return
    const nv = Math.max(0, Math.min(99, v + delta))
    if (nv !== v) {
      haptics.tick()
      void setRep(weekId, ex.id, selected, nv)
    }
  }

  const clearSet = () => {
    if (selected == null) return
    void setRep(weekId, ex.id, selected, null)
    setSelected(null)
  }

  const selectedValue = selected != null ? ex.setReps[selected] : null

  return (
    <motion.div layout className={`card${met ? ' card-met' : ''}`} transition={spring}>
      <div className="card-head">
        <div className="card-title">
          <h3>{ex.name}</h3>
          {badge?.progress && (
            <motion.span
              className="badge-progress"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 18 }}
            >
              ↑ progress
            </motion.span>
          )}
        </div>
        {(target || met) && <Ring frac={frac} met={met} />}
      </div>
      {ex.description && <p className="card-desc">{ex.description}</p>}
      {badge?.lastWeightText ? <p className="last-wt">last: {badge.lastWeightText}</p> : null}

      <div className="pills">
        {Array.from({ length: slots }, (_, i) => {
          const v = ex.setReps[i]
          const atTop = target != null && v != null && v >= target.repHigh
          const cls = [
            'pill',
            v == null ? 'pill-empty' : 'pill-filled',
            atTop ? 'pill-top' : '',
            selected === i ? 'pill-selected' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <motion.button
              key={i}
              type="button"
              className={cls}
              whileTap={editable ? { scale: 0.9 } : undefined}
              onClick={() => tapPill(i)}
              aria-label={`set ${i + 1}`}
            >
              {v != null ? <Odometer value={v} /> : <span className="pill-ghost">{target ? target.repHigh : '·'}</span>}
            </motion.button>
          )
        })}
        {editable && (
          <motion.button
            type="button"
            className="pill pill-add"
            whileTap={{ scale: 0.9 }}
            onClick={() => void addSetSlot(weekId, ex.id)}
            aria-label="add set"
          >
            +
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {editable && selected != null && selectedValue != null && (
          <motion.div
            className="stepper"
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 8, height: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <motion.button type="button" className="step-btn" whileTap={{ scale: 0.88 }} onClick={() => adjust(-1)}>
              −
            </motion.button>
            <div className="step-value">
              <Odometer value={selectedValue} />
              <span className="step-label">set {selected + 1}</span>
            </div>
            <motion.button type="button" className="step-btn" whileTap={{ scale: 0.88 }} onClick={() => adjust(1)}>
              +
            </motion.button>
            <button type="button" className="step-clear" onClick={clearSet}>
              clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {editable ? (
        <input
          className="wt-input"
          placeholder="weight — e.g. 12.5+12.5, large barbell"
          value={weight.text}
          onChange={(e) => weight.onChange(e.target.value)}
          onBlur={weight.flush}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      ) : (
        ex.weightText && <p className="wt-static">{ex.weightText}</p>
      )}

      <AnimatePresence>
        {celebrate && (
          <motion.div
            className="celebrate"
            initial={{ opacity: 0, scale: 0.7, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 20 }}
          >
            ↑ progression earned
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
