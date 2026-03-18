import { NavLink } from 'react-router-dom'
import { Home, User, BookOpen, Package, MoreHorizontal } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getDefaultCharacterId, getLastEditedCharacterId } from '../lib/characterStore'

const tabs = [
  { key: 'home', to: '/', label: '首页', icon: Home },
  { key: 'characters', to: '/characters', label: '我的角色', icon: User, useLastEdited: true },
  { key: 'spells', to: '/character-spells', label: '角色法术', icon: BookOpen, useLastEditedForSpells: true },
  { key: 'warehouse', to: '/warehouse', label: '团队仓库', icon: Package },
  { key: 'more', to: '/more', label: '更多', icon: MoreHorizontal },
]

export default function BottomNav() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const defaultId = getDefaultCharacterId(user?.name, currentModuleId)
  const lastEditedId = getLastEditedCharacterId(user?.name, isAdmin, currentModuleId)
  const preferredId = defaultId || lastEditedId

  const getLinkTo = (tab) => {
    if (tab.useLastEdited && preferredId) return `/characters/${preferredId}`
    if (tab.useLastEditedForSpells && preferredId) return `/character-spells?char=${preferredId}`
    return tab.to
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 w-full min-w-0 bg-[#2D3748] border-t border-white/10 safe-area-pb shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
      <div className="mx-auto flex h-14 w-full max-w-full min-w-0 items-center justify-around px-1 sm:px-2">
        {tabs.map((tab) => {
          const to = getLinkTo(tab)
          const Icon = tab.icon
          return (
          <NavLink
            key={tab.key}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center flex-1 py-1.5 text-xs transition-all duration-200 ${
                isActive ? 'text-dnd-red' : 'text-dnd-text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-dnd-red rounded-b" />
                )}
                <Icon
                  className={`mb-0.5 transition-all duration-200 ${
                    isActive ? 'w-7 h-7 drop-shadow-[0_0_6px_rgba(224,28,47,0.5)]' : 'w-6 h-6'
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span className={isActive ? 'font-semibold' : ''}>{tab.label}</span>
              </>
            )}
          </NavLink>
        )})}
      </div>
    </nav>
  )
}
