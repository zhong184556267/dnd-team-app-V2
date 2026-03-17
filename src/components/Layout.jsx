import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { RollProvider } from '../contexts/RollContext'
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
  return (
    <RollProvider>
      <ScrollToTop />
      <div className="min-h-screen bg-dnd-bg font-body text-dnd-text-body">
        <main>
          <Outlet />
        </main>
        <BottomNav />
        <DiceRoller />
      </div>
    </RollProvider>
  )
}
