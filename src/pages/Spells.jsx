import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Search, Plus } from 'lucide-react'
import {
  getMergedSpells,
  getSpellById,
  SPELL_SCHOOLS,
  addCustomSpell,
} from '../data/spellDatabase'
import { getCharacter, updateCharacter } from '../lib/characterStore'

const LEVEL_LABELS = {
  0: '戏法',
  1: '一环',
  2: '二环',
  3: '三环',
  4: '四环',
  5: '五环',
  6: '六环',
  7: '七环',
  8: '八环',
  9: '九环',
}

/** 学派 → 标签样式（背景/文字/边框） */
const SCHOOL_TAG_STYLES = {
  防护: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  咒法: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  预言: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
  惑控: 'bg-pink-500/20 text-pink-200 border-pink-500/40',
  塑能: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  幻术: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
  死灵: 'bg-purple-600/25 text-purple-200 border-purple-500/40',
  变化: 'bg-teal-500/20 text-teal-200 border-teal-500/40',
  灵能: 'bg-indigo-500/25 text-indigo-200 border-indigo-500/50',
}
function getSchoolTagStyle(school) {
  return SCHOOL_TAG_STYLES[school] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/40'
}

const initialSpellForm = {
  name: '',
  level: 0,
  school: '',
  source: [],
  castingTime: '',
  range: '',
  components: '',
  duration: '',
  description: '',
  ritual: false,
}

function SpellAddForm({ form, setForm, onSave, onCancel }) {
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const sourceStr = Array.isArray(form.source) ? form.source.join('、') : (form.source || '')
  const setSourceStr = (s) => update('source', s ? s.split(/[、,，]/).map((x) => x.trim()).filter(Boolean) : [])

  return (
    <div className="rounded-xl bg-dnd-card border border-white/10 p-4 mb-4">
      <h3 className="text-white font-medium text-sm mb-3">新增自定义法术</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">名称 *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="法术名称"
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
          />
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">环阶</label>
          <select
            value={form.level}
            onChange={(e) => update('level', parseInt(e.target.value, 10))}
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2"
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lv) => (
              <option key={lv} value={lv}>{LEVEL_LABELS[lv]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">学派</label>
          <select
            value={form.school}
            onChange={(e) => update('school', e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2"
          >
            <option value="">—</option>
            {SPELL_SCHOOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">法表（多个用顿号或逗号）</label>
          <input
            type="text"
            value={sourceStr}
            onChange={(e) => setSourceStr(e.target.value)}
            placeholder="术士、法师"
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
          />
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">施法时间</label>
          <input
            type="text"
            value={form.castingTime}
            onChange={(e) => update('castingTime', e.target.value)}
            placeholder="动作"
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">距离</label>
          <input
            type="text"
            value={form.range}
            onChange={(e) => update('range', e.target.value)}
            placeholder="60 尺"
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">成分</label>
          <input
            type="text"
            value={form.components}
            onChange={(e) => update('components', e.target.value)}
            placeholder="V、S"
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-1">持续</label>
          <input
            type="text"
            value={form.duration}
            onChange={(e) => update('duration', e.target.value)}
            placeholder="立即"
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-dnd-text-muted text-xs mb-1">描述</label>
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="法术效果描述"
            rows={3}
            className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
          />
        </div>
        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="spell-ritual"
            checked={form.ritual}
            onChange={(e) => update('ritual', e.target.checked)}
            className="rounded border-white/20 bg-gray-800 text-dnd-red focus:ring-dnd-red"
          />
          <label htmlFor="spell-ritual" className="text-dnd-text-muted text-sm">仪式</label>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => form.name.trim() && onSave()}
          disabled={!form.name.trim()}
          className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-sm font-medium"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
        >
          取消
        </button>
      </div>
    </div>
  )
}

/** 把描述里的伤害骰和豁免类型高亮+加粗，返回可渲染的片段数组 */
function highlightSpellDescription(description) {
  if (!description) return null
  const re = /(\d+d\d+)|(敏捷豁免|感知豁免|体质豁免|力量豁免|智力豁免|魅力豁免)/g
  const parts = []
  let lastIndex = 0
  let key = 0
  let match
  while ((match = re.exec(description)) !== null) {
    if (match.index > lastIndex) {
      parts.push(description.slice(lastIndex, match.index))
    }
    const text = match[1] ?? match[2]
    const isDamage = match[1] != null
    parts.push(
      <span
        key={`h-${key++}`}
        className={isDamage ? 'font-bold text-amber-300' : 'font-bold text-sky-300'}
      >
        {text}
      </span>
    )
    lastIndex = re.lastIndex
  }
  if (lastIndex < description.length) {
    parts.push(description.slice(lastIndex))
  }
  return parts
}

export default function Spells() {
  const [searchParams] = useSearchParams()
  const charId = searchParams.get('char')
  const char = charId ? getCharacter(charId) : null
  const charSpellIds = new Set((char?.spells ?? []).map((s) => s.spellId ?? s.id).filter(Boolean))

  const [spellsList, setSpellsList] = useState(() => getMergedSpells())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterSchool, setFilterSchool] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [expandedSpellIds, setExpandedSpellIds] = useState(() => new Set())
  const [expandedLevels, setExpandedLevels] = useState(() => new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))
  const [showAddSpell, setShowAddSpell] = useState(false)
  const [spellForm, setSpellForm] = useState(initialSpellForm)
  const [, setCharRefresh] = useState(0)

  const refreshSpells = () => setSpellsList(getMergedSpells())

  useEffect(() => {
    const h = () => refreshSpells()
    window.addEventListener('dnd-realtime-custom-library', h)
    return () => window.removeEventListener('dnd-realtime-custom-library', h)
  }, [])

  const addSpellToChar = (spellId) => {
    if (!char?.id) return
    const spell = getSpellById(spellId)
    const isCantrip = spell && (spell.level ?? 0) === 0
    const current = char.spells ?? []
    const next = [...current, { spellId, prepared: isCantrip }]
    updateCharacter(char.id, { spells: next })
    setCharRefresh((r) => r + 1)
  }

  const handleSaveSpell = () => {
    Promise.resolve(addCustomSpell(spellForm)).then(() => {
      setSpellForm(initialSpellForm)
      setShowAddSpell(false)
      refreshSpells()
    })
  }

  let list = spellsList
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase()
    list = list.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.description && s.description.toLowerCase().includes(q))
    )
  }
  if (filterLevel !== '') {
    const lv = parseInt(filterLevel, 10)
    list = list.filter((s) => s.level === lv)
  }
  if (filterSchool) list = list.filter((s) => s.school === filterSchool)
  if (filterClass) list = list.filter((s) => s.source?.includes(filterClass))

  const grouped = {}
  list.forEach((s) => {
    const lv = s.level != null ? s.level : 0
    if (!grouped[lv]) grouped[lv] = []
    grouped[lv].push(s)
  })
  const sortedLevels = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b)

  const toggleSpell = (id) => {
    setExpandedSpellIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleLevel = (level) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  const hasFilters = filterLevel !== '' || filterSchool || filterClass || searchQuery.trim()

  const allClasses = Array.from(new Set(spellsList.flatMap((s) => s.source ?? []))).sort()

  return (
    <div className="p-4 pb-32 min-h-screen bg-dnd-bg">
      {char && (
        <div className="mb-4 rounded-lg border border-dnd-gold/50 bg-dnd-gold/10 px-4 py-2 text-dnd-gold text-sm">
          正在为角色 <span className="font-semibold">{char.name || '未命名'}</span> 添加法术，点击「添加至角色」将法术加入角色法术卡
        </div>
      )}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="font-display text-xl font-semibold text-white">
          法术大全
        </h1>
        <button
          type="button"
          onClick={() => setShowAddSpell((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium shrink-0"
        >
          <Plus className="w-4 h-4" />
          新增法术
        </button>
      </div>

      {showAddSpell && (
        <SpellAddForm
          form={spellForm}
          setForm={setSpellForm}
          onSave={handleSaveSpell}
          onCancel={() => { setShowAddSpell(false); setSpellForm(initialSpellForm) }}
        />
      )}

      {spellsList.length === 0 ? (
        <div className="rounded-xl bg-dnd-card border border-white/10 p-6">
          <p className="text-dnd-text-muted text-sm mb-2">
            法术数据尚未录入。录入后此处将按环阶分栏展示，并支持按职业、学派、仪式与关键词筛选。
          </p>
          <p className="text-dnd-text-muted text-xs">
            数据文件：<code className="bg-white/10 px-1 rounded">src/data/spellDatabase.js</code>，结构见 <code className="bg-white/10 px-1 rounded">docs/法术大全-需求分解.md</code>。
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-dnd-card border border-white/10 p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[140px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dnd-text-muted" />
                <input
                  type="text"
                  placeholder="搜索法术名或描述"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full pl-9 pr-3 rounded-lg bg-gray-800 text-white border border-white/10 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-sm"
                />
              </div>
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="h-10 px-3 rounded-lg bg-gray-800 text-white border border-white/10 text-sm min-w-[100px]"
              >
                <option value="">全部环阶</option>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lv) => (
                  <option key={lv} value={lv}>
                    {LEVEL_LABELS[lv]}
                  </option>
                ))}
              </select>
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className="h-10 px-3 rounded-lg bg-gray-800 text-white border border-white/10 text-sm min-w-[100px]"
              >
                <option value="">全部学派</option>
                {SPELL_SCHOOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="h-10 px-3 rounded-lg bg-gray-800 text-white border border-white/10 text-sm min-w-[100px]"
              >
                <option value="">全部法表</option>
                {allClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <p className="text-dnd-text-muted text-xs mt-2">
                当前筛选结果：{list.length} 个法术
              </p>
            )}
          </div>

          <div className="space-y-4">
            {sortedLevels.length === 0 ? (
              <div className="rounded-xl bg-dnd-card border border-white/10 p-4">
                <p className="text-dnd-text-muted text-sm">无匹配法术。</p>
              </div>
            ) : (
              sortedLevels.map((level) => {
                const isLevelOpen = expandedLevels.has(level)
                return (
                <div key={level} className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className="w-full flex items-center gap-2 text-dnd-gold-light text-sm font-bold uppercase tracking-wider px-4 py-3 border-b border-white/10 hover:bg-white/5 transition-colors text-left"
                  >
                    {isLevelOpen ? (
                      <ChevronDown className="w-5 h-5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 shrink-0" />
                    )}
                    <span>{LEVEL_LABELS[level]}</span>
                    <span className="text-dnd-text-muted font-normal normal-case text-xs">
                      （{grouped[level].length}）
                    </span>
                  </button>
                  {isLevelOpen && (
                  <ul className="divide-y divide-white/10">
                    {grouped[level].map((s) => {
                      const isOpen = expandedSpellIds.has(s.id)
                      const canAddToChar = char && !charSpellIds.has(s.id)
                      return (
                        <li key={s.id}>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleSpell(s.id)}
                              className="flex-1 flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors min-w-0"
                            >
                              {isOpen ? (
                                <ChevronDown className="w-5 h-5 shrink-0" />
                              ) : (
                                <ChevronRight className="w-5 h-5 shrink-0" />
                              )}
                              <span className="font-medium">{s.name}</span>
                              {s.school && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${getSchoolTagStyle(s.school)}`}
                                >
                                  {s.school}
                                </span>
                              )}
                              {s.ritual && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-white/50 bg-white/5 border-0">
                                  仪式
                                </span>
                              )}
                              {s.source?.length > 0 && (
                                <span className="text-dnd-text-muted text-xs ml-auto">
                                  {s.source.slice(0, 3).join('、')}
                                  {s.source.length > 3 ? '…' : ''}
                                </span>
                              )}
                            </button>
                            {canAddToChar && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  addSpellToChar(s.id)
                                }}
                                className="shrink-0 px-2 py-1 rounded bg-dnd-gold/30 text-dnd-gold hover:bg-dnd-gold/40 text-xs font-medium mr-2"
                              >
                                添加至角色
                              </button>
                            )}
                          </div>
                          {isOpen && (
                            <div className="px-4 pb-4 pt-0 border-t border-white/10 text-sm text-dnd-text-muted">
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 mb-2 text-xs">
                                {s.castingTime && (
                                  <>
                                    <span>施法时间</span>
                                    <span>{s.castingTime}</span>
                                  </>
                                )}
                                {s.range && (
                                  <>
                                    <span>距离</span>
                                    <span>{s.range}</span>
                                  </>
                                )}
                                {s.components && (
                                  <>
                                    <span>成分</span>
                                    <span>{s.components}</span>
                                  </>
                                )}
                                {s.duration && (
                                  <>
                                    <span>持续</span>
                                    <span>{s.duration}</span>
                                  </>
                                )}
                              </div>
                              <p className="whitespace-pre-line">{highlightSpellDescription(s.description)}</p>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  )}
                </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
