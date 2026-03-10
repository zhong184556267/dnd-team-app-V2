import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { User, BookOpen, ChevronDown, ChevronRight, Plus, Pencil } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getAllCharacters } from '../lib/characterStore'
import { getModules, addModule, updateModule } from '../lib/moduleStore'
import { levelFromXP } from '../lib/xp5e'
import { inputClass } from '../lib/inputStyles'

/** 角色等级：优先经验换算，否则职业等级之和 */
function displayLevel(c) {
  const xp = Number(c.xp)
  if (xp > 0) return levelFromXP(xp)
  const main = Math.max(1, Math.min(20, Number(c.classLevel) ?? 1))
  const multi = Array.isArray(c.multiclass) ? c.multiclass.reduce((s, m) => s + (Number(m?.level) || 0), 0) : 0
  const prestige = Array.isArray(c.prestige) ? c.prestige.reduce((s, p) => s + (Number(p?.level) || 0), 0) : 0
  return Math.max(1, Math.min(20, main + multi + prestige))
}

/** 职业与等级简述，与「我的角色」一致 */
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

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId, setCurrentModuleId, modules, refreshModules } = useModule()
  const [newModuleName, setNewModuleName] = useState('')
  const [showAddModule, setShowAddModule] = useState(false)
  const [editingModuleId, setEditingModuleId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [expandedModuleIds, setExpandedModuleIds] = useState(() => new Set())

  const moduleCounts = modules.map((m) => ({
    ...m,
    count: getAllCharacters(m.id).length,
  }))

  const toggleExpand = (moduleId) => {
    setExpandedModuleIds((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else {
        next.add(moduleId)
        setCurrentModuleId(moduleId)
      }
      return next
    })
  }

  const handleAddModule = () => {
    const name = newModuleName?.trim()
    if (!name) return
    addModule(name)
    refreshModules()
    const mods = getModules()
    const added = mods.find((m) => m.name === name) ?? mods[mods[mods.length - 1]]
    if (added) setCurrentModuleId(added.id)
    setNewModuleName('')
    setShowAddModule(false)
  }

  const startEditModule = (e, m) => {
    e.stopPropagation()
    setEditingModuleId(m.id)
    setEditingName(m.name)
  }

  const saveEditModule = () => {
    if (editingModuleId == null) return
    const trimmed = editingName?.trim()
    if (trimmed) {
      updateModule(editingModuleId, trimmed)
      refreshModules()
    }
    setEditingModuleId(null)
    setEditingName('')
  }

  const canOpen = (c) => isAdmin || c.owner === user?.name

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        欢迎，{user?.name}
      </h1>

      <h2 className="text-dnd-text-label text-xs font-medium uppercase tracking-label mb-3">
        模组
      </h2>
      <div className="space-y-3">
        {moduleCounts.map((m) => {
          const isExpanded = expandedModuleIds.has(m.id)
          const isEditing = editingModuleId === m.id
          const charList = getAllCharacters(m.id)
          return (
            <div
              key={m.id}
              className="rounded-xl border border-white/10 bg-dnd-card overflow-hidden"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => !isEditing && toggleExpand(m.id)}
                onKeyDown={(e) => e.key === 'Enter' && !isEditing && toggleExpand(m.id)}
                className={`flex items-center justify-between gap-3 p-4 text-left transition-colors cursor-pointer hover:bg-gray-800/70 ${
                  isExpanded ? 'border-l-4 border-dnd-gold/50 bg-gray-900/70' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/30 border border-white/10">
                    <BookOpen className="w-5 h-5 text-dnd-gold-light" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={saveEditModule}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') saveEditModule()
                          if (e.key === 'Escape') { setEditingModuleId(null); setEditingName(''); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={inputClass + ' w-full h-8 text-sm font-semibold'}
                        autoFocus
                      />
                    ) : (
                      <p className="font-semibold text-white truncate">{m.name}</p>
                    )}
                    <p className="text-dnd-text-muted text-sm">{m.count} 个角色</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={(e) => startEditModule(e, m)}
                      title="编辑模组名"
                      className="p-1.5 rounded-lg text-dnd-text-muted hover:text-dnd-gold-light hover:bg-white/10 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-dnd-text-muted" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-dnd-text-muted" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-white/10 bg-gray-900/30">
                  {charList.length === 0 ? (
                    <p className="px-4 py-4 text-dnd-text-muted text-sm">该模组暂无角色，可在「我的角色」中创建。</p>
                  ) : (
                    <ul className="p-3 pt-2 space-y-3">
                      {charList.map((c) => {
                        const hp = c.hp || {}
                        const max = hp.max || 1
                        const cur = hp.current ?? 0
                        const pct = Math.max(0, Math.min(100, (cur / max) * 100))
                        const isLowHp = max > 0 && pct < 25
                        const isMidHp = max > 0 && pct >= 25 && pct < 50
                        const barColor = isLowHp ? 'bg-dnd-red' : isMidHp ? 'bg-dnd-warning' : 'bg-dnd-success'
                        const level = displayLevel(c)
                        const classLevelText = displayClassLevel(c)
                        const isClickable = canOpen(c)
                        const cardClass =
                          'flex items-center gap-4 rounded-xl bg-dnd-card border border-white/10 p-4 ' +
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
                              {c.codename ? (
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
                              <p className={`text-xs mt-0.5 font-mono font-semibold ${isLowHp ? 'text-dnd-red' : 'text-dnd-text-muted'}`}>
                                HP {cur}/{max}
                                {hp.temp ? ` +${hp.temp} 临时` : ''}
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
              )}
            </div>
          )
        })}

        {showAddModule ? (
          <div className="rounded-xl bg-dnd-card border border-dashed border-gray-500 p-4 flex flex-col gap-2">
            <input
              type="text"
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
              placeholder="新模组名称"
              className={inputClass + ' w-full h-10 text-sm'}
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowAddModule(false); setNewModuleName(''); }} className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm">
                取消
              </button>
              <button type="button" onClick={handleAddModule} className="flex-1 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium">
                添加
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddModule(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-500 bg-dnd-card/50 p-4 text-dnd-text-muted hover:border-gray-400 hover:text-white transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span className="text-sm font-medium">新建模组</span>
          </button>
        )}
      </div>
    </div>
  )
}
