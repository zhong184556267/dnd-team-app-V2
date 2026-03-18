import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { RollProvider } from '../contexts/RollContext'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { loadAllCharactersIntoCache } from '../lib/characterStore'
import { startSupabaseRealtime } from '../lib/realtimeSync'
import { isSupabaseEnabled } from '../lib/supabase'
import BottomNav from './BottomNav'
import DiceRoller from './DiceRoller'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function Layout() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()

  useEffect(() => {
    if (!isSupabaseEnabled() || !user?.name) return
    let cancelled = false
    loadAllCharactersIntoCache(user.name, isAdmin).then(() => {
      if (!cancelled) window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
    })
    return () => {
      cancelled = true
    }
  }, [user?.name, isAdmin])

  useEffect(() => {
    if (!isSupabaseEnabled() || !user?.name) return () => {}
    const mod = currentModuleId ?? 'default'
    return startSupabaseRealtime({
      ownerName: user.name,
      isAdmin,
      moduleId: mod,
    })
  }, [user?.name, isAdmin, currentModuleId])

  return (
    <RollProvider>
      <ScrollToTop />
      <div className="min-h-screen w-full min-w-0 bg-dnd-bg font-body text-dnd-text-body">
        <main className="w-full min-w-0 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
          <Outlet />
        </main>
        <BottomNav />
        <DiceRoller />
      </div>
    </RollProvider>
  )
}
