import { motion } from 'motion/react'

export const TABS = ['today', 'week', 'history', 'settings'] as const
export type Tab = (typeof TABS)[number]

const LABELS: Record<Tab, string> = { today: 'Today', week: 'Plan', history: 'History', settings: 'Settings' }

const ICONS: Record<Tab, string> = {
  // dumbbell / clipboard / clock / gear — simple stroke paths in a 24×24 box
  today: 'M2 12h2m16 0h2M6 8v8M10 6v12M14 6v12M18 8v8M7 12h10',
  week: 'M8 4h8m-9 3h10a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm2 5h6m-6 4h4',
  history: 'M12 8v4l3 2m6-2a9 9 0 1 1-9-9 9 9 0 0 1 9 9z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-3 2 1-1.5 3-2.3-.4a7 7 0 0 1-1.7 1l-.5 2.4h-4l-.5-2.4a7 7 0 0 1-1.7-1L6.5 16 5 13l2-1-2-1 1.5-3 2.3.4a7 7 0 0 1 1.7-1L11 5h4l.5 2.4a7 7 0 0 1 1.7 1l2.3-.4L21 11z',
}

export function TabBar({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <motion.button
          key={t}
          type="button"
          className={t === tab ? 'tab active' : 'tab'}
          whileTap={{ scale: 0.92 }}
          onClick={() => onSelect(t)}
        >
          {t === tab && <motion.span className="tab-ind" layoutId="tab-ind" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONS[t]} />
          </svg>
          <span>{LABELS[t]}</span>
        </motion.button>
      ))}
    </nav>
  )
}
