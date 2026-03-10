import { Outlet } from 'react-router-dom'
import { RollProvider } from '../contexts/RollContext'
import BottomNav from './BottomNav'
import DiceRoller from './DiceRoller'

export default function Layout() {
  return (
    <RollProvider>
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
