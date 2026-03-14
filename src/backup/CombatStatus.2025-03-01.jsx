/**
 * 战斗状态（重写版）
 * 显示：HP、AC、先攻、死亡豁免、状态效果、力竭、其它职业资源、战斗手段
 */
import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Minus, Trash2, Dices } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
import { abilityModifier, proficiencyBonus, getAC, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { skillProfFactor } from '../data/dndSkills'
import { CONDITION_OPTIONS, DAMAGE_TYPES } from '../data/buffTypes'
import { inputClass } from '../lib/inputStyles'

/** 战斗手段弹窗用：伤害类型选项（中文），含 贯穿/光耀/暗蚀 等；排除 雷鸣、辐射 */
const DAMAGE_TYPE_OPTIONS = [
  ...DAMAGE_TYPES.filter((d) => d.label !== '雷鸣' && d.label !== '辐射').map((d) => ({ value: d.label, label: d.label })),
  { value: '贯穿', label: '贯穿' },
  { value: '光耀', label: '光耀' },
  { value: '暗蚀', label: '暗蚀' },
]
/** 伤害类型简称（紧凑排版用） */
const DAMAGE_TYPE_SHORT = { 钝击: '钝', 穿刺: '穿', 挥砍: '挥', 火焰: '火', 冷冻: '冷', 闪电: '电', 强酸: '酸', 力场: '力', 死灵: '死', 心灵: '心', 毒素: '毒', 贯穿: '贯', 光耀: '光', 暗蚀: '暗' }
import { getItemById } from '../data/itemDatabase'
import { getSpellById } from '../data/spellDatabase'
import { getPrimarySpellcastingAbility } from '../data/classDatabase'
import { rollDice } from '../data/weaponDatabase'

const EXHAUSTION_LEVELS = [0, 1, 2, 3, 4, 5, 6]

function getExhaustionColor(level) {
  if (level <= 0) return 'text-gray-400'
  const colors = ['text-red-400', 'text-red-500', 'text-red-600', 'text-red-700', 'text-red-800', 'text-red-900']
  return colors[Math.min(level - 1, 5)] ?? 'text-red-900'
}

const EXHAUSTION_DESC = ['', '1：d20 检定 -2，速度 -5 尺', '2：d20 检定 -4，速度 -10 尺', '3：d20 检定 -6，速度 -15 尺', '4：d20 检定 -8，速度 -20 尺', '5：d20 检定 -10，速度 -25 尺', '6：死亡']
const DEATH_SAVE_COUNT = 6

function getDefaultDeathSaves() {
  return { results: Array(DEATH_SAVE_COUNT).fill(null), lastRoll: null }
}

function normalizeDeathSaves(ds) {
  if (!ds) return getDefaultDeathSaves()
  if (Array.isArray(ds.results) && ds.results.length >= DEATH_SAVE_COUNT) {
    const results = ds.results.slice(0, DEATH_SAVE_COUNT).map((r) =>
      r === 'success' || r === 'failure' ? r : null
    )
    return { results, lastRoll: ds.lastRoll ?? null }
  }
  const s = Math.min(3, Number(ds.success) || 0)
  const f = Math.min(3, Number(ds.failure) || 0)
  const results = [
    ...Array(s).fill('success'),
    ...Array(f).fill('failure'),
    ...Array(DEATH_SAVE_COUNT - s - f).fill(null),
  ].slice(0, DEATH_SAVE_COUNT)
  return { results, lastRoll: ds.lastRoll ?? null }
}

const CONDITION_LABELS = Object.fromEntries(
  CONDITION_OPTIONS.filter((o) => o.value !== 'exhaustion').map((o) => [o.value, o.label])
)

/** 从背包中筛出武器（类型=武器或枪械），返回 { index, entry, proto, name, 攻击, 伤害 } */
function getWeaponsFromInventory(inventory = []) {
  return inventory
    .map((entry, index) => {
      const proto = entry?.itemId ? getItemById(entry.itemId) : null
      if (!proto || (proto.类型 !== '武器' && proto.类型 !== '枪械')) return null
      const 攻击 = entry.攻击 ?? proto.攻击 ?? '—'
      const 伤害 = entry.伤害 ?? proto.伤害 ?? '—'
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      return { index, entry, proto, name, 攻击, 伤害 }
    })
    .filter(Boolean)
}

/** 解析武器 攻击 字符串如 "1d6 穿刺" → { dice: '1d6', type: '穿刺' } */
function parseWeaponAttack(attackStr) {
  if (!attackStr || typeof attackStr !== 'string') return { dice: null, type: '—' }
  const m = attackStr.trim().match(/^(\d+d\d+)\s*(.*)$/i)
  return m ? { dice: m[1], type: (m[2] || '—').trim() || '—' } : { dice: null, type: attackStr }
}

/** 武器是否使用敏捷（灵巧） */
function weaponUsesDex(proto) {
  return proto?.附注 && /灵巧/i.test(String(proto.附注))
}

/** 从法术描述中解析伤害，如 "受到1d6点强酸伤害" → [{ dice: '1d6', type: '强酸' }] */
function parseSpellDamageFromDescription(desc) {
  if (!desc || typeof desc !== 'string') return []
  const results = []
  const re = /(\d+d\d+)\s*点?\s*(\S+)\s*伤害/g
  let m
  while ((m = re.exec(desc))) results.push({ dice: m[1], type: m[2] })
  return results
}

/** 法术是否使用攻击检定（描述中含 法术攻击 / 远程法术攻击 / 近战法术攻击） */
function spellUsesAttack(desc) {
  return desc && /(远程|近战)?法术攻击/.test(String(desc))
}

export default function CombatStatus({ char, hp, abilities, level, canEdit, onSave }) {
  const { openForCheck } = useRoll()
  const buffStats = useBuffCalculator(char, char?.buffs)
  const acResult = getAC(char)
  const acTotal = buffStats?.ac != null ? buffStats.ac : (acResult.total + (buffStats?.acBonus ?? 0))
  const maxHpBase = calcMaxHP(char) + getHPBuffSum(char) + (buffStats?.maxHpBonus ?? 0)
  const maxHpMult = buffStats?.maxHpMultiplier ?? 1
  const maxHp = Math.max(1, Math.floor(maxHpBase * maxHpMult))

  const [hpCurrent, setHpCurrent] = useState(hp?.current ?? 0)
  const [hpTemp, setHpTemp] = useState(hp?.temp ?? 0)
  const [deductVal, setDeductVal] = useState('')
  const [healVal, setHealVal] = useState('')
  const [tempInputVal, setTempInputVal] = useState('')
  const [conditions, setConditions] = useState(() => Array.isArray(char?.conditions) ? [...char.conditions] : [])
  const [exhaustion, setExhaustion] = useState(() => Math.max(0, Math.min(6, Number(char?.exhaustionLevel) || 0)))
  const [deathSaves, setDeathSaves] = useState(() => normalizeDeathSaves(char?.deathSaves))
  const [classResources, setClassResources] = useState(() => {
    const arr = Array.isArray(char?.classResources) ? char.classResources : []
    return arr.map((r) => ({ id: r.id ?? 'r_' + Math.random().toString(36).slice(2), name: r.name || '—', current: Math.max(0, Number(r.current) ?? 0), max: Math.max(1, Number(r.max) ?? 1) }))
  })
  const [addResourceName, setAddResourceName] = useState('')
  const [addResourceMax, setAddResourceMax] = useState(2)
  const [isAddingResource, setIsAddingResource] = useState(false)
  const [combatMeans, setCombatMeans] = useState(() => {
    const arr = Array.isArray(char?.combatMeans) ? char.combatMeans : []
    return arr.map((m) => ({
      id: m.id ?? 'cm_' + Math.random().toString(36).slice(2),
      type: m.type === 'spell' ? 'spell' : 'physical',
      weaponInventoryIndex: m.weaponInventoryIndex ?? null,
      spellId: m.spellId ?? null,
      extraDamageDice: Array.isArray(m.extraDamageDice) ? m.extraDamageDice : [],
      abilityForAttack: m.abilityForAttack ?? null,
      damageType: m.damageType ?? null,
      weaponProficient: m.weaponProficient !== false,
    }))
  })
  const [showAddCombatMeanModal, setShowAddCombatMeanModal] = useState(false)
  const [addMeanStep, setAddMeanStep] = useState('type') // 'type' | 'weapon'
  const [addWeaponIndex, setAddWeaponIndex] = useState(null)
  const [addAbility, setAddAbility] = useState('str')
  const [addDamageType, setAddDamageType] = useState('')
  const [addWeaponProficient, setAddWeaponProficient] = useState(true)

  useEffect(() => {
    setHpCurrent(hp?.current ?? 0)
    setHpTemp(hp?.temp ?? 0)
  }, [hp?.current, hp?.temp])

  useEffect(() => {
    setConditions(Array.isArray(char?.conditions) ? [...char.conditions] : [])
  }, [char?.id, char?.conditions])

  useEffect(() => {
    setExhaustion(Math.max(0, Math.min(6, Number(char?.exhaustionLevel) || 0)))
  }, [char?.id, char?.exhaustionLevel])

  useEffect(() => {
    setDeathSaves(normalizeDeathSaves(char?.deathSaves))
  }, [char?.id, char?.deathSaves])

  useEffect(() => {
    const arr = Array.isArray(char?.classResources) ? char.classResources : []
    setClassResources(arr.map((r) => ({ id: r.id ?? 'r_' + Math.random().toString(36).slice(2), name: r.name || '—', current: Math.max(0, Number(r.current) ?? 0), max: Math.max(1, Number(r.max) ?? 1) })))
  }, [char?.id, char?.classResources])

  useEffect(() => {
    const arr = Array.isArray(char?.combatMeans) ? char.combatMeans : []
    setCombatMeans(arr.map((m) => ({
      id: m.id ?? 'cm_' + Math.random().toString(36).slice(2),
      type: m.type === 'spell' ? 'spell' : 'physical',
      weaponInventoryIndex: m.weaponInventoryIndex ?? null,
      spellId: m.spellId ?? null,
      extraDamageDice: Array.isArray(m.extraDamageDice) ? m.extraDamageDice : [],
      abilityForAttack: m.abilityForAttack ?? null,
      damageType: m.damageType ?? null,
      weaponProficient: m.weaponProficient !== false,
    })))
  }, [char?.id, char?.combatMeans])

  useEffect(() => {
    if (hpCurrent > maxHp) setHpCurrent(maxHp)
  }, [maxHp, hpCurrent])

  const saveCombatMeans = (next) => {
    setCombatMeans(next)
    onSave({
      combatMeans: next.map((m) => ({
        id: m.id,
        type: m.type,
        weaponInventoryIndex: m.weaponInventoryIndex,
        spellId: m.spellId,
        extraDamageDice: m.extraDamageDice,
        abilityForAttack: m.abilityForAttack,
        damageType: m.damageType,
        weaponProficient: m.weaponProficient,
      })),
    })
  }
  const openAddCombatMeanModal = () => {
    setAddMeanStep('type')
    const first = weaponsFromInv[0]
    if (first) {
      setAddWeaponIndex(first.index)
      const parsed = parseWeaponAttack(first.攻击)
      setAddDamageType(parsed.type && parsed.type !== '—' ? parsed.type : '')
    } else {
      setAddWeaponIndex(null)
      setAddDamageType('')
    }
    setAddAbility('str')
    setAddWeaponProficient(true)
    setShowAddCombatMeanModal(true)
  }
  const confirmAddWeaponMean = () => {
    const newMean = {
      id: 'cm_' + Date.now(),
      type: 'physical',
      weaponInventoryIndex: addWeaponIndex,
      spellId: null,
      extraDamageDice: [],
      abilityForAttack: addAbility,
      damageType: addDamageType || null,
      weaponProficient: addWeaponProficient,
    }
    saveCombatMeans([...combatMeans, newMean])
    setShowAddCombatMeanModal(false)
  }
  const removeCombatMean = (id) => {
    saveCombatMeans(combatMeans.filter((m) => m.id !== id))
  }
  const updateCombatMean = (id, patch) => {
    saveCombatMeans(combatMeans.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  const [lastDamageRoll, setLastDamageRoll] = useState(null) // { byType: { [type]: { rolls, modifier } } } 或旧格式 { total, rolls, modifier }
  const [addExtraForMeanId, setAddExtraForMeanId] = useState(null)
  const [addExtraSides, setAddExtraSides] = useState(6)
  const [addExtraCount, setAddExtraCount] = useState(1)
  const [addExtraType, setAddExtraType] = useState('钝击')

  /** 物理武器：汇总主伤+所有额外骰，按伤害类型分组投掷并展示 */
  const rollAllWeaponDamage = (cm, weaponOpt, attackParsed, damageMod, displayDamageType, isCrit) => {
    const sources = []
    if (attackParsed?.dice) {
      sources.push({ dice: attackParsed.dice, modifier: Number(damageMod) || 0, type: displayDamageType || '钝击' })
    }
    ;(cm.extraDamageDice || []).forEach((d) => {
      const parts = typeof d === 'string' && d.includes(' ') ? d.split(' ') : [d, displayDamageType || '钝击']
      const dice = parts[0]
      const type = parts[1] || displayDamageType || '钝击'
      if (dice) sources.push({ dice, modifier: 0, type })
    })
    const byType = {}
    sources.forEach(({ dice, modifier, type }) => {
      const r1 = rollDice(dice)
      const r2 = isCrit ? rollDice(dice) : { total: 0, rolls: [] }
      const rolls = [...(r1.rolls ?? []), ...(r2.rolls ?? [])]
      const total = r1.total + r2.total + modifier
      if (!byType[type]) byType[type] = { rolls: [], modifier: 0 }
      byType[type].rolls.push(...rolls)
      byType[type].modifier += modifier
    })
    setLastDamageRoll({ byType })
  }

  const rollDamageDice = (diceExpr, label, key, modifier = 0, isCrit = false) => {
    const mod = Number(modifier) || 0
    if (isCrit) {
      const r1 = rollDice(diceExpr)
      const r2 = rollDice(diceExpr)
      const finalTotal = r1.total + r2.total + mod
      const rolls = [...(r1.rolls ?? []), ...(r2.rolls ?? [])]
      setLastDamageRoll({ key: key ?? Date.now(), label: (label || diceExpr) + ' (重击)', total: finalTotal, rolls, dice: diceExpr, modifier: mod, isCrit: true })
    } else {
      const { total, rolls } = rollDice(diceExpr)
      const finalTotal = total + mod
      setLastDamageRoll({ key: key ?? Date.now(), label: label || diceExpr, total: finalTotal, rolls, dice: diceExpr, modifier: mod })
    }
  }

  const weaponsFromInv = useMemo(() => getWeaponsFromInventory(char?.inventory ?? []), [char?.inventory])
  const preparedSpellsList = useMemo(() => {
    const raw = char?.spells ?? []
    return raw
      .filter((s) => s.prepared)
      .map((s) => ({ spellId: s.spellId ?? s.id, spell: getSpellById(s.spellId ?? s.id) }))
      .filter((x) => x.spell)
  }, [char?.spells])
  const effectiveAbilities = buffStats?.abilities ?? abilities
  const spellAbility = getPrimarySpellcastingAbility(char)
  const prof = buffStats?.proficiencyOverride != null ? buffStats.proficiencyOverride : proficiencyBonus(level)
  const spellAttackBonus = spellAbility != null ? prof + abilityModifier(effectiveAbilities?.[spellAbility] ?? 10) + (buffStats?.spellAttackBonus ?? 0) : null
  const spellDC = spellAbility != null ? 8 + prof + abilityModifier(effectiveAbilities?.[spellAbility] ?? 10) + (buffStats?.saveDcBonus ?? 0) : null

  const saveHp = (c, t) => {
    setHpCurrent(c)
    setHpTemp(t)
    onSave({ hp: { current: c, max: maxHp, temp: t } })
  }

  const handleDeduct = () => {
    const n = parseInt(deductVal, 10)
    if (isNaN(n) || n <= 0) return
    const fromTemp = Math.min(n, hpTemp)
    const fromCur = n - fromTemp
    const newTemp = Math.max(0, hpTemp - fromTemp)
    const newCur = hpCurrent - fromCur
    saveHp(newCur, newTemp)
    setDeductVal('')
  }

  const handleAddTemp = () => {
    const n = parseInt(tempInputVal, 10)
    if (isNaN(n) || n <= 0) return
    saveHp(hpCurrent, hpTemp + n)
    setTempInputVal('')
  }

  const handleHeal = () => {
    const n = parseInt(healVal, 10)
    if (isNaN(n)) return
    saveHp(Math.min(maxHp, hpCurrent + n), hpTemp)
    setHealVal('')
  }

  const addCondition = (val) => {
    if (conditions.includes(val)) return
    const next = [...conditions, val]
    setConditions(next)
    onSave({ conditions: next })
  }

  const removeCondition = (val) => {
    const next = conditions.filter((c) => c !== val)
    setConditions(next)
    onSave({ conditions: next })
  }

  const setExhaustionLevel = (n) => {
    const v = Math.max(0, Math.min(6, Number(n) || 0))
    setExhaustion(v)
    onSave({ exhaustionLevel: v })
  }

  const rollDeathSave = () => {
    const results = [...(deathSaves.results ?? getDefaultDeathSaves().results)]
    const emptyIdx = results.findIndex((r) => r == null)
    if (emptyIdx < 0) return
    const roll = Math.floor(Math.random() * 20) + 1
    let isCrit = false
    let isFumble = false
    if (roll === 20) {
      results[emptyIdx] = 'success'
      if (emptyIdx + 1 < results.length) results[emptyIdx + 1] = 'success'
      isCrit = true
    } else if (roll === 1) {
      results[emptyIdx] = 'failure'
      if (emptyIdx + 1 < results.length) results[emptyIdx + 1] = 'failure'
      isFumble = true
    } else {
      results[emptyIdx] = roll >= 10 ? 'success' : 'failure'
    }
    const next = { results, lastRoll: { roll, isCritical: isCrit, isFumble } }
    setDeathSaves(next)
    onSave({ deathSaves: next })
  }

  const resetDeathSaves = () => {
    const next = getDefaultDeathSaves()
    setDeathSaves(next)
    onSave({ deathSaves: next })
  }

  const saveClassResources = (next) => {
    setClassResources(next)
    onSave({ classResources: next.map((r) => ({ id: r.id, name: r.name, current: r.current, max: r.max })) })
  }

  const addClassResource = () => {
    const name = (addResourceName?.trim() || '未命名')
    const max = Math.max(1, Number(addResourceMax) || 1)
    const next = [...classResources, { id: 'r_' + Date.now(), name, current: max, max }]
    saveClassResources(next)
    setAddResourceName('')
    setAddResourceMax(2)
    setIsAddingResource(false)
  }

  const removeClassResource = (id) => {
    saveClassResources(classResources.filter((r) => r.id !== id))
  }

  const adjustClassResource = (id, delta) => {
    const next = classResources.map((r) => {
      if (r.id !== id) return r
      const cur = Math.max(0, Math.min(r.max, r.current + delta))
      return { ...r, current: cur }
    })
    saveClassResources(next)
  }

  const dexMod = abilityModifier(effectiveAbilities?.dex ?? 10)
  const init = dexMod + (buffStats?.initBonus ?? 0)
  const perception = 10 + abilityModifier(effectiveAbilities?.wis ?? 10) + Math.floor(prof * skillProfFactor(char?.skills?.perception || 'none'))
  const speedBase = (char?.speed ?? 30) + (buffStats?.speedBonus ?? 0)
  const speedPenalty = buffStats?.speedExhaustionPenalty ?? 0
  const speed = Math.max(0, Math.floor(speedBase * (buffStats?.speedMultiplier ?? 1)) - speedPenalty)

  const dsResults = deathSaves.results?.length === DEATH_SAVE_COUNT ? deathSaves.results : getDefaultDeathSaves().results
  const deathFailures = dsResults.filter((r) => r === 'failure').length
  const displayCurrent = hpCurrent + hpTemp
  const pct = maxHp > 0 ? (hpCurrent / maxHp) * 100 : 0
  const hasTempHp = hpTemp > 0

  let barColor = 'bg-gray-600'
  if (deathFailures >= 3 || hpCurrent <= -maxHp) {
    barColor = 'bg-gray-500'
  } else if (hasTempHp) {
    barColor = 'bg-blue-600'
  } else if (pct >= 80) {
    barColor = 'bg-green-600'
  } else if (pct >= 50) {
    barColor = 'bg-yellow-600'
  } else if (pct > 0) {
    barColor = 'bg-red-600'
  } else {
    barColor = 'bg-red-900'
  }

  const barWidth = maxHp > 0 ? Math.max(0, Math.min(100, (displayCurrent / maxHp) * 100)) : 0

  return (
    <div className="rounded-xl border border-gray-600 bg-gray-800/30 p-4 space-y-4">
      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
        <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">生命值</h3>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white font-bold text-xl font-mono">
            {displayCurrent} / {maxHp}
            {hasTempHp && <span className="text-blue-400 text-sm font-normal ml-1">（含 {hpTemp} 临时）</span>}
          </span>
        </div>
        <div className="h-4 rounded bg-gray-900 overflow-hidden">
          <div className={`h-full rounded transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        {canEdit && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <label className="text-gray-500 text-xs block mb-1">扣除伤害</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={deductVal}
                  onChange={(e) => setDeductVal(e.target.value)}
                  placeholder="数值"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                />
                <button type="button" onClick={handleDeduct} className="px-3 py-1.5 rounded bg-dnd-red text-white text-sm font-medium">
                  扣除
                </button>
              </div>
            </div>
            <div>
              <label className="text-gray-500 text-xs block mb-1">恢复</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={healVal}
                  onChange={(e) => setHealVal(e.target.value)}
                  placeholder="数值"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                />
                <button type="button" onClick={handleHeal} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-medium">
                  恢复
                </button>
                <button type="button" onClick={() => saveHp(maxHp, hpTemp)} className="px-3 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">
                  满血
                </button>
              </div>
            </div>
            <div>
              <label className="text-gray-500 text-xs block mb-1">临时血量</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={tempInputVal}
                  onChange={(e) => setTempInputVal(e.target.value)}
                  placeholder="数值"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                  min={0}
                />
                <button type="button" onClick={handleAddTemp} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium">
                  加入
                </button>
                {hpTemp > 0 && (
                  <button type="button" onClick={() => saveHp(hpCurrent, 0)} className="px-3 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-5 min-h-[5rem] flex items-center justify-center gap-3">
          <span className="text-gray-400 text-2xl font-medium">AC</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{acTotal}</span>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-5 min-h-[5rem] flex items-center justify-center gap-3">
          <span className="text-gray-400 text-2xl font-medium">先攻</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{init}</span>
          <button type="button" onClick={() => openForCheck('先攻', init)} title="投掷先攻" className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0">
            <Dices className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-5 min-h-[5rem] flex items-center justify-center gap-3">
          <span className="text-gray-400 text-2xl font-medium">被动察觉</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{perception}</span>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-5 min-h-[5rem] flex items-center justify-center gap-3">
          <span className="text-gray-400 text-2xl font-medium">速度</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{speed} 尺</span>
        </div>
        <div className="col-span-2 rounded-lg border border-gray-600 bg-gray-800/50 px-1.5 py-1 min-w-0 flex flex-col min-h-0 sm:min-h-[5rem]">
          <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5 shrink-0 leading-tight">状态效果</h3>
          <div className="flex flex-wrap items-center gap-1 min-h-0">
            {canEdit ? (
              <div className="flex items-center gap-1 flex-1 min-w-[6rem]">
                <span className="text-gray-500 text-xs whitespace-nowrap">力竭</span>
                <select
                  value={exhaustion}
                  onChange={(e) => setExhaustionLevel(Number(e.target.value))}
                  className={`h-5 min-h-0 px-1 rounded border border-gray-600 bg-gray-700 text-xs font-medium focus:border-dnd-red focus:ring-1 focus:ring-dnd-red shrink-0 ${getExhaustionColor(exhaustion)}`}
                >
                  <option value={0}>无</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>等级{n}</option>
                  ))}
                </select>
              </div>
            ) : (
              <span className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-medium whitespace-nowrap shrink-0 flex-1 min-w-[6rem] ${exhaustion > 0 ? 'bg-red-900/20 ' + getExhaustionColor(exhaustion) : 'text-gray-400'}`}>
                力竭 {exhaustion > 0 ? exhaustion : '无'}
              </span>
            )}
            {conditions.map((c) => (
              <span
                key={c}
                className="flex flex-1 min-w-[5rem] items-center justify-center gap-0.5 px-1 py-0.5 rounded text-xs bg-red-900/40 text-red-200 whitespace-nowrap"
              >
                {CONDITION_LABELS[c] ?? c}
                {canEdit && (
                  <button type="button" onClick={() => removeCondition(c)} className="hover:bg-red-800/50 rounded px-0.5">
                    ×
                  </button>
                )}
              </span>
            ))}
            {canEdit && CONDITION_OPTIONS.filter((o) => o.value !== 'exhaustion' && !conditions.includes(o.value)).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => addCondition(o.value)}
                className="flex-1 min-w-[5rem] px-1 py-0.5 rounded text-xs border border-gray-600 text-gray-400 hover:bg-gray-700 whitespace-nowrap"
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-600 bg-gray-800/50 px-1.5 py-1 min-w-0 flex flex-col min-h-0 sm:min-h-[5rem]">
          <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5 shrink-0 leading-tight">死亡豁免</h3>
          <div className="flex items-center gap-1 flex-nowrap min-h-0 w-full">
            <div className="flex gap-0.5 shrink-0">
              {dsResults.map((r, i) => (
                <span
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 ${
                    r === 'success' ? 'bg-emerald-600 border-emerald-500' : r === 'failure' ? 'bg-red-600 border-red-500' : 'bg-gray-700 border-gray-600'
                  }`}
                />
              ))}
            </div>
            {deathSaves.lastRoll != null && (
              <span className="text-gray-500 text-xs whitespace-nowrap shrink-0">d20={deathSaves.lastRoll.roll}</span>
            )}
            <div className="flex gap-0.5 shrink-0 items-center">
              <button type="button" onClick={rollDeathSave} title="投掷死亡豁免" className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0">
                <Dices className="w-3.5 h-3.5" aria-hidden />
              </button>
              <button type="button" onClick={resetDeathSaves} className="w-7 h-7 flex items-center justify-center rounded text-xs border border-gray-500 text-gray-400 shrink-0">
                重置
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-3 flex-col sm:flex-row">
        <div className="min-w-0 flex-[3]">
      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3 h-full">
        <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider mb-1.5">战斗手段</h3>
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-dashed border-gray-500 bg-gray-800/30 px-2.5 py-2 min-h-[2.5rem] flex items-start sm:items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
              <div className="text-xs font-mono min-w-0 flex-1 break-words flex items-baseline gap-1.5 flex-wrap">
                {lastDamageRoll ? (
                  lastDamageRoll.byType ? (
                    <>
                      {Object.entries(lastDamageRoll.byType).map(([type, { rolls, modifier }]) => {
                        const total = (rolls?.reduce((a, b) => a + b, 0) || 0) + (modifier || 0)
                        const expr = (rolls?.length ? rolls.join('+') : '') + (modifier != null && modifier !== 0 ? (modifier >= 0 ? '+' : '') + modifier : '')
                        return (
                          <span key={type} className="text-amber-400/90">
                            <span className="text-amber-400/70">{expr}=</span>
                            <span className="text-amber-300 font-bold">{total}</span>
                            <span className="text-amber-400/70">{type}</span>
                            {' '}
                          </span>
                        )
                      })}
                    </>
                  ) : (
                    <>
                      <span className="text-amber-300 font-bold text-sm">{lastDamageRoll.total}</span>
                      {lastDamageRoll.rolls?.length ? (
                        <span className="text-amber-400/70">({lastDamageRoll.rolls.join('+')}{lastDamageRoll.modifier != null && lastDamageRoll.modifier !== 0 ? (lastDamageRoll.modifier >= 0 ? '+' : '') + lastDamageRoll.modifier : ''})</span>
                      ) : null}
                    </>
                  )
                ) : null}
              </div>
              <button type="button" onClick={() => setLastDamageRoll(null)} className="shrink-0 px-2 py-1 rounded text-xs border border-gray-500 text-gray-400 hover:bg-gray-600 hover:text-white" title="清空">
                清空
              </button>
            </div>
          {combatMeans.map((cm) => {
            const isPhysical = cm.type === 'physical'
            const weaponOpt = isPhysical && cm.weaponInventoryIndex != null ? weaponsFromInv.find((w) => w.index === cm.weaponInventoryIndex) : null
            const attackParsed = weaponOpt ? parseWeaponAttack(weaponOpt.攻击) : { dice: null, type: '—' }
            const enhancement = Number(weaponOpt?.entry?.magicBonus) || 0
            const abilityKey = cm.abilityForAttack === 'spell' ? spellAbility : (cm.abilityForAttack === 'dex' ? 'dex' : 'str')
            const abilityMod = abilityModifier(effectiveAbilities?.[abilityKey] ?? 10)
            const isRanged = weaponOpt?.proto?.子类型 === '远程'
            const buffAttackBonus = isRanged ? (buffStats?.rangedAttackBonus ?? 0) : (buffStats?.meleeAttackBonus ?? 0)
            const weaponProficient = cm.weaponProficient !== false
            const physicalAttackBonus = enhancement + abilityMod + (weaponProficient ? prof : 0) + buffAttackBonus
            const damageMod = abilityMod + enhancement
            const displayDamageType = cm.damageType || attackParsed.type || '—'
            const spellOpt = !isPhysical && cm.spellId ? preparedSpellsList.find((p) => p.spellId === cm.spellId) : null
            const spell = spellOpt?.spell
            const spellDesc = spell?.description ?? ''
            const spellIsAttack = spellUsesAttack(spellDesc)
            const spellDamageList = spell ? parseSpellDamageFromDescription(spellDesc) : []

            return (
              <div key={cm.id} className="rounded-lg border border-gray-600 bg-gray-800/80 p-2.5">
                {isPhysical ? (
                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2 w-full">
                    <span className="text-white font-medium text-sm shrink-0">{weaponOpt?.name ?? '—'}</span>
                    {weaponOpt && (
                      <>
                        <span className="border-r border-gray-600 h-5 mx-0.5 self-center shrink-0" aria-hidden />
                        <span className="inline-flex items-center gap-x-2 shrink-0">
                          <span className="text-dnd-text-muted text-sm">攻击</span>
                          <span className="text-white font-mono text-sm tabular-nums">{physicalAttackBonus >= 0 ? '+' : ''}{physicalAttackBonus}</span>
                          <button type="button" onClick={() => openForCheck(weaponOpt.name + ' 攻击', physicalAttackBonus)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="投掷攻击">
                            <Dices className="w-3.5 h-3.5" />
                          </button>
                        </span>
                        <span className="border-r border-gray-600 h-5 mx-2 self-center shrink-0" aria-hidden />
                        <span className="inline-flex items-center gap-x-2 flex-wrap">
                          <span className="text-dnd-text-muted text-sm shrink-0">伤害</span>
                        <span className="text-white font-mono text-sm tabular-nums">
                          {attackParsed.dice ?? '—'}{damageMod >= 0 ? '+' : ''}{damageMod !== 0 ? damageMod : ''} {displayDamageType}
                        </span>
                        {canEdit && (
                          <button type="button" onClick={() => { setAddExtraForMeanId(cm.id); setAddExtraCount(1); setAddExtraSides(6); setAddExtraType(displayDamageType || '钝击'); }} className="p-0.5 rounded border border-gray-500 text-gray-400 hover:bg-gray-600 text-sm shrink-0" title="增加其他伤害骰">
                            +
                          </button>
                        )}
                        {addExtraForMeanId === cm.id && (
                          <span className="inline-flex items-center gap-1.5 flex-nowrap shrink-0">
                            <button type="button" onClick={() => setAddExtraCount((c) => Math.max(1, c - 1))} className="w-6 h-6 flex items-center justify-center rounded border border-gray-500 text-gray-400 hover:bg-gray-600 shrink-0">−</button>
                            <span className="text-white font-mono text-xs w-5 text-center shrink-0">{addExtraCount}</span>
                            <button type="button" onClick={() => setAddExtraCount((c) => c + 1)} className="w-6 h-6 flex items-center justify-center rounded border border-gray-500 text-gray-400 hover:bg-gray-600 shrink-0">+</button>
                            <select value={addExtraSides} onChange={(e) => setAddExtraSides(Number(e.target.value))} className="text-xs h-6 rounded border border-gray-600 bg-gray-700 text-white shrink-0 focus:outline-none focus:ring-1 focus:ring-dnd-red" title="骰子面数" style={{ width: '5.5rem', paddingLeft: '0.6rem', paddingRight: '1.5rem', boxSizing: 'border-box' }}>
                              <option value={4}>D4</option>
                              <option value={6}>D6</option>
                              <option value={8}>D8</option>
                              <option value={12}>D12</option>
                            </select>
                            <select value={addExtraType} onChange={(e) => setAddExtraType(e.target.value)} className="text-xs h-6 rounded border border-gray-600 bg-gray-700 text-white shrink-0 focus:outline-none focus:ring-1 focus:ring-dnd-red" title={addExtraType} style={{ width: '5.5rem', paddingLeft: '0.6rem', paddingRight: '1.5rem', boxSizing: 'border-box' }}>
                              {DAMAGE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{DAMAGE_TYPE_SHORT[opt.value] ?? opt.value}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => { updateCombatMean(cm.id, { extraDamageDice: [...(cm.extraDamageDice || []), `${addExtraCount}d${addExtraSides} ${addExtraType}`] }); setAddExtraForMeanId(null); }} className="px-1.5 py-0.5 rounded bg-dnd-red text-white text-xs hover:bg-dnd-red-hover shrink-0">确认</button>
                            <button type="button" onClick={() => setAddExtraForMeanId(null)} className="px-1.5 py-0.5 rounded border border-gray-500 text-gray-400 text-xs hover:bg-gray-600 shrink-0">取消</button>
                          </span>
                        )}
                        {(cm.extraDamageDice || []).map((d, i) => (
                          <span key={i} className="text-white font-mono text-sm">{d}</span>
                        ))}
                        {(cm.extraDamageDice?.length ?? 0) > 0 && canEdit && (
                          <button type="button" onClick={() => updateCombatMean(cm.id, { extraDamageDice: cm.extraDamageDice.slice(0, -1) })} className="p-0.5 rounded border border-gray-500 text-gray-400 hover:bg-gray-600 text-sm shrink-0" title="移除最后一项额外伤害">
                            −
                          </button>
                        )}
                        {(attackParsed.dice || (cm.extraDamageDice?.length ?? 0) > 0) && (
                          <>
                            <button type="button" onClick={() => rollAllWeaponDamage(cm, weaponOpt, attackParsed, damageMod, displayDamageType, false)} className="w-7 h-7 flex items-center justify-center rounded bg-amber-600 hover:bg-amber-500 text-white shrink-0" title="投掷伤害">
                              <Dices className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => rollAllWeaponDamage(cm, weaponOpt, attackParsed, damageMod, displayDamageType, true)} className="w-7 h-7 flex items-center justify-center rounded bg-red-700 hover:bg-red-600 text-white text-[10px] font-medium shrink-0 leading-none" title="投掷伤害（重击）">
                              重击
                            </button>
                          </>
                        )}
                        </span>
                        {canEdit && (
                          <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0 ml-auto" title="移除">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={cm.type}
                        onChange={(e) => updateCombatMean(cm.id, { type: e.target.value, weaponInventoryIndex: null, spellId: null })}
                        className={inputClass + ' text-sm h-7 w-24'}
                        disabled={!canEdit}
                      >
                        <option value="physical">物理攻击</option>
                        <option value="spell">法术攻击</option>
                      </select>
                      {canEdit && (
                        <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-dnd-text-muted text-sm shrink-0">法术</span>
                      <select
                        value={cm.spellId ?? ''}
                        onChange={(e) => updateCombatMean(cm.id, { spellId: e.target.value || null })}
                        className={inputClass + ' text-sm h-7 flex-1 min-w-0 max-w-[160px]'}
                        disabled={!canEdit}
                      >
                        <option value="">—</option>
                        {preparedSpellsList.map((p) => (
                          <option key={p.spellId} value={p.spellId}>{p.spell?.name ?? p.spellId}</option>
                        ))}
                      </select>
                    </div>
                    {spell && (
                      <>
                        {spellIsAttack ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-dnd-text-muted text-sm shrink-0">法术攻击</span>
                            <span className="text-white font-mono text-sm tabular-nums">{spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : '—'}</span>
                            {spellAttackBonus != null && (
                              <button type="button" onClick={() => openForCheck(spell.name + ' 法术攻击', spellAttackBonus)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white" title="投掷法术攻击">
                                <Dices className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-dnd-text-muted text-sm shrink-0">法术 DC</span>
                            <span className="text-white font-mono text-sm tabular-nums">{spellDC != null ? spellDC : '—'}</span>
                          </div>
                        )}
                        {spellDamageList.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            {spellDamageList.map((d, i) => (
                              <span key={i} className="inline-flex items-center gap-0.5">
                                <span className="text-white font-mono text-sm">{d.dice} {d.type}</span>
                                <button type="button" onClick={() => rollDamageDice(d.dice, spell.name + ' ' + d.type, 'spell-' + cm.id + '-' + i)} className="w-7 h-7 flex items-center justify-center rounded bg-amber-600 hover:bg-amber-500 text-white" title="投掷伤害">
                                  <Dices className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={() => rollDamageDice(d.dice, spell.name + ' ' + d.type, 'spell-' + cm.id + '-' + i, 0, true)} className="w-7 h-7 flex items-center justify-center rounded bg-red-700 hover:bg-red-600 text-white text-[10px] font-medium shrink-0 leading-none" title="投掷伤害（重击）">
                                  重击
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })}
          {canEdit && (
            <button type="button" onClick={openAddCombatMeanModal} className="text-white text-sm font-bold uppercase tracking-wider hover:underline">
              + 添加战斗手段
            </button>
          )}

          {showAddCombatMeanModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowAddCombatMeanModal(false)}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                {addMeanStep === 'type' ? (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">添加战斗手段</h3>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => { const nextIdx = weaponsFromInv.length ? weaponsFromInv[0].index : null; setAddWeaponIndex(nextIdx); const w = weaponsFromInv.find((x) => x.index === nextIdx); setAddDamageType(w ? (parseWeaponAttack(w.攻击).type || '') : ''); setAddMeanStep('weapon'); }} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm">
                        武器攻击
                      </button>
                      <button type="button" disabled className="w-full py-2.5 rounded bg-gray-600 text-gray-400 font-medium text-sm cursor-not-allowed">
                        法术攻击（敬请期待）
                      </button>
                    </div>
                    <button type="button" onClick={() => setShowAddCombatMeanModal(false)} className="mt-3 w-full py-1.5 rounded border border-gray-500 text-gray-400 text-xs">取消</button>
                  </>
                ) : (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">武器攻击</h3>
                    <div className="space-y-2.5 text-sm">
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">武器</label>
                        <select value={addWeaponIndex ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : parseInt(e.target.value, 10); setAddWeaponIndex(v); const w = weaponsFromInv.find((x) => x.index === v); if (w) setAddDamageType(parseWeaponAttack(w.攻击).type || addDamageType); }} className={inputClass + ' w-full h-8 text-xs'} disabled={!canEdit}>
                          <option value="">—</option>
                          {weaponsFromInv.map((w) => (
                            <option key={w.index} value={w.index}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">攻击属性</label>
                        <select value={addAbility} onChange={(e) => setAddAbility(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          <option value="str">力量</option>
                          <option value="dex">敏捷</option>
                          <option value="spell">施法属性</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">伤害类型</label>
                        <select value={addDamageType} onChange={(e) => setAddDamageType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          <option value="">—</option>
                          {DAMAGE_TYPE_OPTIONS.map((d) => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={addWeaponProficient} onChange={(e) => setAddWeaponProficient(e.target.checked)} className="rounded border-gray-500" />
                        <span className="text-dnd-text-body text-xs">武器熟练</span>
                      </label>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => setAddMeanStep('type')} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
                      <button type="button" onClick={confirmAddWeaponMean} disabled={addWeaponIndex == null} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-xs">确认</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
        </div>
        <div className="min-w-0 flex-[1]">
          <div className="rounded-lg border border-gray-600 bg-gray-800/50 px-1.5 py-1 min-w-0 flex flex-col min-h-0 h-full">
            <div className="flex items-center justify-between gap-1 mb-0.5 shrink-0">
              <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider leading-tight">其它职业资源</h3>
              {canEdit && (
                <button type="button" onClick={() => setIsAddingResource(true)} className="text-white text-xs font-bold uppercase tracking-wider hover:underline shrink-0">
                  + 添加
                </button>
              )}
            </div>
            {canEdit ? (
              <div className="flex flex-col min-h-0 overflow-hidden gap-0.5">
                {isAddingResource ? (
                  <>
                    <div className="flex items-center gap-1 flex-nowrap px-0.5 py-0.5 rounded border border-dashed border-gray-500 min-w-0 w-full">
                      <input
                        type="text"
                        value={addResourceName}
                        onChange={(e) => setAddResourceName(e.target.value)}
                        placeholder="名称"
                        className={inputClass + ' h-6 min-w-0 flex-1 text-sm'}
                        autoFocus
                      />
                      <input
                        type="number"
                        min={1}
                        value={addResourceMax}
                        onChange={(e) => setAddResourceMax(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        placeholder="上限"
                        className={inputClass + ' h-6 !w-12 text-sm text-center shrink-0'}
                      />
<button type="button" onClick={addClassResource} className="h-6 px-1.5 rounded bg-dnd-red text-white text-sm font-medium hover:bg-dnd-red-hover shrink-0">
                      保存
                    </button>
                    <button type="button" onClick={() => { setIsAddingResource(false); setAddResourceName(''); setAddResourceMax(2) }} className="text-gray-400 hover:text-white text-sm shrink-0">
                      取消
                    </button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_2.5rem_2.5rem_2.5rem] gap-x-0 gap-y-0.5 min-w-0">
                      {classResources.map((r) => (
                        <React.Fragment key={r.id}>
                          <div className="min-w-0 flex items-center px-0.5 py-0.5 rounded-l border border-gray-600 border-r-0 bg-gray-800/80">
<span className="text-dnd-text-body text-sm font-medium truncate">{r.name}</span>
                        </div>
                        <div className="flex items-center justify-end px-0.5 py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                          <span className="text-white font-mono text-sm tabular-nums whitespace-nowrap">{r.current}/{r.max}</span>
                        </div>
                        <div className="flex items-center justify-center py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                          <button type="button" onClick={() => adjustClassResource(r.id, -1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="减少">
                              <Minus size={10} />
                            </button>
                          </div>
                          <div className="flex items-center justify-center py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                            <button type="button" onClick={() => adjustClassResource(r.id, 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="增加">
                              <Plus size={10} />
                            </button>
                          </div>
                          <div className="flex items-center justify-center py-0.5 rounded-r border border-gray-600 bg-gray-800/80">
                            <button type="button" onClick={() => removeClassResource(r.id)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-[1fr_auto_2.5rem_2.5rem_2.5rem] gap-x-0 gap-y-0.5 min-w-0 w-full">
                    {classResources.map((r) => (
                      <React.Fragment key={r.id}>
                        <div className="min-w-0 flex items-center px-0.5 py-0.5 rounded-l border border-gray-600 border-r-0 bg-gray-800/80">
                          <span className="text-dnd-text-body text-sm font-medium truncate">{r.name}</span>
                        </div>
                        <div className="flex items-center justify-end px-0.5 py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                          <span className="text-white font-mono text-sm tabular-nums whitespace-nowrap">{r.current}/{r.max}</span>
                        </div>
                        <div className="flex items-center justify-center py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                          <button type="button" onClick={() => adjustClassResource(r.id, -1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="减少">
                            <Minus size={10} />
                          </button>
                        </div>
                        <div className="flex items-center justify-center py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                          <button type="button" onClick={() => adjustClassResource(r.id, 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="增加">
                            <Plus size={10} />
                          </button>
                        </div>
                        <div className="flex items-center justify-center py-0.5 rounded-r border border-gray-600 bg-gray-800/80">
                          <button type="button" onClick={() => removeClassResource(r.id)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto] gap-x-0 gap-y-0.5 min-w-0 w-full">
                {classResources.map((r) => (
                  <React.Fragment key={r.id}>
                    <div className="min-w-0 flex items-center px-0.5 py-0.5 rounded-l border border-gray-600 border-r-0 bg-gray-800/80">
                      <span className="text-dnd-text-body text-sm font-medium truncate">{r.name}</span>
                    </div>
                    <div className="flex items-center justify-end px-0.5 py-0.5 rounded-r border border-gray-600 bg-gray-800/80">
                      <span className="text-white font-mono text-sm tabular-nums whitespace-nowrap">{r.current}/{r.max}</span>
                    </div>
                  </React.Fragment>
                ))}
                {classResources.length === 0 && <span className="text-gray-500 text-sm col-span-2">—</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
