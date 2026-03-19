import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, User, Star, Trash2, Copy } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getModules } from '../lib/moduleStore'
import { getCharacters, getDefaultCharacterId, setDefaultCharacterId, deleteCharacter, duplicateCharacter, updateCharacter } from '../lib/characterStore'

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
import { getClassDisplayName } from '../data/classDatabase'
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

/** 职业与等级简述，如 "战士 5" 或 "战士 5 / 法师 3"（邪术师显示为魔契师） */
function displayClassLevel(c) {
  const parts = []
  if (c.class) {
    const mainLevel = Math.max(0, Math.min(20, Number(c.classLevel) ?? 1))
    parts.push(`${getClassDisplayName(c.class)} ${mainLevel}`)
  }
  if (Array.isArray(c.multiclass) && c.multiclass.length) {
    c.multiclass.forEach((m) => {
      if (m?.['class']) parts.push(`${getClassDisplayName(m['class'])} ${Math.max(0, Number(m.level) || 0)}`)
    })
  }
  if (Array.isArray(c.prestige) && c.prestige.length) {
    c.prestige.forEach((p) => {
      if (p?.['class']) parts.push(`${getClassDisplayName(p['class'])} ${Math.max(0, Number(p.level) || 0)}`)
    })
  }
  if (parts.length === 0) return '—'
  return parts.join(' / ')
}

function moduleLabel(moduleId) {
  const m = getModules().find((x) => x.id === moduleId)
  return m?.name || moduleId || 'default'
}

export default function Characters() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const navigate = useNavigate()
  const [list, setList] = useState([])
  /** 管理员：false=看全服全部模组角色，true=只看当前模组 */
  const [adminModuleOnly, setAdminModuleOnly] = useState(false)
  const [editingCodename, setEditingCodename] = useState({})
  const defaultId = user?.name ? getDefaultCharacterId(user.name, currentModuleId) : null

  const refresh = () => {
    if (isAdmin && !adminModuleOnly) {
      setList(getCharacters(user?.name, true, null))
    } else {
      setList(getCharacters(user?.name, isAdmin, currentModuleId))
    }
  }

  useEffect(() => {
    refresh()
  }, [user?.name, isAdmin, currentModuleId, adminModuleOnly])

  useEffect(() => {
    const h = () => refresh()
    window.addEventListener('dnd-realtime-characters', h)
    return () => window.removeEventListener('dnd-realtime-characters', h)
  }, [user?.name, isAdmin, currentModuleId, adminModuleOnly])

  const handleSetDefault = (e, c) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user?.name) return
    const isCurrent = defaultId === c.id
    setDefaultCharacterId(user.name, isCurrent ? null : c.id, currentModuleId)
    refresh()
  }

  const handleDelete = (e, c) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`确定要删除角色「${c.name || '未命名'}」吗？此操作不可恢复。`)) return
    deleteCharacter(c.id)
    refresh()
    if (defaultId === c.id) setDefaultCharacterId(user?.name, null, currentModuleId)
  }

  const handleDuplicate = (e, c) => {
    e.preventDefault()
    e.stopPropagation()
    const copyOrP = duplicateCharacter(c.id)
    const done = (copy) => {
      if (copy) {
        refresh()
        navigate(`/characters/${copy.id}`)
      }
    }
    if (copyOrP && typeof copyOrP.then === 'function') copyOrP.then(done)
    else done(copyOrP)
  }

  const handleCodenameChange = (c, value) => {
    setEditingCodename((prev) => ({ ...prev, [c.id]: value }))
  }

  const handleCodenameBlur = (c) => {
    const value = editingCodename[c.id] ?? c.codename ?? ''
    const trimmed = value?.trim() || ''
    setEditingCodename((prev) => {
      const next = { ...prev }
      delete next[c.id]
      return next
    })
    if (trimmed !== (c.codename ?? '')) {
      updateCharacter(c.id, { codename: trimmed || undefined })
      refresh()
    }
  }

  const getCodenameDisplay = (c) => editingCodename[c.id] ?? c.codename ?? ''

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-semibold text-white">
            {isAdmin && !adminModuleOnly ? '全部角色（管理员）' : '我的角色'}
          </h1>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setAdminModuleOnly(false)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${!adminModuleOnly ? 'bg-dnd-gold-light/25 text-dnd-gold-light' : 'bg-white/10 text-dnd-text-muted hover:text-white'}`}
              >
                查看全部玩家 · 全部模组
              </button>
              <button
                type="button"
                onClick={() => setAdminModuleOnly(true)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${adminModuleOnly ? 'bg-dnd-gold-light/25 text-dnd-gold-light' : 'bg-white/10 text-dnd-text-muted hover:text-white'}`}
              >
                仅当前模组
              </button>
              <span className="text-dnd-text-muted text-xs">（与顶部选中的模组一致）</span>
            </>
          )}
        </div>
        <Link
          to="/characters/new"
          className="flex shrink-0 items-center gap-2 py-2 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-medium uppercase text-xs tracking-label transition-colors"
        >
          <Plus className="w-5 h-5" />
          新角色
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-6 text-center">
          <p className="text-dnd-text-muted text-base">
            {isAdmin ? (adminModuleOnly ? '当前模组下暂无角色。' : '数据库中暂无任何角色。') : '你还没有角色，点击「新角色」创建第一张角色卡。'}
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
            const canOpenSheet = canEdit
            const summaryBlock = (
              <>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/30 border border-white/10 overflow-hidden">
                  {c.avatar ? (
                    <img src={c.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-dnd-text-muted" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  {canEdit ? (
                    <input
                      type="text"
                      value={getCodenameDisplay(c)}
                      onChange={(e) => handleCodenameChange(c, e.target.value)}
                      onBlur={() => handleCodenameBlur(c)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="代号（可选，用于区分同名角色）"
                      className="w-full text-base font-semibold text-white placeholder:text-dnd-text-muted bg-transparent border-0 border-b border-transparent hover:border-gray-600 focus:border-dnd-red focus:outline-none focus:ring-0 pb-0.5 mb-0.5"
                    />
                  ) : c.codename ? (
                    <p className="text-base font-semibold text-white truncate mb-0.5">{c.codename}</p>
                  ) : null}
                  <p className="text-xs text-dnd-text-muted truncate">
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
                  <div className="flex items-end justify-between gap-2 mt-0.5 min-h-[1.25rem]">
                    <p className="text-xs text-dnd-text-muted truncate min-w-0">
                      {isAdmin && !adminModuleOnly ? (
                        <>
                          玩家 <span className="text-dnd-gold-light/90 font-medium">{c.owner ?? '—'}</span>
                          {' · 模组 '}
                          <span className="text-emerald-400/90">{moduleLabel(c.moduleId)}</span>
                          {' · 修改 '}
                          {formatDateTime(c.updatedAt ?? c.createdAt)}
                        </>
                      ) : (
                        <>创建 {c.owner ?? '—'} · 修改 {formatDateTime(c.updatedAt ?? c.createdAt)}</>
                      )}
                    </p>
                    <p className={`text-xs font-mono font-semibold shrink-0 ${isLowHp ? 'text-dnd-red' : 'text-dnd-text-muted'}`}>
                      HP {cur}/{max}
                      {hp.temp ? ` +${hp.temp} 临时` : ''}
                    </p>
                  </div>
                </div>
              </>
            )
            return (
              <li key={c.id}>
                <div className="flex items-center gap-3 rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card border-l-4 border-dnd-red p-4 hover:shadow-dnd-card-hover transition-shadow">
                  {canOpenSheet ? (
                    <Link to={`/characters/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                      {summaryBlock}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      {summaryBlock}
                      <span className="text-dnd-text-muted text-[10px] shrink-0 max-w-[4.5rem] leading-tight text-right">仅创建人可进详情</span>
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleDuplicate(e, c)}
                        title="复制角色"
                        className="p-2 rounded-lg text-dnd-text-muted hover:text-emerald-400 hover:bg-emerald-400/20 transition-colors"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
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

