import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ensureRolledOver, ensureSeeded } from '../db/repo'
import { setTodayOverride, todayDate } from '../domain/dates'
import { TABS, TabBar, type Tab } from './components/TabBar'
import { TodayScreen } from './TodayScreen'
import { WeekEditorScreen } from './WeekEditorScreen'
import { HistoryScreen } from './HistoryScreen'
import { SettingsScreen } from './SettingsScreen'

function tabFromHash(): Tab {
  const h = location.hash.replace('#', '')
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : 'today'
}

export function App() {
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const prevTabIdx = useRef(TABS.indexOf(tabFromHash()))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (import.meta.env.DEV) {
        const t = new URLSearchParams(location.search).get('today')
        if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) setTodayOverride(t)
      }
      await ensureSeeded()
      await ensureRolledOver(todayDate())
      if (!cancelled) setReady(true)
    })()
    // app left open across a Sunday → roll over on return
    const onVis = () => {
      if (document.visibilityState === 'visible') void ensureRolledOver(todayDate())
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const select = (t: Tab) => {
    location.hash = `#${t}`
  }

  const idx = TABS.indexOf(tab)
  const dir = idx >= prevTabIdx.current ? 1 : -1
  prevTabIdx.current = idx

  if (!ready) {
    return (
      <div className="splash">
        <span className="splash-logo">benchpress</span>
      </div>
    )
  }

  return (
    <div className="app">
      <main className="main">
        <motion.div
          key={tab}
          initial={{ x: dir * 8, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="screen-wrap"
        >
          {tab === 'today' && <TodayScreen goPlan={() => select('week')} />}
          {tab === 'week' && <WeekEditorScreen />}
          {tab === 'history' && <HistoryScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </motion.div>
      </main>
      <TabBar tab={tab} onSelect={select} />
    </div>
  )
}
