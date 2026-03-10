import { NavLink } from 'react-router-dom'
import { Home, User, Package, BookOpen, MoreHorizontal } from 'lucide-react'

const tabs = [
  { to: '/', label: '首页', icon: Home },
  { to: '/characters', label: '我的角色', icon: User },
  { to: '/warehouse', label: '团队仓库', icon: Package },
  { to: '/spells', label: '法术大全', icon: BookOpen },
  { to: '/more', label: '更多', icon: MoreHorizontal },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#2D3748] border-t border-white/10 safe-area-pb shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
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
                <span className={isActive ? 'font-semibold' : ''}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
