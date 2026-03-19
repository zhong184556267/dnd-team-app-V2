import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, User, Star, Trash2, Copy, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getModules } from '../lib/moduleStore'
import { getCharacters, getCharactersInModule, loadCharactersInModule, getDefaultCharacterId, setDefaultCharacterId, deleteCharacter, duplicateCharacter, updateCharacter } from '../lib/characterStore'
import { isSupabaseEnabled } from '../lib/supabase'

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
  const defaultId = user?.name ? getDefaultCharacterId(user.name, currentModuleId) : null

  const refresh = () => {
    if (isAdmin && !adminModuleOnly) {
      setList(getCharacters(user?.name, true, null))
    } else {
      setList(getCharactersInModule(currentModuleId))
    }
  }

  useEffect(() => {
    if (isSupabaseEnabled() && user?.name && currentModuleId && !(isAdmin && !adminModuleOnly)) {
      loadCharactersInModule(currentModuleId).then(refresh)
    } else {
      refresh()
    }
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

  const [dragOverId, setDragOverId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const handleDragStart = (e, c) => {
    e.dataTransfer.setData('text/plain', c.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-dnd-character-id', c.id)
    e.dataTransfer.setData('application/x-dnd-is-subordinate', c.parentId ? '1' : '')
    setDraggingId(c.id)
  }
  const handleDragOver = (e, targetId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(targetId)
  }
  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null)
  }
  const handleDrop = (e, targetCard) => {
    e.preventDefault()
    setDragOverId(null)
    const draggedId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/x-dnd-character-id')
    if (!draggedId || !targetCard) return
    if (draggedId === targetCard.id) return
    const dragged = list.find((x) => x.id === draggedId)
    if (!dragged) return
    const canEditDragged = isAdmin || dragged.owner === user?.name
    if (!canEditDragged) return
    // 禁止拖到自己的后代节点下，避免环形父子关系
    const childrenByParent = {}
    list.forEach((x) => {
      if (!x.parentId) return
      if (!childrenByParent[x.parentId]) childrenByParent[x.parentId] = []
      childrenByParent[x.parentId].push(x.id)
    })
    const stack = [...(childrenByParent[draggedId] || [])]
    const descendants = new Set()
    while (stack.length) {
      const cur = stack.pop()
      if (descendants.has(cur)) continue
      descendants.add(cur)
      const next = childrenByParent[cur] || []
      next.forEach((id) => stack.push(id))
    }
    if (descendants.has(targetCard.id)) return
    if (!window.confirm(`是否将「${dragged.codename || dragged.name || '未命名'}」设为「${targetCard.codename || targetCard.name || '未命名'}」的附属卡？`)) return
    const next = updateCharacter(draggedId, {
      parentId: targetCard.id,
      cardType: 'subordinate',
      subordinateTemplate: dragged.subordinateTemplate || 'class',
    })
    if (next && typeof next.then === 'function') next.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
    else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
  }
  const handleDragEnd = () => { setDragOverId(null); setDraggingId(null) }

  const [collapsedMains, setCollapsedMains] = useState(() => new Set())
  const toggleCollapse = (mainId) => {
    setCollapsedMains((prev) => {
      const next = new Set(prev)
      if (next.has(mainId)) next.delete(mainId)
      else next.add(mainId)
      return next
    })
  }

  const [unattachZoneActive, setUnattachZoneActive] = useState(false)
  const [assigningSubId, setAssigningSubId] = useState(null)
  const [assignSearch, setAssignSearch] = useState('')
  const [undoAction, setUndoAction] = useState(null)
  const [undoTimer, setUndoTimer] = useState(null)
  const handleUnattachDragOver = (e) => {
    if (!e.dataTransfer.types.includes('application/x-dnd-is-subordinate')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setUnattachZoneActive(true)
  }
  const handleUnattachDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setUnattachZoneActive(false)
  }
  const handleUnattachDrop = (e) => {
    e.preventDefault()
    setUnattachZoneActive(false)
    const draggedId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/x-dnd-character-id')
    if (!draggedId) return
    const dragged = list.find((x) => x.id === draggedId)
    if (!dragged || !dragged.parentId) return
    const canEditDragged = isAdmin || dragged.owner === user?.name
    if (!canEditDragged) return
    if (!window.confirm(`是否将「${dragged.codename || dragged.name || '未命名'}」解除附属，恢复为主卡？`)) return
    const next = updateCharacter(draggedId, { parentId: undefined, cardType: 'main', subordinateTemplate: undefined })
    if (next && typeof next.then === 'function') next.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
    else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
  }

  const pushUndo = (payload) => {
    if (undoTimer) clearTimeout(undoTimer)
    setUndoAction(payload)
    const t = setTimeout(() => setUndoAction(null), 5000)
    setUndoTimer(t)
  }

  const applyAttach = (sub, targetMain) => {
    if (!sub || !targetMain || sub.id === targetMain.id) return
    const canEditSub = isAdmin || sub.owner === user?.name
    if (!canEditSub) return
    const prevParentId = sub.parentId
    const next = updateCharacter(sub.id, {
      parentId: targetMain.id,
      cardType: 'subordinate',
      subordinateTemplate: sub.subordinateTemplate || 'class',
    })
    const done = () => {
      refresh()
      window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
      pushUndo({
        label: `已将「${sub.codename || sub.name || '未命名'}」归属到「${targetMain.codename || targetMain.name || '未命名'}」`,
        rollback: () => {
          const prev = updateCharacter(sub.id, {
            parentId: prevParentId || undefined,
            cardType: prevParentId ? 'subordinate' : 'main',
            subordinateTemplate: prevParentId ? (sub.subordinateTemplate || 'class') : undefined,
          })
          if (prev && typeof prev.then === 'function') prev.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
          else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
        },
      })
    }
    if (next && typeof next.then === 'function') next.then(done)
    else done()
  }

  const applyUnattach = (sub) => {
    if (!sub?.parentId) return
    const canEditSub = isAdmin || sub.owner === user?.name
    if (!canEditSub) return
    const prevParentId = sub.parentId
    const next = updateCharacter(sub.id, { parentId: undefined, cardType: 'main', subordinateTemplate: undefined })
    const done = () => {
      refresh()
      window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
      pushUndo({
        label: `已解除「${sub.codename || sub.name || '未命名'}」的归属`,
        rollback: () => {
          const prev = updateCharacter(sub.id, {
            parentId: prevParentId,
            cardType: 'subordinate',
            subordinateTemplate: sub.subordinateTemplate || 'class',
          })
          if (prev && typeof prev.then === 'function') prev.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
          else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
        },
      })
    }
    if (next && typeof next.then === 'function') next.then(done)
    else done()
  }

  const handleUndo = () => {
    if (!undoAction?.rollback) return
    if (undoTimer) clearTimeout(undoTimer)
    setUndoTimer(null)
    const rb = undoAction.rollback
    setUndoAction(null)
    rb()
  }

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
        <>
          <div
            onDragOver={handleUnattachDragOver}
            onDragLeave={handleUnattachDragLeave}
            onDrop={handleUnattachDrop}
            className={`mb-3 rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs transition-colors ${unattachZoneActive ? 'border-dnd-gold bg-dnd-gold/10 text-dnd-gold' : 'border-dnd-card text-dnd-text-muted'}`}
          >
            将附属卡拖到此处可解除附属，恢复为主卡
          </div>
          <ul className="space-y-4">
          {(() => {
            const byId = new Map(list.map((c) => [c.id, c]))
            const childrenByParent = {}
            list.forEach((c) => {
              if (!c.parentId) return
              if (!childrenByParent[c.parentId]) childrenByParent[c.parentId] = []
              childrenByParent[c.parentId].push(c)
            })
            Object.keys(childrenByParent).forEach((pid) => {
              childrenByParent[pid].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
            })
            const roots = list
              .filter((c) => !c.parentId || !byId.has(c.parentId))
              .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))

            const renderNode = (c, depth = 0) => {
              const children = childrenByParent[c.id] || []
              const hasSubs = children.length > 0
              const isCollapsed = collapsedMains.has(c.id)
              const onToggleCollapse = () => toggleCollapse(c.id)
              const isSubordinate = depth > 0
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
              const subLabel = isSubordinate ? (c.subordinateTemplate === 'creature' ? '生物' : '附属') : null
              const summaryBlock = (
                <>
                  <div className="min-w-0 flex-1">
                    {c.codename ? (
                      <p className={`font-semibold text-white truncate mb-0.5 ${isSubordinate ? 'text-xs' : 'text-base'}`}>{c.codename}</p>
                    ) : null}
                    {isSubordinate ? (
                      <p className="text-dnd-text-muted text-[11px] flex flex-wrap items-center gap-x-2 min-w-0">
                        {subLabel != null && (
                          <span className={`inline-block px-1.5 py-0.5 rounded shrink-0 text-[10px] font-medium border ${c.subordinateTemplate === 'creature' ? 'bg-dnd-card border-dnd-warning/50 text-dnd-warning' : 'bg-dnd-card border-dnd-gold/50 text-dnd-gold'}`}>
                            {subLabel}
                          </span>
                        )}
                        <span className="truncate">{c.name || '未命名'}</span>
                        <span className="shrink-0 text-dnd-card/80" aria-hidden>|</span>
                        <span className="truncate">{classLevelText} · 等级 {level}</span>
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-dnd-text-muted truncate">
                          {c.name || '未命名'}
                        </p>
                        <p className="text-dnd-text-muted text-sm">
                          {classLevelText} · 等级 {level}
                        </p>
                      </>
                    )}
                    <div className={`rounded-full bg-black/30 overflow-hidden ${isSubordinate ? 'mt-1 h-1' : 'mt-1.5 h-1.5'}`}>
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className={`flex items-end justify-between gap-2 min-w-0 ${isSubordinate ? 'mt-0.5 min-h-[1rem]' : 'mt-0.5 min-h-[1.25rem]'}`}>
                      <p className={`text-dnd-text-muted truncate min-w-0 ${isSubordinate ? 'text-[10px]' : 'text-xs'}`}>
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
                      <p className={`font-mono font-semibold shrink-0 ${isSubordinate ? 'text-[10px]' : 'text-xs'} ${isLowHp ? 'text-dnd-red' : 'text-dnd-text-muted'}`}>
                        HP {cur}/{max}
                        {hp.temp ? ` +${hp.temp} 临时` : ''}
                      </p>
                    </div>
                  </div>
                </>
              )
              const isDropTarget = dragOverId === c.id
              return (
                <div key={c.id} className={depth > 0 ? 'mt-1.5' : ''} style={{ marginLeft: depth > 0 ? `${depth * 20}px` : 0 }}>
                  <div
                    onDragOver={(e) => { e.preventDefault(); handleDragOver(e, c.id) }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, c)}
                    className={`flex items-center gap-3 rounded-xl shadow-dnd-card transition-shadow ${isSubordinate ? 'p-2.5 gap-2 bg-dnd-card/80 border border-dnd-gold/20 border-l-4 border-l-dnd-gold hover:border-dnd-gold/30' : 'p-4 bg-dnd-card border border-white/10 border-l-4 border-dnd-red hover:shadow-dnd-card-hover'} ${isDropTarget ? 'ring-2 ring-dnd-gold ring-offset-2 ring-offset-dnd-bg cursor-copy' : (!isSubordinate ? 'cursor-default' : '')}`}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => { handleDragStart(e, c); e.stopPropagation() }}
                      onDragEnd={handleDragEnd}
                      title="拖动卡片（可拖到其他卡下设为附属，或拖到顶部解除区）"
                      className={`shrink-0 h-[4.8rem] w-7 rounded-lg border border-white/10 bg-black/20 flex flex-col items-center justify-center gap-1 text-dnd-text-muted hover:text-dnd-gold-light hover:bg-white/10 cursor-grab active:cursor-grabbing ${draggingId === c.id ? 'opacity-70' : ''}`}
                    >
                      <span className="w-[3px] h-8 rounded-full bg-current/80" aria-hidden />
                      <GripVertical className="w-4 h-4" />
                    </button>
                    {!isSubordinate && (
                      <div className="relative shrink-0 w-[5.5rem] h-[5.5rem] rounded-lg overflow-hidden bg-black/30 border border-white/10">
                        {hasSubs && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCollapse?.(); }}
                            title={isCollapsed ? '展开附属卡' : '收起附属卡'}
                            className="absolute top-1 left-1 z-10 flex items-center justify-center w-7 h-7 rounded-md text-dnd-text-muted hover:text-dnd-gold hover:bg-black/40 transition-colors"
                            aria-expanded={!isCollapsed}
                          >
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                        <Link to={`/characters/${c.id}`} className="absolute inset-0 block" onClick={(e) => e.stopPropagation()} aria-hidden />
                        {c.avatar ? (
                          <img src={c.avatar} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <User className="w-8 h-8 text-dnd-text-muted" />
                          </span>
                        )}
                      </div>
                    )}
                    <Link to={`/characters/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4" onClick={(e) => e.stopPropagation()}>
                      {summaryBlock}
                    </Link>
                    {canEdit && (
                      <div className={`flex shrink-0 items-center gap-1 ${isSubordinate ? 'gap-0.5' : ''}`}>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAssigningSubId(c.id); setAssignSearch('') }}
                          title="选择归属主卡"
                          className="px-2 py-1 rounded-md text-[10px] text-dnd-gold-light bg-dnd-gold/15 hover:bg-dnd-gold/25 border border-dnd-gold/35"
                        >
                          归属
                        </button>
                        {isSubordinate && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); applyUnattach(c) }}
                            title="解除归属"
                            className="px-2 py-1 rounded-md text-[10px] text-gray-300 hover:text-white bg-gray-700/50 hover:bg-gray-700 border border-gray-600"
                          >
                            解除
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDuplicate(e, c)}
                          title="复制角色"
                          className={`rounded-lg text-dnd-text-muted hover:text-emerald-400 hover:bg-emerald-400/20 transition-colors ${isSubordinate ? 'p-1.5' : 'p-2'}`}
                        >
                          <Copy className={isSubordinate ? 'w-4 h-4' : 'w-5 h-5'} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleSetDefault(e, c)}
                          title={isDefault ? '取消常用' : '设为常用（我的角色/角色法术默认选此角色）'}
                          className={`rounded-lg transition-colors ${isSubordinate ? 'p-1.5' : 'p-2'} ${isDefault ? 'text-dnd-gold-light bg-dnd-gold-light/20' : 'text-dnd-text-muted hover:text-dnd-gold-light hover:bg-white/10'}`}
                          aria-pressed={isDefault}
                        >
                          <Star className={isSubordinate ? 'w-4 h-4' : 'w-5 h-5'} fill={isDefault ? 'currentColor' : 'none'} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, c)}
                          title="删除角色"
                          className={`rounded-lg text-dnd-text-muted hover:text-dnd-red hover:bg-dnd-red/20 transition-colors ${isSubordinate ? 'p-1.5' : 'p-2'}`}
                        >
                          <Trash2 className={isSubordinate ? 'w-4 h-4' : 'w-5 h-5'} />
                        </button>
                      </div>
                    )}
                  </div>
                  {hasSubs && !isCollapsed && (
                    <div className="space-y-0.5">
                      {children.map((ch) => renderNode(ch, depth + 1))}
                    </div>
                  )}
                </div>
              )
            }
            return roots.map((r) => <li key={r.id}>{renderNode(r, 0)}</li>)
          })()}
          </ul>
        </>
      )}
      {assigningSubId && (() => {
        const sub = list.find((x) => x.id === assigningSubId)
        if (!sub) return null
        const mains = list
          .filter((x) => !x.parentId && x.id !== sub.id)
          .filter((x) => {
            const q = assignSearch.trim()
            if (!q) return true
            const s = `${x.codename || ''} ${x.name || ''}`.toLowerCase()
            return s.includes(q.toLowerCase())
          })
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
        return (
          <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" onClick={() => setAssigningSubId(null)}>
            <div className="w-full max-w-md rounded-xl bg-dnd-card border border-white/10 p-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold text-dnd-gold-light mb-2">选择归属主卡</p>
              <p className="text-xs text-dnd-text-muted mb-2">当前：{sub.codename || sub.name || '未命名'}</p>
              <input
                type="text"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                placeholder="搜索主卡名或代号"
                className="w-full h-9 rounded-lg bg-gray-800 border border-gray-600 px-2 text-sm text-white mb-2"
              />
              <div className="max-h-64 overflow-auto space-y-1 pr-1">
                {mains.length === 0 ? (
                  <div className="text-xs text-dnd-text-muted py-4 text-center">没有可归属的主卡</div>
                ) : mains.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { applyAttach(sub, m); setAssigningSubId(null) }}
                    className="w-full text-left px-2 py-2 rounded-lg border border-gray-700 hover:border-dnd-gold/50 hover:bg-white/5"
                  >
                    <p className="text-sm text-white truncate">{m.codename || m.name || '未命名'}</p>
                    <p className="text-[11px] text-dnd-text-muted truncate">{m.name || '—'}</p>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => setAssigningSubId(null)} className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-white">取消</button>
              </div>
            </div>
          </div>
        )
      })()}
      {undoAction && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[130]">
          <div className="rounded-lg border border-dnd-gold/40 bg-gray-900/95 px-3 py-2 shadow-xl flex items-center gap-3">
            <span className="text-xs text-dnd-gold-light">{undoAction.label}</span>
            <button type="button" onClick={handleUndo} className="px-2 py-1 rounded bg-dnd-gold/20 text-dnd-gold-light hover:bg-dnd-gold/30 text-xs">
              撤销
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

