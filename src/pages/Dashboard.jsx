import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { User, BookOpen, ChevronDown, ChevronRight, Plus, Pencil, Star, GripVertical } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getAllCharacters, getDefaultCharacterId } from '../lib/characterStore'
import { getClassDisplayName } from '../data/classDatabase'
import { getModules, addModule, updateModule, reorderModules } from '../lib/moduleStore'
import { loadTeamActivities } from '../lib/activityLog'
import { isSupabaseEnabled } from '../lib/supabase'
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

/** 职业与等级简述，与「我的角色」一致（邪术师显示为魔契师） */
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

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const { setCurrentModuleId, modules, refreshModules } = useModule()
  const [, setRealtimeTick] = useState(0)
  const [activities, setActivities] = useState([])
  const [newModuleName, setNewModuleName] = useState('')
  const [showAddModule, setShowAddModule] = useState(false)
  const [editingModuleId, setEditingModuleId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [expandedModuleIds, setExpandedModuleIds] = useState(() => new Set())
  const moduleNameInputRef = useRef(null)
  const editingModuleIdRef = useRef(null)
  const savingModuleRef = useRef(false)

  const moduleCounts = modules.map((m) => ({
    ...m,
    count: getAllCharacters(m.id).length,
  }))

  useEffect(() => {
    const h = () => setRealtimeTick((t) => t + 1)
    window.addEventListener('dnd-realtime-characters', h)
    return () => window.removeEventListener('dnd-realtime-characters', h)
  }, [])

  const refreshActivities = () => {
    loadTeamActivities(35).then(setActivities)
  }

  useEffect(() => {
    refreshActivities()
  }, [])

  useEffect(() => {
    const h = () => refreshActivities()
    window.addEventListener('dnd-realtime-activity', h)
    return () => window.removeEventListener('dnd-realtime-activity', h)
  }, [])

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
    Promise.resolve(addModule(name))
      .then((created) => {
        refreshModules()
        const mods = getModules()
        const added = created?.id ? created : mods.find((m) => m.name === name) ?? mods[mods.length - 1]
        if (added?.id) setCurrentModuleId(added.id)
        setNewModuleName('')
        setShowAddModule(false)
      })
      .catch((e) => {
        console.warn(e)
        alert(e?.message ? `添加模组失败：${e.message}` : '添加模组失败，请检查 Supabase 与 campaign_modules 表')
      })
  }

  const startEditModule = (e, m) => {
    e.stopPropagation()
    editingModuleIdRef.current = m.id
    setEditingModuleId(m.id)
    setEditingName(m.name)
  }

  const cancelEditModule = () => {
    editingModuleIdRef.current = null
    setEditingModuleId(null)
    setEditingName('')
  }

  /** nameOverride 用输入框 DOM 当前值，避免 onBlur 时 React state 尚未提交导致保存旧名 */
  const saveEditModule = (nameOverride, moduleIdExplicit) => {
    const id = moduleIdExplicit ?? editingModuleIdRef.current ?? editingModuleId
    if (id == null || savingModuleRef.current) return
    const raw =
      nameOverride !== undefined && nameOverride !== null
        ? String(nameOverride)
        : (moduleNameInputRef.current?.value ?? editingName)
    const trimmed = raw.trim()
    if (!trimmed) {
      cancelEditModule()
      return
    }
    savingModuleRef.current = true
    Promise.resolve(updateModule(id, trimmed))
      .then((result) => {
        if (result != null) refreshModules()
        else alert('无法保存模组名称，请刷新页面后重试')
        cancelEditModule()
      })
      .catch((e) => {
        console.warn(e)
        const msg = e?.message || e?.error_description || String(e)
        alert(msg ? `保存失败：${msg}` : '保存失败，请检查网络与 Supabase 配置')
      })
      .finally(() => {
        savingModuleRef.current = false
      })
  }

  const canOpen = (c) => isAdmin || c.owner === user?.name

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (Number.isNaN(fromIndex) || fromIndex === dropIndex) return
    const next = [...moduleCounts]
    const [removed] = next.splice(fromIndex, 1)
    next.splice(dropIndex, 0, removed)
    Promise.resolve(reorderModules(next.map(({ id, name }) => ({ id, name })))).then(() => refreshModules())
  }
  const formatDateTime = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        欢迎，玩家 {user?.name}
      </h1>

      {isSupabaseEnabled() && (
        <section className="mb-6 rounded-xl border border-white/10 bg-dnd-card/80 overflow-hidden">
          <div className="px-4 py-2 border-b border-white/10 bg-black/20">
            <h2 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">团队动态</h2>
            <p className="text-dnd-text-muted text-[10px] mt-0.5">仓库、背包等操作会记录在此（需已执行 supabase-activity-log.sql）</p>
          </div>
          <ul className="max-h-52 overflow-y-auto divide-y divide-white/5">
            {activities.length === 0 ? (
              <li className="px-4 py-3 text-dnd-text-muted text-sm">暂无记录。向仓库放物品或往背包加物后会出现在这里。</li>
            ) : (
              activities.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <span className="text-dnd-text-muted text-xs font-mono tabular-nums">{formatDateTime(a.created_at)}</span>
                  <p className="text-dnd-text-body mt-0.5 leading-snug">{a.summary}</p>
                  <p className="text-[10px] text-dnd-text-muted mt-0.5">
                    模组 {modules.find((m) => m.id === a.module_id)?.name || a.module_id}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      <h2 className="text-dnd-text-label text-xs font-medium uppercase tracking-label mb-3">
        模组
      </h2>
      <div className="space-y-3">
        {moduleCounts.map((m, index) => {
          const isExpanded = expandedModuleIds.has(m.id)
          const isEditing = editingModuleId === m.id
          const charList = getAllCharacters(m.id)
          const defaultCharId = getDefaultCharacterId(user?.name, m.id)
          return (
            <div
              key={m.id}
              draggable={!isEditing}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
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
                <div className="flex items-center gap-2 shrink-0">
                  {!isEditing && (
                    <span className="cursor-grab active:cursor-grabbing text-dnd-text-muted hover:text-dnd-gold-light" title="拖动排序" onClick={(e) => e.stopPropagation()}>
                      <GripVertical className="w-5 h-5" />
                    </span>
                  )}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/30 border border-white/10">
                    <BookOpen className="w-5 h-5 text-dnd-gold-light" />
                  </span>
                </div>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div
                        className="relative z-20 flex flex-wrap items-center gap-2 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={moduleNameInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEditModule(e.currentTarget.value, m.id)
                            }
                            if (e.key === 'Escape') cancelEditModule()
                          }}
                          className={inputClass + ' flex-1 min-w-[8rem] h-9 text-sm font-semibold touch-manipulation'}
                          autoFocus
                        />
                        {/* 勿对按钮 mousedown preventDefault，否则会阻止 click（尤其手机浏览器），表现为点保存没反应 */}
                        <button
                          type="button"
                          data-module-save="1"
                          onClick={(e) => {
                            e.stopPropagation()
                            saveEditModule(moduleNameInputRef.current?.value, m.id)
                          }}
                          className="shrink-0 min-h-9 min-w-[4.5rem] px-3 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-xs font-bold touch-manipulation"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          data-module-cancel="1"
                          onClick={(e) => {
                            e.stopPropagation()
                            cancelEditModule()
                          }}
                          className="shrink-0 min-h-9 min-w-[4.5rem] px-3 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-xs touch-manipulation"
                        >
                          取消
                        </button>
                        <p className="w-full text-[10px] text-dnd-text-muted">点「保存」或按回车生效</p>
                      </div>
                    ) : (
                      <p className="font-semibold text-white truncate flex items-center gap-1.5">
                        {m.name}
                        {defaultCharId && (
                          <Star className="w-4 h-4 text-dnd-gold-light shrink-0" fill="currentColor" title="已设常用角色" />
                        )}
                      </p>
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
                    <div className="px-4 py-4 flex flex-col gap-3">
                      <p className="text-dnd-text-muted text-sm">该模组暂无角色。</p>
                      <Link
                        to={`/characters/new?moduleId=${encodeURIComponent(m.id)}`}
                        onClick={() => setCurrentModuleId(m.id)}
                        className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm transition-colors w-fit"
                      >
                        <Plus className="w-4 h-4" />
                        新增角色
                      </Link>
                    </div>
                  ) : (
                    <>
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
                              <p className="text-xs text-dnd-text-muted mt-0.5">
                                创建 {c.owner ?? '—'} · 修改 {formatDateTime(c.updatedAt ?? c.createdAt)}
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
                    <div className="px-3 pb-3 pt-1">
                      <Link
                        to={`/characters/new?moduleId=${encodeURIComponent(m.id)}`}
                        onClick={() => setCurrentModuleId(m.id)}
                        className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white font-medium text-sm transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        新增角色
                      </Link>
                    </div>
                    </>
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
