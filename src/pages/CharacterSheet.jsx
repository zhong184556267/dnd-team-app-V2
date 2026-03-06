import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { User, Plus, ChevronUp, ChevronDown, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getCharacter, updateCharacter, deleteCharacter } from '../lib/characterStore'
import { abilityModifier, proficiencyBonus, getArmorInfo, ARMOR_TYPES } from '../lib/formulas'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { levelFromXP } from '../lib/xp5e'
import { FANXING_PRESTIGE_CLASSES } from '../data/fanxing'
import { SAVE_NAMES, SKILLS, SKILL_PROF_OPTIONS, skillProfFactor } from '../data/dndSkills'
import AbilityModule from '../components/AbilityModule'
import BuffManager from '../components/BuffManager'
import CombatStatus from '../components/CombatStatus'
import { useRoll } from '../contexts/RollContext'
import { WEAPON_DATABASE, getWeaponById, rollDice } from '../data/weaponDatabase'
import { getItemList, getItemById, getItemDisplayName } from '../data/itemDatabase'

/* D&D Beyond 深色沉浸式：标签金色、输入深灰、聚焦红 */
const labelClass = 'block text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2'
const inputClass = 'h-12 w-full rounded-lg bg-gray-800 text-white border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500 disabled:opacity-70 px-3'
const inputClassCompact = 'h-12 min-w-0 rounded-lg bg-gray-800 text-white border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500 disabled:opacity-70 px-3'

/** D&D 5e 核心职业（PHB） */
const DND_CLASSES = ['野蛮人', '吟游诗人', '牧师', '德鲁伊', '战士', '武僧', '圣武士', '游侠', '游荡者', '术士', '邪术师', '法师']

export default function CharacterSheet() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [char, setChar] = useState(null)
  const [saving, setSaving] = useState(false)

  const isNew = id === 'new'
  const canEdit = isAdmin || char?.owner === user?.name

  useEffect(() => {
    if (isNew) return
    setChar(getCharacter(id))
  }, [id, isNew])

  const persist = useCallback((patch) => {
    if (!char?.id) return
    setSaving(true)
    const updated = updateCharacter(char.id, patch)
    if (updated) setChar(updated)
    setSaving(false)
  }, [char?.id])

  const buffStats = useBuffCalculator(char, char?.buffs)

  if (!isNew && !char) {
    return (
      <div className="p-4 pb-24 bg-dnd-bg">
        <p className="text-dnd-text-muted">未找到该角色。</p>
        <Link to="/characters" className="text-dnd-red mt-2 inline-block font-medium">返回列表</Link>
      </div>
    )
  }

  if (isNew) return null

  const level = levelFromXP(char.xp)
  const hp = char.hp || { current: 0, max: 0, temp: 0 }
  const abilities = char.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  const appearance = char.appearance || {}

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <div className="flex items-center justify-between mb-4">
        <Link to="/characters" className="text-dnd-red text-sm font-medium">← 列表</Link>
        <span className="text-dnd-text-muted text-sm">
          {saving ? '保存中…' : '已自动保存'}
        </span>
      </div>
      <h1 className="font-display text-xl font-semibold text-white mb-6">
        {char.name || '未命名'}
      </h1>

      <section className="mb-8">
        <div className="rounded-xl bg-dnd-card p-6">
          <h2 className={labelClass}>基础信息</h2>
          <BaseTab char={char} appearance={appearance} canEdit={canEdit} onSave={persist} />
        </div>
      </section>
      <section className="mb-8">
        <div className="rounded-xl bg-dnd-card p-6">
          <h2 className={labelClass}>职业与经验</h2>
          <ClassTab char={char} level={level} canEdit={canEdit} onSave={persist} />
        </div>
      </section>
      <section className="mb-8">
        <div className="rounded-xl bg-dnd-card p-6">
          <h2 className={labelClass}>属性与技能</h2>
          <AbilitiesTab char={char} abilities={abilities} buffStats={buffStats} level={level} canEdit={canEdit} onSave={persist} />
        </div>
      </section>
      <section className="mb-8">
        <div className="rounded-xl bg-dnd-card p-6">
          <h2 className={labelClass}>增益 / 减值</h2>
          <BuffManager
            buffs={char.buffs}
            baseAbilities={char.abilities ?? {}}
            onSave={(buffs) => persist({ buffs })}
            canEdit={canEdit}
          />
        </div>
      </section>
      <section className="mb-8">
        <div className="rounded-xl bg-dnd-card p-6">
          <h2 className={labelClass}>战斗状态</h2>
          <CombatStatus char={char} hp={hp} abilities={abilities} level={level} canEdit={canEdit} onSave={persist} />
        </div>
      </section>
      <section className="mb-8">
        <div className="rounded-xl bg-dnd-card p-6">
          <h2 className={labelClass}>装备与攻击</h2>
          <EquipmentTab char={char} level={level} buffStats={buffStats} canEdit={canEdit} onSave={persist} />
        </div>
      </section>
      <section className="mb-8">
        <div className="rounded-xl bg-dnd-card p-6">
          <h2 className={labelClass}>日志</h2>
          <NotesTab char={char} canEdit={canEdit} onSave={persist} />
        </div>
      </section>

      {canEdit && (
        <div className="mt-8 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              if (confirm('确定删除这张角色卡？')) {
                deleteCharacter(char.id)
                navigate('/characters', { replace: true })
              }
            }}
            className="text-dnd-red text-sm font-medium"
          >
            删除角色卡
          </button>
        </div>
      )}
    </div>
  )
}

function BaseTab({ char, appearance, canEdit, onSave }) {
  const [avatar, setAvatar] = useState(char.avatar)
  const [name, setName] = useState(char.name)
  const [age, setAge] = useState(appearance.age ?? '')
  const [race, setRace] = useState(appearance.race ?? '')
  const [alignment, setAlignment] = useState(appearance.alignment ?? '')
  const [height, setHeight] = useState(appearance.height ?? '')
  const [weight, setWeight] = useState(appearance.weight ?? '')
  const [hair, setHair] = useState(appearance.hair ?? '')
  const [eyes, setEyes] = useState(appearance.eyes ?? '')
  const [skin, setSkin] = useState(appearance.skin ?? '')
  const [background, setBackground] = useState(appearance.background ?? '')

  const appearanceData = () => ({ age, race, alignment, height, weight, hair, eyes, skin, background })

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAvatar(reader.result)
      onSave({ avatar: reader.result, appearance: appearanceData() })
    }
    reader.readAsDataURL(file)
  }

  const saveBase = () => onSave({ name: name.trim() || char.name, appearance: appearanceData() })

  const inp = 'h-10 min-w-0 w-full rounded-lg bg-gray-800 text-white border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500 disabled:opacity-70 px-2 text-sm'
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
        <input type="text" value={value} onChange={(e) => set(e.target.value)} onBlur={saveBase} className={inp} placeholder="—" />
      ) : (
        <span className="text-white text-sm font-semibold truncate">{value || '—'}</span>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="shrink-0 w-[80px] h-[80px] rounded-full bg-gray-800 border-2 border-dnd-gold overflow-hidden cursor-pointer flex items-center justify-center">
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-gray-500" />}
          {canEdit && <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />}
        </label>
        <div className="min-w-0 flex-1">
          <label className={labelClass}>角色名</label>
          {canEdit ? (
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveBase} placeholder="角色名" className={inputClass + ' font-bold text-base'} />
          ) : (
            <p className="text-lg font-bold text-white truncate pt-2">{char.name || '—'}</p>
          )}
        </div>
      </div>
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
      </div>
      {canEdit && <p className="text-gray-500 text-xs">点击他处即保存</p>}
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
        className="h-12 w-10 flex items-center justify-center text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronDown className="w-5 h-5" />
      </button>
      <span className="min-w-[2rem] text-center font-mono font-bold text-white text-lg">{v}</span>
      <button
        type="button"
        disabled={disabled || v >= max}
        onClick={() => onChange(v + 1)}
        className="h-12 w-10 flex items-center justify-center text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronUp className="w-5 h-5" />
      </button>
    </div>
  )
}

function ClassTab({ char, level, canEdit, onSave }) {
  const maxLevel = Math.max(1, level)
  const [classVal, setClassVal] = useState(char.class ?? '')
  const [subclass, setSubclass] = useState(char.subclass ?? '')
  const [classLevel, setClassLevel] = useState(() => {
    const v = char.classLevel ?? 1
    return typeof v === 'number' ? Math.max(1, Math.min(20, v)) : 1
  })
  const [multiclass, setMulticlass] = useState(() => {
    const raw = char.multiclass
    if (Array.isArray(raw)) return raw.map((m) => ({ class: m?.class ?? '', subclass: m?.subclass ?? '', level: Math.max(0, Math.min(20, Number(m?.level) ?? 0)) }))
    return []
  })
  const [prestige, setPrestige] = useState(() => {
    if (Array.isArray(char.prestige)) return char.prestige.map((p) => ({ class: p?.class ?? '', level: Math.max(0, Math.min(20, Number(p?.level) ?? 0)) }))
    if (char.prestigeClass) return [{ class: char.prestigeClass, level: Math.max(0, Math.min(20, Number(char.prestigeLevel) ?? 0)) }]
    return []
  })

  const prestigeLevelSum = prestige.reduce((s, p) => s + (p.level || 0), 0)
  const totalClassLevels = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
  const overCap = totalClassLevels > maxLevel

  const [xpInput, setXpInput] = useState('')

  const addXP = (delta) => {
    const n = Number(delta)
    if (isNaN(n) || n <= 0) return
    const next = Math.max(0, (char.xp ?? 0) + n)
    onSave({ xp: next })
    setXpInput('')
  }

  const persistClass = (patch) => {
    const payload = {
      class: patch.class !== undefined ? patch.class : classVal,
      subclass: patch.subclass !== undefined ? patch.subclass : subclass,
      classLevel: patch.classLevel !== undefined ? patch.classLevel : classLevel,
      multiclass: patch.multiclass !== undefined ? patch.multiclass : multiclass,
      prestige: patch.prestige !== undefined ? patch.prestige : prestige,
    }
    onSave(payload)
  }

  const setMainLevel = (n) => {
    const v = Math.max(1, Math.min(maxLevel, n))
    const other = multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
    const clamped = Math.min(v, maxLevel - other)
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
    const other = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
    if (other >= maxLevel) return
    const next = [...multiclass, { class: '', level: 0 }]
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
    const other = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
    if (other >= maxLevel) return
    const next = [...prestige, { class: '', level: 0 }]
    setPrestige(next)
    persistClass({ prestige: next })
  }

  const removePrestigeRow = (index) => {
    const next = prestige.filter((_, i) => i !== index)
    setPrestige(next)
    persistClass({ prestige: next })
  }

  const selectClass = 'h-12 rounded-lg bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red disabled:opacity-70 px-3 font-semibold'
  const selectStyle = { color: '#fff', minWidth: '7rem' }
  const cardBase = 'rounded-xl border border-gray-600 bg-gray-800 p-4 flex flex-col min-h-[5rem]'

  return (
    <div className="space-y-4">
      {/* 顶部：经验值输入 + 加入按钮 */}
      {canEdit && (
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min="0"
            placeholder="经验值"
            value={xpInput}
            onChange={(e) => setXpInput(e.target.value)}
            className="h-12 flex-1 max-w-[12rem] rounded-xl bg-gray-800 text-white border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500 font-mono px-4"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addXP(e.target.value)
              }
            }}
          />
          <button
            type="button"
            onClick={() => addXP(xpInput)}
            className="h-12 w-12 shrink-0 rounded-xl border border-white/40 text-white hover:bg-white/10 flex items-center justify-center transition-colors"
            title="加入"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      )}
      <p className="text-gray-500 text-xs">经验可溢出；升级除经验外也需剧情推进。职业等级总和 ≤ 表定等级。</p>

      {/* 第二行：现有经验 可升等级X | LEVEL 两张大卡片 */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`${cardBase} justify-center`}>
          <p className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2">现有经验 可升等级{maxLevel}</p>
          <p className="text-2xl font-mono font-bold text-white">{char.xp ?? 0}</p>
        </div>
        <div className="rounded-xl border border-gray-600 bg-gradient-to-br from-gray-700 to-gray-800 p-4 flex flex-col justify-center">
          <p className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-1">LEVEL</p>
          <p className="text-3xl font-serif text-white font-bold">lv.{maxLevel}</p>
        </div>
      </div>

      {/* 第三行：起始职业 | 兼职 | 进阶 三张等宽卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={cardBase}>
          <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-3 block">起始职业</label>
          {canEdit ? (
            <div className="space-y-2">
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  value={classVal}
                  onChange={(e) => { setClassVal(e.target.value); persistClass({ class: e.target.value }) }}
                  className={`${selectClass} flex-1 text-white min-w-[7rem]`}
                  style={selectStyle}
                >
                  <option value="">—</option>
                  {DND_CLASSES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="shrink-0">
                  <LevelStepper
                    value={classLevel}
                    onChange={setMainLevel}
                    min={1}
                    max={Math.max(1, maxLevel - multiclass.reduce((s, m) => s + (m.level || 0), 0) - prestigeLevelSum)}
                    disabled={!classVal}
                  />
                </div>
              </div>
              <div>
                <label className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold mb-1 block">子职（选填）</label>
                <input
                  type="text"
                  value={subclass}
                  onChange={(e) => { setSubclass(e.target.value); persistClass({ subclass: e.target.value.trim() }) }}
                  onBlur={(e) => persistClass({ subclass: e.target.value.trim() })}
                  placeholder="如：学识学院、狂战士"
                  className="h-10 w-full rounded-lg bg-gray-800 text-white border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500 px-3 text-sm"
                />
              </div>
            </div>
          ) : (
            <p className="text-white font-semibold">
              {char.class ? `${char.class}${char.subclass ? `（${char.subclass}）` : ''} ${char.classLevel ?? 1}` : '—'}
            </p>
          )}
        </div>

        <div className={cardBase}>
          <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-3 block">兼职</label>
          {canEdit ? (
            <div className="space-y-3">
              {multiclass.map((m, i) => {
                const otherLevels = classLevel + multiclass.reduce((s, x, j) => s + (j === i ? 0 : (x.level || 0)), 0) + prestigeLevelSum
                const rowMax = Math.max(0, maxLevel - otherLevels)
                return (
                  <div key={i} className="space-y-2 border border-gray-600 rounded-lg p-3 bg-gray-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold">兼职（选填）</span>
                      <button type="button" onClick={() => removeMulticlassRow(i)} className="p-1.5 text-gray-500 hover:text-dnd-red" title="移除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <select
                        value={m.class}
                        onChange={(e) => setMulticlassRow(i, 'class', e.target.value)}
                        className={`${selectClass} flex-1 text-white min-w-[7rem]`}
                        style={selectStyle}
                      >
                        <option value="">—</option>
                        {DND_CLASSES.filter((c) => c !== classVal).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <div className="shrink-0">
                        <LevelStepper value={m.level} onChange={(n) => setMulticlassRow(i, 'level', n)} min={0} max={rowMax} disabled={!m.class} />
                      </div>
                    </div>
                    <div>
                      <label className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold mb-1 block">子职（选填）</label>
                      <input
                        type="text"
                        value={m.subclass ?? ''}
                        onChange={(e) => setMulticlassRow(i, 'subclass', e.target.value)}
                        onBlur={(e) => setMulticlassRow(i, 'subclass', e.target.value.trim())}
                        placeholder="如：学识学院、狂战士"
                        className="h-10 w-full rounded-lg bg-gray-800 text-white border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500 px-3 text-sm"
                      />
                    </div>
                  </div>
                )
              })}
              <button
                type="button"
                onClick={addMulticlassRow}
                disabled={totalClassLevels >= maxLevel}
                className="text-white text-xs font-bold uppercase tracking-wider hover:underline disabled:opacity-50"
              >
                + 添加兼职
              </button>
            </div>
          ) : (
            <p className="text-white text-sm">
              {Array.isArray(char.multiclass) && char.multiclass.length
                ? char.multiclass.map((m) => `${m.class || '?'}${m.subclass ? `（${m.subclass}）` : ''} ${m.level ?? 0}`).join(' / ')
                : '—'}
            </p>
          )}
        </div>

        <div className={cardBase}>
          <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-3 block">进阶</label>
          {canEdit ? (
            <div className="space-y-3">
              {prestige.map((p, i) => {
                const otherLevels = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestige.reduce((s, x, j) => s + (j === i ? 0 : (x.level || 0)), 0)
                const rowMax = Math.max(0, maxLevel - otherLevels)
                return (
                  <div key={i} className="space-y-2 border border-gray-600 rounded-lg p-3 bg-gray-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold">进阶（选填）</span>
                      <button type="button" onClick={() => removePrestigeRow(i)} className="p-1.5 text-gray-500 hover:text-dnd-red" title="移除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <select
                        value={p.class}
                        onChange={(e) => setPrestigeRow(i, 'class', e.target.value)}
                        className={`${selectClass} flex-1 text-white min-w-[7rem]`}
                        style={selectStyle}
                      >
                        <option value="">— 选择 —</option>
                        {FANXING_PRESTIGE_CLASSES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <div className="shrink-0">
                        <LevelStepper value={p.level} onChange={(n) => setPrestigeRow(i, 'level', n)} min={0} max={rowMax} disabled={!p.class} />
                      </div>
                    </div>
                  </div>
                )
              })}
              <button
                type="button"
                onClick={addPrestigeRow}
                disabled={totalClassLevels >= maxLevel}
                className="text-white text-xs font-bold uppercase tracking-wider hover:underline disabled:opacity-50"
              >
                + 添加进阶
              </button>
            </div>
          ) : (
            <p className="text-white text-sm">
              {Array.isArray(char.prestige) && char.prestige.length
                ? char.prestige.map((p) => `${p.class || '?'} ${p.level || 0}`).join(' / ')
                : char.prestigeClass
                  ? `${char.prestigeClass} ${char.prestigeLevel ?? 0}`
                  : '—'}
            </p>
          )}
        </div>
      </div>

      {overCap && (
        <p className="text-dnd-red text-xs font-bold">职业等级总和 ({totalClassLevels}) 已超过表定等级 ({maxLevel})，请调低各职业等级。</p>
      )}
    </div>
  )
}

function AbilitiesTab({ char, abilities, buffStats, level, canEdit, onSave }) {
  return (
    <AbilityModule
      char={char}
      abilities={abilities}
      buffStats={buffStats}
      level={level}
      canEdit={canEdit}
      onSave={onSave}
    />
  )
}

const WEAPON_SLOT_KEYS = ['mainHand', 'offHand', 'backup1', 'backup2', 'backup3', 'backup4']
const WEAPON_SLOT_LABELS = { mainHand: '主手', offHand: '副手', backup1: '备用 1', backup2: '备用 2', backup3: '备用 3', backup4: '备用 4' }

function EquipmentTab({ char, canEdit, onSave }) {
  const inv = char.inventory ?? []
  const eq = char.equipment ?? {}
  const [newItem, setNewItem] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [lastDamage, setLastDamage] = useState(null)
  const itemList = getItemList()
  const { openForCheck } = useRoll()
  const buffStats = useBuffCalculator(char, char?.buffs)
  const level = levelFromXP(char.xp)
  const abilities = char.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  const prof = proficiencyBonus(level)

  const setEquip = (patch) => onSave({ equipment: { ...eq, ...patch } })

  const getSlot = (slotKey) => {
    const raw = eq[slotKey]
    if (raw && typeof raw === 'object') {
      return {
        weaponId: raw.weaponId ?? '',
        name: typeof raw.name === 'string' ? raw.name.trim() : '',
        magicBonus: Number(raw.magicBonus) || 0,
        damageDice: typeof raw.damageDice === 'string' ? raw.damageDice.trim() : '',
      }
    }
    return { weaponId: '', name: '', magicBonus: 0, damageDice: '' }
  }
  const setSlot = (slotKey, update) => {
    const prev = getSlot(slotKey)
    const next = typeof update === 'function' ? update(prev) : update
    setEquip({ [slotKey]: { ...prev, ...next } })
  }
  const onWeaponSelect = (slotKey, weaponId) => {
    const weapon = getWeaponById(weaponId)
    setSlot(slotKey, {
      weaponId,
      name: weapon ? weapon.name : getSlot(slotKey).name,
      damageDice: weapon ? weapon.damageDice : getSlot(slotKey).damageDice,
    })
  }

  const getEffectiveDamageDice = (slot, weapon) => {
    if (slot.damageDice) return slot.damageDice
    return weapon?.damageDice ?? ''
  }

  const getAttackAndDamage = (slotKey) => {
    const slot = getSlot(slotKey)
    const weapon = getWeaponById(slot.weaponId)
    const damageDice = getEffectiveDamageDice(slot, weapon)
    if (!weapon) return { attackBonus: 0, damageBonus: 0, weapon: null, damageDice }
    const isRanged = weapon.type === '远程'
    const abMod = abilityModifier(abilities[weapon.baseStat] ?? 10)
    const attackBonus = abMod + prof + (isRanged ? (buffStats?.rangedAttackBonus ?? 0) : (buffStats?.meleeAttackBonus ?? 0)) + slot.magicBonus
    const damageBonus = abMod + (isRanged ? (buffStats?.rangedDamageBonus ?? 0) : (buffStats?.meleeDamageBonus ?? 0)) + slot.magicBonus
    return { attackBonus, damageBonus, weapon, damageDice }
  }

  const handleWeaponRoll = (slotKey) => {
    const slot = getSlot(slotKey)
    const { attackBonus, damageBonus, weapon, damageDice } = getAttackAndDamage(slotKey)
    const label = slot.name || (weapon ? weapon.name : WEAPON_SLOT_LABELS[slotKey])
    if (!damageDice) return
    if (weapon) openForCheck(`${label} 命中`, attackBonus)
    const { total, rolls } = rollDice(damageDice)
    const totalDamage = total + damageBonus
    setLastDamage({ slotKey, total: totalDamage, rolls, bonus: damageBonus, dice: damageDice })
  }

  const addItemFromList = () => {
    if (!selectedItemId) return
    onSave({ inventory: [...inv, { itemId: selectedItemId, qty: 1 }] })
    setSelectedItemId('')
  }
  const addItem = () => {
    const n = newItem.trim()
    if (!n) return
    onSave({ inventory: [...inv, { name: n, qty: 1 }] })
    setNewItem('')
  }
  const removeItem = (i) => {
    onSave({ inventory: inv.filter((_, idx) => idx !== i) })
  }
  const invDisplayName = (it) => {
    if (typeof it === 'string') return it
    if (it?.itemId) {
      const item = getItemById(it.itemId)
      return (it.name && it.name.trim()) ? it.name.trim() : getItemDisplayName(item)
    }
    return it?.name ?? '?'
  }

  return (
    <div className="space-y-6">
      {/* 装备与攻击：主手 / 副手 / 备用 x4 */}
      <div className="rounded-xl border border-gray-600 bg-gray-800 p-4">
        <h3 className="text-white font-bold text-lg mb-4 border-b border-gray-600 pb-2">装备与攻击</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {WEAPON_SLOT_KEYS.map((slotKey) => {
            const slot = getSlot(slotKey)
            const { attackBonus, damageBonus, weapon, damageDice } = getAttackAndDamage(slotKey)
            const label = WEAPON_SLOT_LABELS[slotKey]
            return (
              <div key={slotKey} className="rounded-lg bg-gray-800/80 border border-gray-700 p-3">
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <span className="text-gray-400 text-xs font-bold uppercase tracking-wider shrink-0 w-12">{label}</span>
                  {canEdit ? (
                    <>
                      <input
                        type="text"
                        value={slot.name}
                        onChange={(e) => setSlot(slotKey, { name: e.target.value })}
                        placeholder="名字"
                        className="h-9 w-28 min-w-0 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm px-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-500"
                      />
                      <select
                        value={slot.weaponId}
                        onChange={(e) => onWeaponSelect(slotKey, e.target.value)}
                        className="h-9 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm px-2 min-w-[8rem] focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        style={{ color: '#fff' }}
                      >
                        <option value="">— 类型 —</option>
                        {WEAPON_DATABASE.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span className="text-white text-sm">{slot.name || (weapon?.name ?? '—')}</span>
                  )}
                  <span className="text-gray-500 text-xs shrink-0">命中</span>
                  <span className="text-white font-bold text-lg font-mono shrink-0">{weapon ? (attackBonus >= 0 ? `+${attackBonus}` : attackBonus) : '—'}</span>
                  {canEdit ? (
                    <input
                      type="text"
                      value={slot.damageDice}
                      onChange={(e) => setSlot(slotKey, { damageDice: e.target.value })}
                      placeholder="1d8"
                      className="h-9 w-16 min-w-0 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm px-2 text-center font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-500"
                    />
                  ) : (
                    <span className="text-white font-mono text-sm">{slot.damageDice || '—'}</span>
                  )}
                  <span className="text-gray-500 text-xs shrink-0">+</span>
                  <span className="text-blue-400 font-bold text-lg font-mono shrink-0">{damageBonus >= 0 ? `+${damageBonus}` : damageBonus}</span>
                  {weapon && <span className="text-gray-500 text-xs shrink-0">{weapon.damageType}</span>}
                  <button
                    type="button"
                    onClick={() => handleWeaponRoll(slotKey)}
                    disabled={!slot.damageDice}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-sm shrink-0"
                  >
                    🎲 投掷
                  </button>
                  {canEdit && (
                    <>
                      <span className="text-gray-500 text-xs shrink-0">魔法+</span>
                      <input
                        type="number"
                        value={slot.magicBonus === 0 ? '' : slot.magicBonus}
                        onChange={(e) => setSlot(slotKey, { magicBonus: parseInt(e.target.value, 10) || 0 })}
                        className="w-10 h-8 rounded bg-gray-700 border border-gray-600 text-white text-center text-sm shrink-0"
                      />
                    </>
                  )}
                </div>
                {lastDamage?.slotKey === slotKey && (
                  <p className="mt-2 text-green-400 text-sm font-mono">
                    伤害结果: {lastDamage.total}
                    {lastDamage.rolls?.length > 0 ? ` (${lastDamage.rolls.join('+')}${lastDamage.bonus >= 0 ? '+' : ''}${lastDamage.bonus})` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* AC 相关 */}
      <div className="rounded-xl border border-gray-600 bg-gray-800/50 p-4">
        <label className={labelClass}>AC 相关（护甲 / 盾牌 / 其他）</label>
        <div className="space-y-4">
          <div>
            <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2 block">护甲类型</label>
            {canEdit ? (
              <select
                value={eq.armorType || 'unarmored'}
                onChange={(e) => setEquip({ armorType: e.target.value })}
                className="h-12 rounded-lg bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-white min-w-[10rem] px-3"
                style={{ color: '#fff' }}
              >
                {Object.entries(ARMOR_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            ) : (
              <p className="text-white pt-2">{getArmorInfo(eq.armorType || 'unarmored').label}</p>
            )}
          </div>
          <div>
            <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2 block">配盾</label>
            {canEdit ? (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!eq.useShield} onChange={(e) => setEquip({ useShield: e.target.checked })} className="rounded border-gray-600 bg-gray-800 text-dnd-red focus:ring-dnd-red" />
                  <span className="text-white text-sm">使用盾牌</span>
                </label>
                {eq.useShield && (
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={eq.shieldBonus ?? 2}
                    onChange={(e) => setEquip({ shieldBonus: parseInt(e.target.value, 10) || 0 })}
                    className="h-12 w-16 rounded-lg bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-white text-center px-2"
                  />
                )}
              </div>
            ) : (
              <p className="text-white pt-2">{eq.useShield ? `+${eq.shieldBonus ?? 2}` : '—'}</p>
            )}
          </div>
          <div>
            <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2 block">其他加成</label>
            {canEdit ? (
              <input
                type="number"
                value={eq.otherAC ?? ''}
                onChange={(e) => setEquip({ otherAC: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0 })}
                placeholder="附魔等"
                className="h-12 w-24 rounded-lg bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-white px-3 placeholder:text-gray-500"
              />
            ) : (
              <p className="text-white pt-2">{(eq.otherAC && eq.otherAC !== 0) ? `+${eq.otherAC}` : '—'}</p>
            )}
          </div>
        </div>
      </div>

      {/* 个人背包 */}
      <div>
        <label className={labelClass}>个人背包</label>
        {canEdit && (
          <div className="space-y-2 mb-3">
            <div className="flex gap-2 flex-wrap">
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="h-12 flex-1 min-w-[10rem] rounded-lg bg-gray-800 border border-gray-600 text-white px-3 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                style={{ color: '#fff' }}
              >
                <option value="">— 从物品表选择 —</option>
                {itemList.map((x) => (
                  <option key={x.id} value={x.id}>{x._display || x.类别}</option>
                ))}
              </select>
              <button type="button" onClick={addItemFromList} disabled={!selectedItemId} className="h-12 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white font-bold uppercase text-xs tracking-wider shrink-0">
                添加
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="或直接输入物品名"
                className={inputClass + ' flex-1'}
              />
              <button type="button" onClick={addItem} className="h-12 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold uppercase text-xs tracking-wider shrink-0">
                添加
              </button>
            </div>
          </div>
        )}
        <ul className="space-y-2">
          {inv.map((it, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg border border-gray-600 bg-gray-800 px-4 py-3">
              <span className="text-white">{invDisplayName(it)} {typeof it === 'object' && it?.qty > 1 ? `×${it.qty}` : ''}</span>
              {canEdit && (
                <button type="button" onClick={() => removeItem(i)} className="text-dnd-red text-sm font-bold hover:underline">
                  移除
                </button>
              )}
            </li>
          ))}
        </ul>
        {inv.length === 0 && <p className="text-gray-500 text-sm py-4">暂无物品</p>}
      </div>
    </div>
  )
}

function NotesTab({ char, canEdit, onSave }) {
  const [notes, setNotes] = useState(char.notes ?? '')

  return (
    <div>
      <label className={labelClass}>战报笔记、备忘</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => onSave({ notes: notes })}
        disabled={!canEdit}
        placeholder="战报笔记、备忘…"
        rows={10}
        className="w-full rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder:text-gray-500 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red disabled:opacity-70"
      />
      {canEdit && <p className="text-gray-500 text-xs mt-2">修改后点击外部即自动保存</p>}
    </div>
  )
}
