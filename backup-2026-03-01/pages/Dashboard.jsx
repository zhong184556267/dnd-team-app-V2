import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getAllCharacters } from '../lib/characterStore'

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const [list, setList] = useState([])

  useEffect(() => {
    setList(getAllCharacters())
  }, [])

  const canOpen = (c) => isAdmin || c.owner === user?.name

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        欢迎，{user?.name}
      </h1>

      <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card border-l-4 border-dnd-red p-4 mb-6">
        <p className="text-dnd-text-body text-base leading-relaxed">
          快捷工具（快速记账、公告栏、资产概览）开发中。
        </p>
      </div>

      <h2 className="text-dnd-text-label text-xs font-medium uppercase tracking-label mb-3">
        全部角色
      </h2>
      {list.length === 0 ? (
        <div className="rounded-xl bg-dnd-card border border-white/10 p-4">
          <p className="text-dnd-text-muted text-sm">暂无角色。</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => {
            const hp = c.hp || {}
            const max = hp.max || 1
            const cur = hp.current ?? 0
            const pct = Math.max(0, Math.min(100, (cur / max) * 100))
            const isClickable = canOpen(c)
            const cardClass =
              'flex items-center gap-4 rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 ' +
              (isClickable
                ? 'border-l-4 border-dnd-red hover:shadow-dnd-card-hover transition-shadow'
                : 'border-l-4 border-dnd-text-muted opacity-90')

            const content = (
              <>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/30 border border-white/10 overflow-hidden">
                  {c.avatar ? (
                    <img src={c.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-dnd-text-muted" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{c.name || '未命名'}</p>
                  <p className="text-dnd-text-muted text-sm">
                    {c.class || '—'} · 等级 {c.level || 1}
                  </p>
                  <p className="text-dnd-text-label text-xs mt-0.5">
                    创建人：{c.owner || '—'}
                  </p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-black/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-dnd-red transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-dnd-text-muted text-xs mt-0.5">
                    HP {cur}/{max}
                  </p>
                </div>
              </>
            )

            return (
              <li key={c.id}>
                {isClickable ? (
                  <Link to={`/characters/${c.id}`} className={cardClass}>
                    {content}
                  </Link>
                ) : (
                  <div className={cardClass} aria-disabled>
                    {content}
                    <span className="text-dnd-text-muted text-xs shrink-0">仅创建人可进入</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
