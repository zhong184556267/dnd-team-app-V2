/**
 * 角色卡（重写版 - 从简出发，不依赖 formulas）
 * 含：角色名、外观/基础、经验与等级、职业、Buff、背包、同调位。
 * 备份于恢复战斗状态之前。
 */
import { useState, useEffect, useCallback, useRef, forwardRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, Trash2, Star } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getCharacter, updateCharacter } from '../lib/characterStore'
import { levelFromXP } from '../lib/xp5e'
import {
  getSpellcastingLevel,
  getPactLevel,
  getPrimarySpellcastingAbility,
  ALL_CLASS_NAMES,
  isFanxingClass,
  getAvailableFeatures,
  resolveSelectedFeatures,
} from '../data/classDatabase'
import { FANXING_PRESTIGE_CLASSES } from '../data/fanxing'
import { ABILITY_NAMES_ZH } from '../data/buffTypes'
import { FEATS, FEATS_BY_CATEGORY } from '../data/feats'
import { useCombatState } from '../hooks/useCombatState'
import BuffManager from '../components/BuffManager'
import CombatStatus from '../components/CombatStatus'
import EquipmentBar from '../components/EquipmentBar'
import CharacterInventory from '../components/CharacterInventory'
import AbilityModule from '../components/AbilityModule'
import { inputClass, labelClass } from '../lib/inputStyles'

const NameInput = forwardRef(function NameInput({ value, onChange, onFocus, onBlur, onKeyDown, className }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder="未命名"
      className={className}
    />
  )
})

function AppearanceGrid({ char, canEdit, onSave }) {
  const app = char?.appearance ?? {}
  const [age, setAge] = useState(app.age ?? '')
  const [alignment, setAlignment] = useState(app.alignment ?? '')
  const [eyes, setEyes] = useState(app.eyes ?? '')
  const [height, setHeight] = useState(app.height ?? '')
  const [skin, setSkin] = useState(app.skin ?? '')
  const [background, setBackground] = useState(app.background ?? '')
  const [race, setRace] = useState(app.race ?? '')
  const [weight, setWeight] = useState(app.weight ?? '')
  const [hair, setHair] = useState(app.hair ?? '')
  useEffect(() => {
    const a = char?.appearance ?? {}
    setAge(a.age ?? '')
    setAlignment(a.alignment ?? '')
    setEyes(a.eyes ?? '')
    setHeight(a.height ?? '')
    setSkin(a.skin ?? '')
    setBackground(a.background ?? '')
    setRace(a.race ?? '')
    setWeight(a.weight ?? '')
    setHair(a.hair ?? '')
  }, [char?.id])

  const appearanceData = () => ({ age, race, alignment, height, weight, hair, eyes, skin, background })
  const save = () => onSave({ appearance: appearanceData() })

  const row1 = [
    { label: '年龄', value: age, set: setAge },
    { label: '阵营', value: alignment, set: setAlignment },
    { label: '瞳色', value: eyes, set: setEyes },
    { label: '身高', value: height, set: setHeight },
    { label: '肤色', value: skin, set: setSkin },
  ]
  const row2 = [
    { label: '背景', value: background, set: setBackground },
    { label: '种族', value: race, set: setRace },
    { label: '体重', value: weight, set: setWeight },
    { label: '发色', value: hair, set: setHair },
  ]

  const Cell = ({ label, value, set }) => (
    <div className="flex flex-col gap-0 min-w-0">
      <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-1">{label}</label>
      {canEdit ? (
        <input
          type="text"
          value={value}
          onChange={(e) => set(e.target.value)}
          onBlur={save}
          className={inputClass}
          placeholder="—"
        />
      ) : (
        <span className="text-white text-sm font-semibold truncate">{value || '—'}</span>
      )}
    </div>
  )

  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      <div className="grid grid-cols-5 gap-x-3 gap-y-3 mb-3">
        {row1.map(({ label, value, set }) => (
          <Cell key={label} label={label} value={value} set={set} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-3">
        {row2.map(({ label, value, set }) => (
          <Cell key={label} label={label} value={value} set={set} />
        ))}
      </div>
      {canEdit && <p className="text-gray-500 text-xs mt-2">点击他处即保存</p>}
    </div>
  )
}

/** 经验与等级：现有经验/经验等级；剧情等级可手动输入；LV 自动计算（经验等级≥剧情等级时显示剧情等级） */
function ExperienceLevelSection({ char, level, canEdit, onSave }) {
  const [xpInput, setXpInput] = useState('')
  const addXP = (raw) => {
    const n = Number(raw)
    if (isNaN(n) || n <= 0) return
    const next = Math.max(0, (char.xp ?? 0) + n)
    onSave({ xp: next })
    setXpInput('')
  }
  const expLevel = Math.max(1, level)
  const storyLevel = typeof char.storyLevel === 'number' && char.storyLevel >= 1 ? Math.min(20, Math.max(1, char.storyLevel)) : null
  const displayLevel = storyLevel != null && expLevel >= storyLevel ? storyLevel : expLevel
  const cardBase = 'rounded-xl border border-gray-600 bg-gray-800 p-4 flex flex-col min-h-[5rem] justify-center'
  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      <div className="space-y-3">
        {canEdit && (
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min="0"
            placeholder="经验值"
            value={xpInput}
            onChange={(e) => setXpInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addXP(e.target.value) }}
            className={inputClass + ' max-w-[12rem] font-mono'}
          />
          <button
            type="button"
            onClick={() => addXP(xpInput)}
            className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red/90 text-white font-semibold text-sm shrink-0"
          >
            加入
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('是否确定清空总经验？')) onSave({ xp: 0 })
            }}
            className="h-10 px-4 rounded-lg border border-gray-500 hover:bg-gray-700 text-white font-semibold text-sm shrink-0"
          >
            清空
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className={cardBase}>
          <p className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2">现有经验 · 经验等级{expLevel}</p>
          <p className="text-2xl font-mono font-bold text-white">{char.xp ?? 0}</p>
        </div>
        <div className={cardBase + ' bg-gradient-to-br from-gray-700 to-gray-800'}>
          {canEdit ? (
            <p className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-1 flex items-center gap-2 flex-wrap">
              <span>剧情等级</span>
              <input
                type="number"
                min={1}
                max={20}
                value={storyLevel ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1))
                  onSave({ storyLevel: v })
                }}
                placeholder="不填则按经验等级"
                className={inputClass + ' w-16 font-mono text-sm'}
              />
            </p>
          ) : (
            storyLevel != null && (
              <p className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-1">剧情等级 {storyLevel}</p>
            )
          )}
          <p className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-1">LEVEL</p>
          <p className="text-3xl font-serif text-white font-bold">lv.{displayLevel}</p>
        </div>
      </div>
      </div>
    </div>
  )
}

/** 等级步进器：上下箭头改数值，并限制在 [min, max] */
function LevelStepper({ value, onChange, min = 0, max = 20, disabled }) {
  const v = Math.max(min, Math.min(max, Number(value) || 0))
  return (
    <div className="flex items-center gap-1 rounded-lg border border-gray-600 bg-gray-800 overflow-hidden">
      <button
        type="button"
        disabled={disabled || v <= min}
        onClick={() => onChange(v - 1)}
        className="h-10 w-9 flex items-center justify-center text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      <span className="min-w-[2rem] text-center font-mono font-bold text-white text-sm">{v}</span>
      <button
        type="button"
        disabled={disabled || v >= max}
        onClick={() => onChange(v + 1)}
        className="h-10 w-9 flex items-center justify-center text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
    </div>
  )
}

/** 施法等级与契约等级（兼职/半/三分之一/契约 自动汇总） */
function ClassSpellcastingSummary({ char }) {
  const spellLevel = getSpellcastingLevel(char)
  const pactLevel = getPactLevel(char)
  const ability = getPrimarySpellcastingAbility(char)
  if (spellLevel === 0 && pactLevel === 0) return null
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {spellLevel > 0 && (
        <span className="px-3 py-1.5 rounded-lg bg-gray-700/80 text-white">
          <span className="text-dnd-gold-light font-bold">施法等级</span> {spellLevel}
          <span className="text-gray-400 text-xs ml-1">（全/半/三分之一施法合计）</span>
        </span>
      )}
      {pactLevel > 0 && (
        <span className="px-3 py-1.5 rounded-lg bg-gray-700/80 text-white">
          <span className="text-dnd-gold-light font-bold">契约等级</span> {pactLevel}
          <span className="text-gray-400 text-xs ml-1">（邪术师）</span>
        </span>
      )}
      {ability && (
        <span className="px-3 py-1.5 rounded-lg bg-gray-700/80 text-white">
          <span className="text-dnd-gold-light font-bold">施法关键属性</span> {ABILITY_NAMES_ZH[ability]}
        </span>
      )}
    </div>
  )
}

/** 职业特性 key */
function featureKey(f) {
  return f.sourceSubclass ? `${f.sourceClass}:${f.sourceSubclass}:${f.id}` : `${f.sourceClass}:${f.id}`
}

/** 职业特性：从职业库调出可选特性，在角色卡上勾选展示；已添加的显示在上方列表 */
function ClassFeaturesSection({ char, canEdit, onSave }) {
  const selected = resolveSelectedFeatures(char)
  const available = getAvailableFeatures(char)
  const selectedKeys = new Set(char?.selectedClassFeatures ?? [])
  const toAdd = available.filter((f) => !selectedKeys.has(featureKey(f)))
  const addFeature = (key) => {
    const next = [...(char?.selectedClassFeatures ?? []), key]
    onSave({ selectedClassFeatures: next })
  }
  const removeFeature = (key) => {
    const next = (char?.selectedClassFeatures ?? []).filter((k) => k !== key)
    onSave({ selectedClassFeatures: next })
  }
  if (available.length === 0 && selected.length === 0) return null
  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      <div className="space-y-3">
        <p className="text-gray-500 text-xs">根据当前职业与等级从职业库调出可选特性，可添加至下方以便查阅。</p>
      {/* 已添加的特性：优先显示在上方，添加后会出现在这里 */}
      <div>
        <p className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold mb-2">已添加</p>
        {selected.length > 0 ? (
          <ul className="space-y-2">
            {selected.map((f) => (
              <li key={f.selectedKey} className="rounded-lg border border-gray-600 bg-gray-800/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-semibold text-white">{f.name}</span>
                    <span className="text-gray-500 text-xs ml-2">{f.sourceClass}{f.sourceSubclass ? `（${f.sourceSubclass}）` : ''} · {f.level} 级</span>
                    <p className="text-gray-400 text-sm mt-1">{f.description}</p>
                  </div>
                  {canEdit && (
                    <button type="button" onClick={() => removeFeature(f.selectedKey)} className="p-1.5 rounded text-gray-500 hover:bg-red-900/30 hover:text-red-400 shrink-0" title="从角色卡移除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-xs py-2">从下方选择特性添加后，将显示在此处。</p>
        )}
      </div>
      {canEdit && toAdd.length > 0 && (
        <div>
          <p className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold mb-1">从职业库添加</p>
          <select
            className={inputClass + ' max-w-md'}
            value=""
            onChange={(e) => {
              const key = e.target.value
              if (key) { addFeature(key); e.target.value = '' }
            }}
          >
            <option value="">— 选择特性 —</option>
            {toAdd.map((f) => {
              const key = featureKey(f)
              return (
                <option key={key} value={key}>
                  {f.sourceClass}{f.sourceSubclass ? `（${f.sourceSubclass}）` : ''} · {f.name}（{f.level} 级）
                </option>
              )
            })}
          </select>
        </div>
      )}
      </div>
    </div>
  )
}

/** 专长：从专长库调出，每项可选获得等级与获得职业；先选类型再选专长，列表标出类型（星辰用星标） */
function FeatsSection({ char, canEdit, onSave }) {
  const raw = char?.selectedFeats ?? []
  const feats = raw.map((f) => {
    if (typeof f === 'string') return { featId: f, level: 1, sourceClass: '' }
    return {
      featId: f.featId ?? f.id ?? '',
      level: Math.max(1, Math.min(20, Number(f.level) ?? 1)),
      sourceClass: f.sourceClass ?? '',
    }
  })
  const featById = new Map(FEATS.map((x) => [x.id, x]))
  const [selectedCategory, setSelectedCategory] = useState('')
  const categoryList = Object.keys(FEATS_BY_CATEGORY)
  const featsInCategory = selectedCategory ? (FEATS_BY_CATEGORY[selectedCategory] ?? []) : []
  const alreadyIds = new Set(feats.map((f) => f.featId))
  const toAddInCategory = featsInCategory.filter((x) => !alreadyIds.has(x.id))

  const addFeat = (featId) => {
    if (!featId) return
    const next = [...feats, { featId, level: 1, sourceClass: char?.['class'] ?? '' }]
    onSave({ selectedFeats: next })
    setSelectedCategory('')
  }
  const updateFeat = (index, field, value) => {
    const next = feats.map((item, i) =>
      i !== index ? item : { ...item, [field]: field === 'level' ? Math.max(1, Math.min(20, Number(value) || 1)) : value }
    )
    onSave({ selectedFeats: next })
  }
  const removeFeat = (index) => {
    const next = feats.filter((_, i) => i !== index)
    onSave({ selectedFeats: next })
  }
  const selectClass = 'h-9 rounded-lg bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-white text-xs px-2 min-w-0'

  const FeatTypeTag = ({ category }) => {
    if (!category) return null
    if (category === '星辰专长') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
          <Star className="w-3 h-3 fill-current" />
          星辰
        </span>
      )
    }
    return (
      <span className="text-gray-500 text-[10px]">{category}</span>
    )
  }

  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      {canEdit && (
        <div className="mb-3 space-y-2">
          <p className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold mb-1">从专长库添加</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="min-w-0">
              <label className="text-gray-500 text-[10px] block mb-0.5">专长类型</label>
              <select
                className={inputClass + ' text-sm'}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">— 先选类型 —</option>
                {categoryList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === '星辰专长' ? '★ 星辰专长' : cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1">
              <label className="text-gray-500 text-[10px] block mb-0.5">具体专长</label>
              <select
                className={inputClass + ' text-sm'}
                value=""
                disabled={!selectedCategory || toAddInCategory.length === 0}
                onChange={(e) => {
                  const id = e.target.value
                  if (id) { addFeat(id); e.target.value = '' }
                }}
              >
                <option value="">
                  {!selectedCategory ? '— 请先选类型 —' : toAddInCategory.length === 0 ? '— 该类型已选完 —' : '— 选择专长 —'}
                </option>
                {toAddInCategory.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
      {feats.length > 0 ? (
        <ul className="space-y-2">
          {feats.map((item, i) => {
            const feat = featById.get(item.featId)
            const name = feat?.name ?? item.featId
            const category = feat?.category
            return (
              <li key={`${item.featId}-${i}`} className="rounded-lg border border-gray-600 bg-gray-800/50 p-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{name}</span>
                    <FeatTypeTag category={category} />
                  </div>
                  {canEdit && (
                    <button type="button" onClick={() => removeFeat(i)} className="p-1 text-gray-500 hover:text-dnd-red" title="移除">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {feat?.description && (
                  <p className="text-gray-400 text-xs mt-1 whitespace-pre-line leading-relaxed">{feat.description}</p>
                )}
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <div className="flex items-center gap-1">
                      <label className="text-gray-500 text-[10px]">等级</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={item.level}
                        onChange={(e) => updateFeat(i, 'level', e.target.value)}
                        className={selectClass + ' w-14 font-mono'}
                      />
                    </div>
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <label className="text-gray-500 text-[10px] shrink-0">获得职业</label>
                      <select
                        value={item.sourceClass}
                        onChange={(e) => updateFeat(i, 'sourceClass', e.target.value)}
                        className={selectClass + ' flex-1 max-w-[8rem]'}
                      >
                        <option value="">—</option>
                        {ALL_CLASS_NAMES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs mt-1">
                    {item.level} 级 · {item.sourceClass || '—'}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-gray-500 text-xs py-2">从上方选择专长添加后，将显示在此处。</p>
      )}
    </div>
  )
}

/** 职业：起始职业、兼职、进阶、施法等级汇总、职业特性（等级上限由经验等级决定） */
function ClassSection({ char, level, canEdit, onSave }) {
  const maxLevel = Math.max(1, level)
  const [classVal, setClassVal] = useState(char?.['class'] ?? '')
  const [subclass, setSubclass] = useState(char?.subclass ?? '')
  const [classLevel, setClassLevel] = useState(() => {
    const v = char?.classLevel ?? 1
    return typeof v === 'number' ? Math.max(1, Math.min(20, v)) : 1
  })
  const [multiclass, setMulticlass] = useState(() => {
    const raw = char?.multiclass
    if (Array.isArray(raw)) return raw.map((m) => ({ 'class': m?.['class'] ?? '', subclass: m?.subclass ?? '', level: Math.max(0, Math.min(20, Number(m?.level) ?? 0)) }))
    return []
  })
  const [prestige, setPrestige] = useState(() => {
    if (Array.isArray(char?.prestige)) return char.prestige.map((p) => ({ 'class': p?.['class'] ?? '', level: Math.max(0, Math.min(20, Number(p?.level) ?? 0)) }))
    if (char?.prestigeClass) return [{ 'class': char.prestigeClass, level: Math.max(0, Math.min(20, Number(char.prestigeLevel) ?? 0)) }]
    return []
  })
  useEffect(() => {
    setClassVal(char?.['class'] ?? '')
    setSubclass(char?.subclass ?? '')
    setClassLevel(typeof char?.classLevel === 'number' ? Math.max(1, Math.min(20, char.classLevel)) : 1)
    const raw = char?.multiclass
    setMulticlass(Array.isArray(raw) ? raw.map((m) => ({ 'class': m?.['class'] ?? '', subclass: m?.subclass ?? '', level: Math.max(0, Math.min(20, Number(m?.level) ?? 0)) })) : [])
    if (Array.isArray(char?.prestige)) setPrestige(char.prestige.map((p) => ({ 'class': p?.['class'] ?? '', level: Math.max(0, Math.min(20, Number(p?.level) ?? 0)) })))
    else if (char?.prestigeClass) setPrestige([{ 'class': char.prestigeClass, level: Math.max(0, Math.min(20, Number(char.prestigeLevel) ?? 0)) }])
    else setPrestige([])
  }, [char?.id])
  const prestigeLevelSum = prestige.reduce((s, p) => s + (p.level || 0), 0)
  const totalClassLevels = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
  const overCap = totalClassLevels > maxLevel

  const persistClass = (patch) => {
    onSave({
      'class': patch['class'] !== undefined ? patch['class'] : classVal,
      subclass: patch.subclass !== undefined ? patch.subclass : subclass,
      classLevel: patch.classLevel !== undefined ? patch.classLevel : classLevel,
      multiclass: patch.multiclass !== undefined ? patch.multiclass : multiclass,
      prestige: patch.prestige !== undefined ? patch.prestige : prestige,
    })
  }

  const setMainLevel = (n) => {
    const v = Math.max(1, Math.min(maxLevel, n))
    const other = multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
    const clamped = Math.min(v, Math.max(0, maxLevel - other))
    setClassLevel(clamped)
    persistClass({ classLevel: clamped })
  }

  const setMulticlassRow = (index, field, value) => {
    let next = multiclass.map((m, i) => (i !== index ? m : { ...m, [field]: value }))
    if (field === 'level') {
      const v = Math.max(0, Math.min(maxLevel, Number(value) ?? 0))
      const other = classLevel + next.filter((_, i) => i !== index).reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
      next[index] = { ...next[index], level: Math.min(v, Math.max(0, maxLevel - other)) }
    }
    setMulticlass(next)
    persistClass({ multiclass: next })
  }

  const addMulticlassRow = () => {
    if (totalClassLevels >= maxLevel) return
    const next = [...multiclass, { 'class': '', level: 0 }]
    setMulticlass(next)
    persistClass({ multiclass: next })
  }

  const removeMulticlassRow = (index) => {
    const next = multiclass.filter((_, i) => i !== index)
    setMulticlass(next)
    persistClass({ multiclass: next })
  }

  const setPrestigeRow = (index, field, value) => {
    let next = prestige.map((p, i) => (i !== index ? p : { ...p, [field]: value }))
    if (field === 'level') {
      const v = Math.max(0, Math.min(maxLevel, Number(value) ?? 0))
      const other = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + next.filter((_, i) => i !== index).reduce((s, p) => s + (p.level || 0), 0)
      next[index] = { ...next[index], level: Math.min(v, Math.max(0, maxLevel - other)) }
    }
    setPrestige(next)
    persistClass({ prestige: next })
  }

  const addPrestigeRow = () => {
    if (totalClassLevels >= maxLevel) return
    const next = [...prestige, { 'class': '', level: 0 }]
    setPrestige(next)
    persistClass({ prestige: next })
  }

  const removePrestigeRow = (index) => {
    const next = prestige.filter((_, i) => i !== index)
    setPrestige(next)
    persistClass({ prestige: next })
  }

  const selectClass = 'h-10 rounded-lg bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red disabled:opacity-70 px-3 text-sm text-white min-w-[7rem]'
  const cardBase = 'rounded-xl border border-gray-600 bg-gray-800 p-4 flex flex-col min-h-[4rem]'

  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      <div className="space-y-4">
        <ClassSpellcastingSummary char={char} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={cardBase}>
          <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2 block">起始职业</label>
          {canEdit ? (
            <div className="space-y-2">
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  value={classVal}
                  onChange={(e) => { setClassVal(e.target.value); persistClass({ 'class': e.target.value }) }}
                  className={selectClass}
                >
                  <option value="">—</option>
                  {ALL_CLASS_NAMES.map((c) => (
                    <option key={c} value={c}>{isFanxingClass(c) ? `★ ${c}` : c}</option>
                  ))}
                </select>
                <LevelStepper
                  value={classLevel}
                  onChange={setMainLevel}
                  min={1}
                  max={Math.max(1, maxLevel - multiclass.reduce((s, m) => s + (m.level || 0), 0) - prestigeLevelSum)}
                  disabled={!classVal}
                />
              </div>
              <div>
                <label className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold mb-1 block">子职（选填）</label>
                <input
                  type="text"
                  value={subclass}
                  onChange={(e) => { setSubclass(e.target.value); persistClass({ subclass: e.target.value.trim() }) }}
                  onBlur={(e) => persistClass({ subclass: e.target.value.trim() })}
                  placeholder="如：学识学院、狂战士"
                  className={inputClass}
                />
              </div>
            </div>
          ) : (
            <p className="text-white font-semibold text-sm">
              {char?.['class'] ? `${char['class']}${char.subclass ? `（${char.subclass}）` : ''} ${char.classLevel ?? 1}` : '—'}
            </p>
          )}
        </div>
        <div className={cardBase}>
          <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2 block">兼职</label>
          {canEdit ? (
            <div className="space-y-2">
              {multiclass.map((m, i) => {
                const otherLevels = classLevel + multiclass.reduce((s, x, j) => s + (j === i ? 0 : (x.level || 0)), 0) + prestigeLevelSum
                const rowMax = Math.max(0, maxLevel - otherLevels)
                return (
                  <div key={i} className="space-y-2 border border-gray-600 rounded-lg p-2 bg-gray-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold">兼职（选填）</span>
                      <button type="button" onClick={() => removeMulticlassRow(i)} className="p-1 text-gray-500 hover:text-dnd-red" title="移除"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <select value={m['class']} onChange={(e) => setMulticlassRow(i, 'class', e.target.value)} className={selectClass}>
                        <option value="">—</option>
                        {ALL_CLASS_NAMES.filter((c) => c !== classVal).map((c) => (
                          <option key={c} value={c}>{isFanxingClass(c) ? `★ ${c}` : c}</option>
                        ))}
                      </select>
                      <LevelStepper value={m.level} onChange={(n) => setMulticlassRow(i, 'level', n)} min={0} max={rowMax} disabled={!m['class']} />
                    </div>
                    <input
                      type="text"
                      value={m.subclass ?? ''}
                      onChange={(e) => setMulticlassRow(i, 'subclass', e.target.value)}
                      onBlur={(e) => setMulticlassRow(i, 'subclass', e.target.value.trim())}
                      placeholder="子职（选填）"
                      className={inputClass + ' text-xs'}
                    />
                  </div>
                )
              })}
              <button type="button" onClick={addMulticlassRow} disabled={totalClassLevels >= maxLevel} className="text-white text-xs font-bold uppercase tracking-wider hover:underline disabled:opacity-50">+ 添加兼职</button>
            </div>
          ) : (
            <p className="text-white text-sm">
              {Array.isArray(char?.multiclass) && char.multiclass.length ? char.multiclass.map((m) => `${m['class'] || '?'}${m.subclass ? `（${m.subclass}）` : ''} ${m.level ?? 0}`).join(' / ') : '—'}
            </p>
          )}
        </div>
        <div className={cardBase}>
          <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2 block">进阶</label>
          {canEdit ? (
            <div className="space-y-2">
              {prestige.map((p, i) => {
                const otherLevels = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestige.reduce((s, x, j) => s + (j === i ? 0 : (x.level || 0)), 0)
                const rowMax = Math.max(0, maxLevel - otherLevels)
                return (
                  <div key={i} className="space-y-2 border border-gray-600 rounded-lg p-2 bg-gray-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold">进阶（选填）</span>
                      <button type="button" onClick={() => removePrestigeRow(i)} className="p-1 text-gray-500 hover:text-dnd-red" title="移除"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <select value={p['class']} onChange={(e) => setPrestigeRow(i, 'class', e.target.value)} className={selectClass}>
                        <option value="">— 选择 —</option>
                        {FANXING_PRESTIGE_CLASSES.map((c) => (
                          <option key={c} value={c}>★ {c}</option>
                        ))}
                      </select>
                      <LevelStepper value={p.level} onChange={(n) => setPrestigeRow(i, 'level', n)} min={0} max={rowMax} disabled={!p['class']} />
                    </div>
                  </div>
                )
              })}
              <button type="button" onClick={addPrestigeRow} disabled={totalClassLevels >= maxLevel} className="text-white text-xs font-bold uppercase tracking-wider hover:underline disabled:opacity-50">+ 添加进阶</button>
            </div>
          ) : (
            <p className="text-white text-sm">
              {Array.isArray(char?.prestige) && char.prestige.length ? char.prestige.map((p) => `${p['class'] || '?'} ${p.level || 0}`).join(' / ') : char?.prestigeClass ? `${char.prestigeClass} ${char.prestigeLevel ?? 0}` : '—'}
            </p>
          )}
        </div>
      </div>
      {overCap && (
          <p className="text-dnd-red text-xs font-bold">职业等级总和 ({totalClassLevels}) 已超过表定等级 ({maxLevel})，请调低各职业等级。</p>
        )}
      </div>
    </div>
  )
}

function noop() {}

export default function CharacterSheet() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const [char, setChar] = useState(null)
  const [editingName, setEditingName] = useState(null)
  const nameInputRef = useRef(null)
  const level = char ? levelFromXP(char.xp) : 0
  const spellLevel = char ? getSpellcastingLevel(char) : 0
  const combatState = useCombatState(char)
  const canEdit = isAdmin || char?.owner === user?.name

  useEffect(() => {
    if (!id || id === 'new') return
    setChar(getCharacter(id))
  }, [id])
  useEffect(() => {
    setEditingName(null)
  }, [char?.id])

  const persist = useCallback((patch) => {
    if (!char?.id) return null
    const updated = updateCharacter(char.id, patch)
    if (updated) setChar(updated)
    return updated
  }, [char?.id])

  if (!char && id && id !== 'new') {
    return (
      <div className="p-4 pb-24 min-h-screen">
        <p className="text-dnd-text-muted">未找到该角色。</p>
        <Link to="/characters" className="text-dnd-red mt-2 inline-block">返回列表</Link>
      </div>
    )
  }

  return (
    <div className="p-4 pb-24 min-h-screen">
      <Link to="/characters" className="text-dnd-red">← 返回角色列表</Link>
      <p className="text-white mt-4 text-sm text-gray-400">角色卡 id: {id}</p>
      {char ? (
        <>
          <section className="mt-4 w-full flex flex-col items-stretch">
            <label className={labelClass + ' text-center'}>角色名</label>
            {canEdit ? (
              <NameInput
                ref={nameInputRef}
                value={editingName !== null ? editingName : (char.name ?? '')}
                onChange={(e) => setEditingName(e.target.value)}
                onFocus={() => { if (editingName === null) setEditingName(char.name ?? '') }}
                onBlur={() => {
                  const value = (editingName ?? char.name ?? '').trim() || '未命名'
                  persist({ name: value })
                  setEditingName(null)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                className={inputClass + ' font-bold text-2xl text-center w-full'}
              />
            ) : (
              <p className="text-2xl font-bold text-white text-center w-full">{char.name || '未命名'}</p>
            )}
          </section>
          <section className="mt-4">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">外观 / 基础</h3>
            <AppearanceGrid char={char} canEdit={canEdit} onSave={persist} />
          </section>
          <section className="mt-4">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">经验与等级</h3>
            <ExperienceLevelSection char={char} level={level} canEdit={canEdit} onSave={persist} />
          </section>
          <section className="mt-6">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">职业</h3>
            <ClassSection char={char} level={level} canEdit={canEdit} onSave={persist} />
          </section>
          <section className="mt-6">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">属性与技能</h3>
            <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
              <AbilityModule
                char={char}
                abilities={char.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }}
                buffStats={{}}
                level={level}
                canEdit={canEdit}
                onSave={persist}
              />
            </div>
          </section>
          <section className="mt-6">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">Buff / 状态</h3>
            <BuffManager buffs={char.buffs} baseAbilities={char.abilities ?? {}} onSave={(buffsList) => persist({ buffs: buffsList })} canEdit={canEdit} />
          </section>
          <section className="mt-6">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">战斗状态</h3>
            <CombatStatus
              char={char}
              hp={char.hp ?? { current: 0, max: 0, temp: 0 }}
              abilities={char.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }}
              level={level}
              canEdit={canEdit}
              onSave={persist}
            />
          </section>
          <section className="mt-6">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">身穿装备</h3>
            <EquipmentBar character={char} canEdit={canEdit} onSave={persist} />
          </section>
          <section className="mt-6">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">背包</h3>
            <CharacterInventory character={char} canEdit={canEdit} onSave={persist} onWalletSuccess={noop} />
          </section>
          <section className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-3 min-w-0">
                <h3 className="text-dnd-gold-light text-sm font-bold mb-2">职业特性</h3>
                <ClassFeaturesSection char={char} canEdit={canEdit} onSave={persist} />
              </div>
              <div className="md:col-span-2 min-w-0">
                <h3 className="text-dnd-gold-light text-sm font-bold mb-2">专长</h3>
                <FeatsSection char={char} canEdit={canEdit} onSave={persist} />
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
