/**
 * 角色法术：从法术大全添加法术，支持「已准备」切换
 * 以卡片形式展示，从低环到高环垂直排布
 */
import { useMemo, useState, useRef, useEffect } from 'react'
import { Trash2, Search, BookOpen, Plus, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getSpellById, getSpellsByClass, searchSpells } from '../data/spellDatabase'
import { getPrimarySpellcastingAbility, getCharacterClasses, getSpellcastingLevel, getMaxSpellSlotsByRing } from '../data/classDatabase'
import { abilityModifier, proficiencyBonus } from '../lib/formulas'
import { levelFromXP } from '../lib/xp5e'
import { ABILITY_NAMES_ZH } from '../data/buffTypes'
import { inputClass } from '../lib/inputStyles'

const PREPARE_ALL_CLASSES = ['牧师', '德鲁伊', '游侠', '圣武士']

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

export default function CharacterSpells({ char, canEdit, onSave }) {
  const raw = char?.spells ?? []
  const spells = raw.map((s) => ({
    spellId: s.spellId ?? s.id ?? '',
    prepared: !!s.prepared,
  }))
  const spellIds = new Set(spells.map((s) => s.spellId).filter(Boolean))

  /** 按环阶分组（0→9），同环内按名称排序 */
  const spellsByLevel = useMemo(() => {
    const grouped = {}
    for (let i = 0; i <= 9; i++) grouped[i] = []
    ;[...spells]
      .map((item) => {
        const spell = getSpellById(item.spellId)
        return spell ? { ...item, spell } : null
      })
      .filter(Boolean)
      .sort((a, b) => (a.spell.name ?? '').localeCompare(b.spell.name ?? ''))
      .forEach((item) => {
        const lv = item.spell.level ?? 0
        if (grouped[lv]) grouped[lv].push(item)
      })
    return grouped
  }, [spells])

  const addSpell = (spellId) => {
    if (!spellId) return
    const spell = getSpellById(spellId)
    const isCantrip = spell && (spell.level ?? 0) === 0
    const next = [...spells, { spellId, prepared: isCantrip }]
    onSave({ spells: next })
  }

  const togglePrepared = (spellId) => {
    const next = spells.map((item) =>
      item.spellId === spellId ? { ...item, prepared: !item.prepared } : item
    )
    onSave({ spells: next })
  }

  const removeSpell = (spellId) => {
    const next = spells.filter((item) => item.spellId !== spellId)
    onSave({ spells: next })
  }

  /** 施法等级与环位数量（与 CombatStatus 一致：含 spellSlotsMaxOverride + 额外环位） */
  const spellLevel = getSpellcastingLevel(char)
  const maxSlotsByRing = useMemo(() => getMaxSpellSlotsByRing(char), [char])
  const spellSlotsMaxOverride = char?.spellSlotsMax && typeof char.spellSlotsMax === 'object' ? char.spellSlotsMax : {}
  const spellSlotsCurrent = char?.spellSlots ?? {} // { 1: 2, 2: 1, ... } 当前剩余
  const extraSlotsList = useMemo(() => {
    const raw = char?.extraSpellSlots
    if (Array.isArray(raw)) return raw.map((e) => ({ id: e.id, ring: Number(e.ring) || 1, max: Math.max(0, Number(e.max) || 0) }))
    if (raw && typeof raw === 'object') return Object.entries(raw).filter(([, n]) => (n || 0) > 0).map(([ring, max]) => ({ id: 'ex_' + ring, ring: Number(ring) || 1, max: Number(max) || 0 }))
    return []
  }, [char?.extraSpellSlots])
  const extraSlotsMode = char?.extraSpellSlotsMode === 'points' ? 'points' : 'slots'
  const effectiveMaxByRing = useMemo(() => {
    const out = {}
    const fromExtra = extraSlotsMode === 'slots' ? extraSlotsList : []
    for (let ring = 1; ring <= 9; ring++) {
      const base = spellSlotsMaxOverride[ring] != null ? Math.max(0, Number(spellSlotsMaxOverride[ring]) || 0) : (maxSlotsByRing[ring] ?? 0)
      out[ring] = base + fromExtra.filter((e) => e.ring === ring).reduce((s, e) => s + (e.max || 0), 0)
    }
    return out
  }, [maxSlotsByRing, spellSlotsMaxOverride, extraSlotsList, extraSlotsMode])
  const extraPoints = useMemo(() => {
    const p = char?.extraSpellSlotsPoints
    const max = Math.max(0, Number(p?.max) ?? 0)
    const current = Math.max(0, Math.min(max || 999, Number(p?.current) ?? max))
    return { max, current }
  }, [char?.extraSpellSlotsPoints])

  const setSpellSlotCurrent = (ring, remaining) => {
    const max = effectiveMaxByRing[ring] ?? maxSlotsByRing[ring] ?? 0
    const next = { ...spellSlotsCurrent, [ring]: Math.max(0, Math.min(max, remaining)) }
    onSave({ spellSlots: next })
  }

  /** 施法属性、法术攻击加值、法术DC（自动计算） */
  const spellAbility = getPrimarySpellcastingAbility(char)
  const charLevel = Math.max(1, levelFromXP(char?.xp ?? 0))
  const prof = proficiencyBonus(charLevel)
  const abilityMod = spellAbility ? abilityModifier(char?.abilities?.[spellAbility] ?? 10) : 0
  const spellAttackBonus = spellAbility != null ? prof + abilityMod : null
  const spellDC = spellAbility != null ? 8 + prof + abilityMod : null
  const preparedCount = useMemo(() => {
    return spells.filter((s) => {
      const spell = getSpellById(s.spellId)
      const level = spell?.level ?? 0
      return level >= 1 && s.prepared
    }).length
  }, [spells])

  const classes = getCharacterClasses(char) ?? []
  const prepareAllClass = classes.find((c) => PREPARE_ALL_CLASSES.includes(c.name))?.name

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [castModal, setCastModal] = useState({ open: false, spell: null, spellId: '', spellLevel: 0 })
  const [castRing, setCastRing] = useState(1)
  const [castSource, setCastSource] = useState('normal') // 'normal' | 'extraPoints'
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)

  /** 角色职业可学的法术，按环位分组，排除已添加 */
  const spellsByLevelForDropdown = useMemo(() => {
    const seen = new Set()
    const byLevel = {}
    for (let i = 0; i <= 9; i++) byLevel[i] = []
    for (const c of classes) {
      for (const s of getSpellsByClass(c.name) ?? []) {
        if (spellIds.has(s.id) || seen.has(s.id)) continue
        seen.add(s.id)
        const lv = s.level ?? 0
        if (byLevel[lv]) byLevel[lv].push(s)
      }
    }
    for (const k of Object.keys(byLevel)) {
      byLevel[k].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    }
    return byLevel
  }, [classes, spellIds])

  const searchResults = useMemo(() => {
    if (!searchQuery?.trim()) return []
    return searchSpells(searchQuery).filter((s) => !spellIds.has(s.id)).slice(0, 20)
  }, [searchQuery, spellIds])

  useEffect(() => {
    const onOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchQuery('')
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [])

  const addAllClassSpells = () => {
    if (!prepareAllClass) return
    const classSpells = getSpellsByClass(prepareAllClass)
    // 戏法不参与“全部学会”，需通过法术大全手动添加
    const toAdd = classSpells.filter((s) => !spellIds.has(s.id) && (s.level ?? 0) >= 1)
    const next = [...spells, ...toAdd.map((s) => ({ spellId: s.id, prepared: (s.level ?? 0) === 0 }))]
    onSave({ spells: next })
  }

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="space-y-2">
        {spellAbility != null && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 px-5 rounded-xl bg-[#1b2536]/72 border-l-4 border-dnd-gold border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="text-center min-w-0">
              <p className="text-dnd-text-muted text-xs font-bold uppercase tracking-wider mb-1.5">施法属性</p>
              <p className="text-dnd-gold-light text-lg font-bold truncate">{ABILITY_NAMES_ZH[spellAbility] ?? spellAbility}</p>
            </div>
            <div className="text-center min-w-0 border-r border-white/10">
              <p className="text-dnd-text-muted text-xs font-bold uppercase tracking-wider mb-1.5">法术攻击加值</p>
              <p className="text-white text-xl font-mono font-bold">{spellAttackBonus >= 0 ? '+' : ''}{spellAttackBonus}</p>
            </div>
            <div className="text-center min-w-0 border-r border-white/10">
              <p className="text-dnd-text-muted text-xs font-bold uppercase tracking-wider mb-1.5">法术DC</p>
              <p className="text-white text-xl font-mono font-bold">{spellDC}</p>
            </div>
            <div className="text-center min-w-0">
              <p className="text-dnd-text-muted text-xs font-bold uppercase tracking-wider mb-1.5">已准备法术</p>
              <p className="text-white text-xl font-mono font-bold">{preparedCount}</p>
            </div>
          </div>
        )}
        <p className="text-gray-500 text-xs">从法术大全添加法术至角色卡，可标记已准备。下方「添加法术」为按角色职业法表可学（且排除已添加），「从法术大全添加」才是全法表。</p>
        {canEdit && (
          <div className="space-y-3">
            <p className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold">添加法术</p>
            <div className="flex flex-wrap gap-2 items-center">
              <div ref={dropdownRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDropdownOpen((v) => !v) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1b2738] text-gray-300 hover:bg-[#24344d] border border-[#3a4e69] text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  添加法术
                  <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {dropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#1b2738] shadow-xl py-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                      const list = spellsByLevelForDropdown[level] ?? []
                      if (list.length === 0) return null
                      return (
                        <div key={level} className="py-1">
                          <div className="px-3 py-1 text-dnd-gold-light text-xs font-bold uppercase tracking-wider border-b border-gray-600/60">
                            {LEVEL_LABELS[level] ?? `${level}环`}
                          </div>
                          {list.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => { addSpell(s.id); setDropdownOpen(false) }}
                              className="w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-700/80"
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every((l) => (spellsByLevelForDropdown[l] ?? []).length === 0) && (
                      <p className="px-3 py-4 text-gray-500 text-sm">无可添加的法术（需先设置职业）</p>
                    )}
                  </div>
                )}
              </div>
              <Link
                to={char?.id ? `/spells?char=${char.id}` : '/spells'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1b2738] text-gray-300 hover:bg-[#24344d] border border-[#3a4e69] text-sm font-medium shrink-0"
              >
                <BookOpen className="w-4 h-4" />
                从法术大全添加
              </Link>
              <div ref={searchRef} className="relative flex-1 min-w-[140px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜索法术加入..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={inputClass + ' pl-9 w-full'}
                />
                {searchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-[#1b2738] shadow-xl py-1">
                    {searchResults.length > 0 ? (
                      searchResults.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => { addSpell(s.id); setSearchQuery('') }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-700/80"
                        >
                          <span className="text-sm text-gray-200">{s.name}</span>
                          <span className="text-xs text-gray-500 shrink-0">{LEVEL_LABELS[s.level] ?? `${s.level}环`}</span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-4 text-gray-500 text-sm">未找到匹配的法术</p>
                    )}
                  </div>
                )}
              </div>
              {prepareAllClass && (
                <button
                  type="button"
                  onClick={addAllClassSpells}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-dnd-gold/20 text-dnd-gold hover:bg-dnd-gold/30 border border-dnd-gold/50 text-sm font-medium shrink-0"
                >
                  全部学会{prepareAllClass}法术
                </button>
              )}
            </div>
          </div>
        )}
        {/* 已添加的法术：左为环位，右为法术卡片横向铺开，自动换行 */}
        <div>
          <p className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold mb-2">已添加</p>
          {spells.length > 0 ? (
            <div className="space-y-4">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                const levelSpells = spellsByLevel[level] ?? []
                if (levelSpells.length === 0) return null
                const levelLabel = LEVEL_LABELS[level] ?? `${level}环`
                const maxSlots = level >= 1 ? (maxSlotsByRing[level] ?? 0) : 0
                const currentSlots = level >= 1 ? (spellSlotsCurrent[level] ?? maxSlots) : 0
                const clampedCurrent = Math.min(maxSlots, Math.max(0, currentSlots))

                return (
                  <div key={level} className="space-y-2">
                    <div className="rounded-lg px-4 py-2 bg-dnd-gold/30 border-l-4 border-dnd-gold border border-dnd-gold/50 shadow-md flex items-center justify-between gap-3">
                      <span className="text-dnd-gold-light text-base font-bold tracking-wide">{levelLabel}</span>
                      {level >= 1 && maxSlots > 0 && (
                        <div className="flex items-center gap-0.5 shrink-0" title={`环位数量：${clampedCurrent}/${maxSlots}`}>
                          {Array.from({ length: maxSlots }, (_, i) => {
                            const filled = i < clampedCurrent
                            return canEdit ? (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  const next = i + 1
                                  if (next === 1 && clampedCurrent === 1) setSpellSlotCurrent(level, 0)
                                  else setSpellSlotCurrent(level, next)
                                }}
                                className={`w-4 h-4 rounded-full border-2 transition-colors ${
                                  filled
                                    ? 'bg-dnd-gold border-dnd-gold-light'
                                    : 'bg-transparent border-dnd-gold/60 hover:border-dnd-gold'
                                }`}
                                aria-label={i === 0 && clampedCurrent === 1 ? '剩余 0 个' : `剩余 ${i + 1} 个`}
                              />
                            ) : (
                              <span
                                key={i}
                                className={`inline-block w-4 h-4 rounded-full border-2 ${
                                  filled ? 'bg-dnd-gold border-dnd-gold-light' : 'bg-transparent border-dnd-gold/60'
                                }`}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {levelSpells.map(({ spellId, prepared, spell }) => {
                        const metaItems = [
                          { label: '施法时间', value: spell.castingTime },
                          { label: '施法距离', value: spell.range },
                          { label: '法术成分', value: spell.components },
                          { label: '持续时间', value: spell.duration },
                        ].filter((m) => m.value)
                        return (
                          <div
                            key={spellId}
                            className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/22 to-[#222f45]/18 p-3 min-w-0 overflow-visible flex flex-col h-full shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          >
                            <div className="flex flex-col flex-1 min-h-0">
                              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-1.5">
                              <div className="flex items-center justify-between gap-2 min-h-[2rem]">
                                <span className="block text-base font-semibold text-white leading-tight truncate min-w-0 flex-1">
                                  {spell.name}
                                </span>
                                {canEdit && (
                                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    <button
                                      type="button"
                                      onClick={() => togglePrepared(spellId)}
                                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors border shrink-0 ${
                                        prepared
                                          ? 'bg-emerald-600/40 text-white border-emerald-500/50'
                                          : 'bg-gray-700/50 text-gray-500 border-gray-600 hover:border-gray-500 hover:text-gray-400'
                                      }`}
                                    >
                                      {prepared ? '已准备' : '未准备'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeSpell(spellId)}
                                      className="p-1 rounded text-gray-500 hover:bg-red-900/30 hover:text-dnd-red shrink-0"
                                      title="移除"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              {spell.school && (
                                <div>
                                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${getSchoolTagStyle(spell.school)}`}>
                                    {spell.school}
                                  </span>
                                </div>
                              )}
                              {metaItems.length > 0 && (
                                <div className="space-y-0.5 text-sm">
                                  {metaItems.map(({ label, value }) => {
                                    const isRitualCastingTime = label === '施法时间' && spell.ritual && value
                                    return (
                                      <div key={label} className="flex gap-2 items-baseline min-w-0">
                                        <span className="text-dnd-gold-light shrink-0 w-16 text-xs font-medium">{label}：</span>
                                        <span className={`min-w-0 flex-1 break-words ${isRitualCastingTime ? 'inline-block px-1.5 py-0.5 rounded border border-dnd-gold/50 bg-dnd-gold/20 text-dnd-gold text-sm' : 'text-gray-300 text-sm'}`}>
                                          {value}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              {spell.description && (
                                <div className="pt-1 border-t border-white/10">
                                  <span className="text-dnd-gold-light text-xs font-bold block mb-0.5">法术描述</span>
                                  <p className="text-gray-300 text-sm whitespace-pre-line leading-snug text-justify">{spell.description}</p>
                                </div>
                              )}
                              </div>
                              <div className="pt-2 border-t border-white/10 mt-auto shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if ((spell.level ?? 0) === 0) {
                                      // 戏法不消耗环位，直接视为施放
                                      return
                                    }
                                    setCastModal({ open: true, spell, spellId, spellLevel: spell.level })
                                    setCastRing(spell.level)
                                    setCastSource('normal')
                                  }}
                                  className="w-full py-2 rounded-lg bg-dnd-red/80 hover:bg-dnd-red border border-dnd-red text-white text-sm font-medium transition-colors"
                                >
                                  释放魔法
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-xs py-2">从上方选择法术添加后，将显示在此处。</p>
          )}
        </div>
      </div>

      {castModal.open && castModal.spell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setCastModal((m) => ({ ...m, open: false }))}>
          <div className="rounded-xl border border-white/10 bg-[#1b2738] shadow-xl max-w-sm w-full p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-dnd-gold-light font-semibold text-sm uppercase tracking-wider">释放魔法 · {castModal.spell.name}</h3>
            <div>
              <label className="block text-dnd-text-muted text-xs font-medium mb-1.5">用几环施法（升环施法）</label>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 - castModal.spellLevel }, (_, i) => castModal.spellLevel + i).map((r) => {
                  const maxR = effectiveMaxByRing[r] ?? 0
                  const rawRem = spellSlotsCurrent[r] ?? maxR
                  const rem = castSource === 'normal' ? Math.min(maxR, Math.max(0, rawRem)) : null
                  const okPoints = castSource === 'extraPoints' && extraPoints.current >= r
                  const ok = castSource === 'normal' ? (rem > 0) : okPoints
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCastRing(r)}
                      className={`min-w-[3rem] py-1.5 px-2 rounded border text-center transition-colors flex flex-col items-center justify-center ${
                        castRing === r
                          ? 'bg-dnd-gold/40 border-dnd-gold text-white'
                          : ok
                            ? 'border-gray-500 bg-gray-700/80 text-gray-200 hover:border-dnd-gold/60'
                            : 'border-gray-600 bg-gray-800/50 text-gray-500 cursor-not-allowed'
                      }`}
                      disabled={!ok}
                      title={castSource === 'normal' ? `${r}环 剩余 ${rem}/${maxR}（与法术环位条一致）` : `消耗 ${r} 点（当前 ${extraPoints.current}）`}
                    >
                      <span className="text-sm font-medium">{r}环</span>
                      {castSource === 'normal' ? (
                        <span className={`text-[10px] mt-0.5 ${rem > 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                          剩余{rem}
                        </span>
                      ) : (
                        <span className={`text-[10px] mt-0.5 ${okPoints ? 'text-gray-300' : 'text-gray-500'}`}>
                          耗{r}点
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-dnd-text-muted text-xs font-medium mb-1.5">扣除哪里的环位</label>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="castSource"
                    checked={castSource === 'normal'}
                    onChange={() => setCastSource('normal')}
                    className="rounded border-gray-500 text-dnd-red focus:ring-dnd-red"
                  />
                  <span className="text-sm text-gray-300">常规环位</span>
                </label>
                {extraPoints.max > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="castSource"
                      checked={castSource === 'extraPoints'}
                      onChange={() => setCastSource('extraPoints')}
                      className="rounded border-gray-500 text-dnd-red focus:ring-dnd-red"
                    />
                    <span className="text-sm text-gray-300">额外环位（点数 {extraPoints.current}/{extraPoints.max}）</span>
                  </label>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCastModal((m) => ({ ...m, open: false }))}
                className="flex-1 py-2 rounded-lg border border-gray-500 text-gray-400 hover:bg-gray-700 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (castSource === 'normal') {
                    const maxR = effectiveMaxByRing[castRing] ?? 0
                    const cur = Math.max(0, (spellSlotsCurrent[castRing] ?? maxR) - 1)
                    setSpellSlotCurrent(castRing, cur)
                  } else if (extraPoints.max > 0 && extraPoints.current >= castRing) {
                    onSave({ extraSpellSlotsPoints: { max: extraPoints.max, current: extraPoints.current - castRing } })
                  }
                  setCastModal((m) => ({ ...m, open: false }))
                }}
                disabled={
                  castSource === 'normal'
                    ? (() => {
                        const maxR = effectiveMaxByRing[castRing] ?? 0
                        const raw = spellSlotsCurrent[castRing] ?? maxR
                        return Math.min(maxR, Math.max(0, raw)) <= 0
                      })()
                    : extraPoints.current < castRing
                }
                className="flex-1 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认释放
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
