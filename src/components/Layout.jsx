import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { RollProvider } from '../contexts/RollContext'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { loadAllCharactersIntoCache } from '../lib/characterStore'
import { startSupabaseRealtime } from '../lib/realtimeSync'
import { isSupabaseEnabled } from '../lib/supabase'
import BottomNav from './BottomNav'

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
      {/* 与中间版心同色：勿在此处用纵向渐变，否则两侧露边会在滚动时出现「一节颜色不对」的接缝 */}
      <div className="min-h-screen w-full min-w-[1180px]" style={{ backgroundColor: 'var(--page-bg)' }}>
        <div className="mx-auto w-[1180px] min-w-[1180px] shrink-0 min-h-screen min-h-[100dvh] font-body text-dnd-text-body" style={{ backgroundColor: 'var(--page-bg)' }}>
          <main className="w-full min-w-0 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
            <Outlet />
          </main>
          <BottomNav />
        </div>
      </div>
    </RollProvider>
  )
}
