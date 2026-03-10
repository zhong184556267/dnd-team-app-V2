import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, User, Star, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getCharacters, getDefaultCharacterId, setDefaultCharacterId, deleteCharacter } from '../lib/characterStore'
import { levelFromXP } from '../lib/xp5e'

/** 角色等级显示：优先经验换算，否则职业等级之和 */
function displayLevel(c) {
  const xp = Number(c.xp)
  if (xp > 0) return levelFromXP(xp)
  const main = Math.max(1, Math.min(20, Number(c.classLevel) ?? 1))
  const multi = Array.isArray(c.multiclass) ? c.multiclass.reduce((s, m) => s + (Number(m?.level) || 0), 0) : 0
  const prestige = Array.isArray(c.prestige) ? c.prestige.reduce((s, p) => s + (Number(p?.level) || 0), 0) : 0
  return Math.max(1, Math.min(20, main + multi + prestige))
}

/** 职业与等级简述，如 "战士 5" 或 "战士 5 / 法师 3" */
function displayClassLevel(c) {
  const parts = []
  if (c.class) {
    const mainLevel = Math.max(0, Math.min(20, Number(c.classLevel) ?? 1))
    parts.push(`${c.class} ${mainLevel}`)
  }
  if (Array.isArray(c.multiclass) && c.multiclass.length) {
    c.multiclass.forEach((m) => {
      if (m?.['class']) parts.push(`${m['class']} ${Math.max(0, Number(m.level) || 0)}`)
    })
  }
  if (Array.isArray(c.prestige) && c.prestige.length) {
    c.prestige.forEach((p) => {
      if (p?.['class']) parts.push(`${p['class']} ${Math.max(0, Number(p.level) || 0)}`)
    })
  }
  if (parts.length === 0) return '—'
  return parts.join(' / ')
}

export default function Characters() {
  const { user, isAdmin } = useAuth()
  const [list, setList] = useState([])
  const defaultId = user?.name ? getDefaultCharacterId(user.name) : null

  const refresh = () => setList(getCharacters(user?.name, isAdmin))

  useEffect(() => {
    refresh()
  }, [user?.name, isAdmin])

  const handleSetDefault = (e, c) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user?.name) return
    const isCurrent = defaultId === c.id
    setDefaultCharacterId(user.name, isCurrent ? null : c.id)
    refresh()
  }

  const handleDelete = (e, c) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`确定要删除角色「${c.name || '未命名'}」吗？此操作不可恢复。`)) return
    deleteCharacter(c.id)
    refresh()
    if (defaultId === c.id) setDefaultCharacterId(user?.name, null)
  }

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
            const level = displayLevel(c)
            const classLevelText = displayClassLevel(c)
            const isDefault = defaultId === c.id
            const canEdit = isAdmin || c.owner === user?.name
            return (
              <li key={c.id}>
                <div className="flex items-center gap-3 rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card border-l-4 border-dnd-red p-4 hover:shadow-dnd-card-hover transition-shadow">
                  <Link
                    to={`/characters/${c.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4"
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
                        {classLevelText} · 等级 {level}
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
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleSetDefault(e, c)}
                        title={isDefault ? '取消常用' : '设为常用（我的角色/角色法术默认选此角色）'}
                        className={`p-2 rounded-lg transition-colors ${isDefault ? 'text-dnd-gold-light bg-dnd-gold-light/20' : 'text-dnd-text-muted hover:text-dnd-gold-light hover:bg-white/10'}`}
                        aria-pressed={isDefault}
                      >
                        <Star className="w-5 h-5" fill={isDefault ? 'currentColor' : 'none'} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, c)}
                        title="删除角色"
                        className="p-2 rounded-lg text-dnd-text-muted hover:text-dnd-red hover:bg-dnd-red/20 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

