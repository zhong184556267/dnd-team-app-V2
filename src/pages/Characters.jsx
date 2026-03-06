import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getCharacters } from '../lib/characterStore'

export default function Characters() {
  const { user, isAdmin } = useAuth()
  const [list, setList] = useState([])

  useEffect(() => {
    setList(getCharacters(user?.name, isAdmin))
  }, [user?.name, isAdmin])

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-xl font-semibold text-white">
          我的角色
        </h1>
        <Link
          to="/characters/new"
          className="flex items-center gap-2 py-2 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-medium uppercase text-xs tracking-label transition-colors"
        >
          <Plus className="w-5 h-5" />
          新建
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-6 text-center">
          <p className="text-dnd-text-muted text-base">
            {isAdmin ? '暂无任何角色卡。' : '你还没有角色，点击「新建」创建第一张角色卡。'}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {list.map((c) => {
            const hp = c.hp || {}
            const max = hp.max || 1
            const cur = hp.current ?? 0
            const pct = Math.max(0, Math.min(100, (cur / max) * 100))
            const isLowHp = max > 0 && pct < 25
            const isMidHp = max > 0 && pct >= 25 && pct < 50
            const barColor = isLowHp ? 'bg-dnd-red' : isMidHp ? 'bg-dnd-warning' : 'bg-dnd-success'
            return (
              <li key={c.id}>
                <Link
                  to={`/characters/${c.id}`}
                  className="flex items-center gap-4 rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card border-l-4 border-dnd-red p-4 hover:shadow-dnd-card-hover transition-shadow"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/30 border border-white/10 overflow-hidden">
                    {c.avatar ? (
                      <img src={c.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-dnd-text-muted" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white truncate">
                      {c.name || '未命名'}
                    </p>
                    <p className="text-dnd-text-muted text-sm">
                      {c.class || '—'} · 等级 {c.level || 1}
                    </p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-black/30 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className={`text-xs mt-0.5 font-mono font-semibold ${isLowHp ? 'text-dnd-red' : 'text-dnd-text-muted'}`}>
                      HP {cur}/{max}
                      {hp.temp ? ` +${hp.temp} 临时` : ''}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
