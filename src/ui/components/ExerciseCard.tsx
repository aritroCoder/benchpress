import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Exercise } from '../../domain/types'
import type { BadgeInfo } from '../../domain/progression'
import { metProgression } from '../../domain/progression'
import { parseTarget } from '../../domain/target'
import { addSetSlot, removeSetSlot, setRep, setWeightText } from '../../db/repo'
import { haptics } from '../haptics'
import { useTextField } from '../useTextField'

const fade = { duration: 0.16, ease: 'easeOut' } as const

function ArrowUp({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 10.5V1.5M2 5.5 6 1.5l4 4" />
    </svg>
  )
}

function Num({ value }: { value: number | null }) {
  return (
    <motion.span
      key={String(value)}
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="set-num"
    >
      {value ?? '–'}
    </motion.span>
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
        transition={{ duration: 0.25, ease: 'easeOut' }}
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
  /** false while the prev-week query is still resolving — gates weight auto-fill */
  autofillReady?: boolean
}

export function ExerciseCard({ weekId, ex, badge, editable, autofillReady = true }: Props) {
  const target = parseTarget(ex.description)
  const met = metProgression(ex.description, ex.setReps)
  const topCount = target
    ? ex.setReps.slice(0, target.sets).filter((r) => r != null && r >= target.repHigh).length
    : 0
  const frac = target ? topCount / target.sets : met ? 1 : 0

  const cap = target?.sets ?? 8
  const canAdd = editable && ex.setReps.length < cap
  const canRemove = editable && ex.setReps.length > 1

  const [celebrate, setCelebrate] = useState(false)
  const interacted = useRef(false)
  const prevMet = useRef(met)

  // Celebrate only after `met` has HELD for a moment: tap-to-fill logs the top of
  // the range optimistically, so the user may be about to adjust down to their real
  // reps. Firing instantly would celebrate sets they didn't do.
  useEffect(() => {
    const was = prevMet.current
    prevMet.current = met
    if (met && !was && interacted.current) {
      const confirm = setTimeout(() => {
        haptics.progress()
        setCelebrate(true)
      }, 1200)
      return () => clearTimeout(confirm) // met dropped back below top → cancel
    }
    if (!met) setCelebrate(false)
  }, [met])

  useEffect(() => {
    if (!celebrate) return
    const hide = setTimeout(() => setCelebrate(false), 1800)
    return () => clearTimeout(hide)
  }, [celebrate])

  const weight = useTextField(ex.weightText, (v) => void setWeightText(weekId, ex.id, v))

  // Weight defaults to last week's weight as a real (editable, committed) value.
  const autofilled = useRef(false)
  useEffect(() => {
    if (!autofilled.current && autofillReady && editable && ex.weightText === '' && badge?.lastWeightText) {
      autofilled.current = true
      weight.onChange(badge.lastWeightText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillReady, editable, ex.weightText, badge?.lastWeightText])

  const fillFor = (i: number) => target?.repHigh ?? badge?.lastReps?.[i] ?? 10

  const fill = (i: number) => {
    interacted.current = true
    haptics.commit()
    void setRep(weekId, ex.id, i, fillFor(i))
  }

  const adjust = (i: number, delta: number) => {
    const v = ex.setReps[i]
    if (v == null) return
    const nv = Math.max(0, Math.min(99, v + delta))
    if (nv !== v) {
      interacted.current = true
      haptics.tick()
      void setRep(weekId, ex.id, i, nv)
    }
  }

  const lastRepsShown = badge?.lastReps?.filter((r) => r != null) ?? []
  const lastLine = [
    lastRepsShown.length > 0 ? lastRepsShown.join(' · ') : '',
    badge?.lastWeightText || '',
  ]
    .filter(Boolean)
    .join('  @  ')

  return (
    <div className={`card${met ? ' card-met' : ''}`}>
      <div className="card-head">
        <div className="card-title">
          <h3>{ex.name}</h3>
          {badge?.progress && (
            <motion.span
              className="badge-progress"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={fade}
              title="all sets hit the top of the range last week — add weight"
            >
              <ArrowUp /> progress
            </motion.span>
          )}
        </div>
        {(target || met) && <Ring frac={frac} met={met} />}
      </div>
      {ex.description && <p className="card-desc">{ex.description}</p>}
      {lastLine && (
        <p className="last-line">
          <span className="last-label">last week</span> {lastLine}
        </p>
      )}

      <div className="set-rows">
        {ex.setReps.map((v, i) => {
          const atTop = target != null && v != null && v >= target.repHigh
          const lastRep = badge?.lastReps?.[i]
          return (
            <div key={i} className="set-row">
              <span className="set-label">Set {i + 1}</span>
              <span className="set-last">{lastRep != null ? `last ${lastRep}` : ''}</span>
              {editable ? (
                <div className="set-ctrl">
                  <motion.button
                    type="button"
                    className="step-btn"
                    whileTap={{ scale: 0.92 }}
                    disabled={v == null || v <= 0}
                    onClick={() => adjust(i, -1)}
                    aria-label={`set ${i + 1}: one rep less`}
                  >
                    −
                  </motion.button>
                  <motion.button
                    type="button"
                    className={`set-value${v == null ? ' empty' : ''}${atTop ? ' at-top' : ''}`}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => (v == null ? fill(i) : undefined)}
                    aria-label={v == null ? `log set ${i + 1}: tap for ${fillFor(i)} reps` : `set ${i + 1}: ${v} reps`}
                  >
                    <Num value={v} />
                    {v == null && <span className="set-hint">tap = {fillFor(i)}</span>}
                  </motion.button>
                  <motion.button
                    type="button"
                    className="step-btn"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => (v == null ? fill(i) : adjust(i, 1))}
                    aria-label={`set ${i + 1}: one rep more`}
                  >
                    +
                  </motion.button>
                  {v != null ? (
                    <button
                      type="button"
                      className="set-remove"
                      onClick={() => {
                        haptics.tick()
                        void setRep(weekId, ex.id, i, null)
                      }}
                      aria-label={`clear set ${i + 1}`}
                    >
                      ✕
                    </button>
                  ) : canRemove && i === ex.setReps.length - 1 ? (
                    <button
                      type="button"
                      className="set-remove"
                      onClick={() => {
                        haptics.tick()
                        void removeSetSlot(weekId, ex.id)
                      }}
                      aria-label="remove last set"
                    >
                      ✕
                    </button>
                  ) : (
                    <span className="set-remove-spacer" />
                  )}
                </div>
              ) : (
                <span className={`set-static${atTop ? ' at-top' : ''}`}>{v ?? '—'} reps</span>
              )}
            </div>
          )
        })}
      </div>

      {canAdd && (
        <button type="button" className="add-set-btn" onClick={() => void addSetSlot(weekId, ex.id)}>
          + add set{target ? ` · ${cap - ex.setReps.length} of ${cap} left` : ''}
        </button>
      )}

      {editable ? (
        <label className="wt-field">
          <span className="wt-label">weight</span>
          <input
            className="wt-input"
            placeholder="e.g. 12.5+12.5, large barbell"
            value={weight.text}
            onChange={(e) => weight.onChange(e.target.value)}
            onBlur={weight.flush}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
      ) : (
        ex.weightText && <p className="wt-static">{ex.weightText}</p>
      )}

      <AnimatePresence>
        {celebrate && (
          <motion.div
            className="celebrate"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <ArrowUp size={10} /> progression earned
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
