/**
 * 战斗状态（重写版）
 * 显示：HP、AC、先攻、死亡豁免、状态效果、力竭、其它职业资源、战斗手段
 */
import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Minus, Trash2, Dices, Pencil } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
import { abilityModifier, proficiencyBonus, getAC, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { getBuffsFromEquipmentAndInventory } from '../lib/effects/effectMapping'
import { skillProfFactor } from '../data/dndSkills'
import { CONDITION_OPTIONS, CONDITION_DESCRIPTIONS, EXHAUSTION_DESCRIPTIONS, DAMAGE_TYPES, ABILITY_NAMES_ZH, getDamageTypeLabel } from '../data/buffTypes'
import { inputClass } from '../lib/inputStyles'

/** 战斗手段弹窗用：伤害类型选项（与 buffTypes 统一简称）；排除 雷鸣 */
const DAMAGE_TYPE_OPTIONS = DAMAGE_TYPES.filter((d) => d.label !== '雷鸣').map((d) => ({ value: d.label, label: d.label }))
/** 伤害类型超短称（紧凑排版用，与 DAMAGE_TYPES 简称对应） */
const DAMAGE_TYPE_SHORT = { 强酸: '酸', 钝击: '钝', 寒冷: '寒', 火焰: '火', 力场: '力', 闪电: '电', 暗蚀: '暗', 穿刺: '穿', 毒素: '毒', 心灵: '心', 光耀: '光', 挥砍: '挥', 雷鸣: '雷', 贯通: '贯', 治疗: '疗' }
/** 内含法术命中判断 value -> 显示文案（与 BuffForm 一致） */
const HIT_RESOLUTION_LABELS = { dex_save: '敏捷豁免', str_save: '力量豁免', con_save: '体质豁免', wis_save: '感知豁免', int_save: '智力豁免', cha_save: '魅力豁免', spell_attack: '法术攻击' }
import { getItemById, parseWeaponNoteToTraits } from '../data/itemDatabase'
import { getSpellById, getWandScrollSpellPower, getMergedSpells } from '../data/spellDatabase'
import { getSpellcastingLevel, getMaxSpellSlotsByRing } from '../data/classDatabase'
import { getSpellcastingCombatStats } from '../lib/spellcastingStats'
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
      if (!proto || (proto.类型 !== '近战武器' && proto.类型 !== '远程武器' && proto.类型 !== '枪械')) return null
      const 攻击 = entry.攻击 ?? proto.攻击 ?? '—'
      const 伤害 = entry.伤害 ?? proto.伤害 ?? '—'
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      return { index, entry, proto, name, 攻击, 伤害 }
    })
    .filter(Boolean)
}

/** 从背包中筛出消耗品-爆炸品（类型=消耗品 子类型=爆炸品，或 类型=爆炸物），用于战斗手段 */
function getExplosivesFromInventory(inventory = []) {
  return inventory
    .map((entry, index) => {
      const proto = entry?.itemId ? getItemById(entry.itemId) : null
      if (!proto) return null
      const isExplosive = proto.类型 === '爆炸物' || (proto.类型 === '消耗品' && proto.子类型 === '爆炸品')
      if (!isExplosive) return null
      const 攻击 = (entry.攻击 ?? proto.攻击 ?? '').trim()
      const diceMatch = 攻击.match(/(\d+d\d+)/i)
      const dice = diceMatch ? diceMatch[1] : null
      const damageType = (攻击.replace(/^\d+d\d+\s*/i, '').trim() || (entry.伤害 ?? proto.伤害 ?? '—')).trim() || '—'
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      const 攻击距离 = (entry.攻击距离 ?? proto.攻击距离 ?? '').toString().trim()
      const 爆炸半径 = entry.爆炸半径 ?? proto.爆炸半径
      const qty = Math.max(0, Number(entry.qty) ?? 1)
      return { index, entry, proto, name, 攻击距离, 爆炸半径, dice, damageType, qty }
    })
    .filter(Boolean)
}

/** 从背包中筛出法器（类型=法器），用于战斗手段；充能型显示 当前/上限；魔杖/法杖/权杖均纳入 */
function getFocusItemsFromInventory(inventory = []) {
  return inventory
    .map((entry, index) => {
      const proto = entry?.itemId ? getItemById(entry.itemId) : null
      if (!proto || proto.类型 !== '法器') return null
      const chargeMax = entry.chargeMax ?? proto.充能上限
      const hasCharge = chargeMax != null && Number(chargeMax) > 0
      const 类别 = (proto.类别 ?? '').trim()
      const isWandStaffRod = /魔杖|法杖|权杖/.test(类别)
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      const charge = Math.max(0, Number(entry.charge) ?? 0)
      return { index, entry, proto, name, charge, chargeMax: hasCharge ? (Number(entry.chargeMax ?? proto.充能上限) || 0) : null, isWandStaffRod }
    })
    .filter(Boolean)
}

/** 从背包中筛出卷轴（消耗品 子类型=卷轴），用于战斗手段-道具攻击 */
function getScrollsFromInventory(inventory = []) {
  return inventory
    .map((entry, index) => {
      const proto = entry?.itemId ? getItemById(entry.itemId) : null
      if (!proto || proto.类型 !== '消耗品' || proto.子类型 !== '卷轴') return null
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      return { index, entry, proto, name }
    })
    .filter(Boolean)
}

/** 解析武器 攻击 字符串如 "1d6 穿刺"、"5+2d6 钝击" → { dice: '1d6', type: '穿刺' }；带前导加值的只取骰子与类型 */
function parseWeaponAttack(attackStr) {
  if (!attackStr || typeof attackStr !== 'string') return { dice: null, type: '—' }
  const s = attackStr.trim()
  const simple = s.match(/^(\d+d\d+)\s*(.*)$/i)
  if (simple) return { dice: simple[1], type: (simple[2] || '—').trim() || '—' }
  const withPrefix = s.match(/\d+d\d+\s*(.*)$/i)
  if (withPrefix) {
    const diceMatch = s.match(/(\d+d\d+)/i)
    return diceMatch
      ? { dice: diceMatch[1], type: (withPrefix[1] || '—').trim() || '—' }
      : { dice: null, type: s }
  }
  return { dice: null, type: s }
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
  const mergedBuffs = useMemo(() => [...(char?.buffs ?? []), ...getBuffsFromEquipmentAndInventory(char)], [char?.buffs, char?.inventory, char?.equippedHeld, char?.equippedWorn])
  const buffStats = useBuffCalculator(char, mergedBuffs)
  const acResult = getAC(char)
  const acTotal = buffStats?.ac != null ? buffStats.ac : (acResult.total + (buffStats?.acBonus ?? 0))
  const isCreatureTemplate = char?.subordinateTemplate === 'creature'
  const maxHpBase = calcMaxHP(char) + getHPBuffSum(char) + (buffStats?.maxHpBonus ?? 0)
  const maxHpMult = buffStats?.maxHpMultiplier ?? 1
  const maxHpCalculated = Math.max(1, Math.floor(maxHpBase * maxHpMult))
  /** 生物卡可手动输入生命上限，使用 char.hp.max；否则用公式计算值 */
  const maxHp = isCreatureTemplate && (char?.hp?.max != null && Number(char.hp.max) > 0)
    ? Math.max(1, Number(char.hp.max))
    : maxHpCalculated

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
      type: m.type === 'spell_attack' ? 'spell_attack' : m.type === 'spell' ? 'spell' : m.type === 'item' ? 'item' : 'physical',
      weaponInventoryIndex: m.weaponInventoryIndex ?? null,
      itemInventoryIndex: m.itemInventoryIndex ?? null,
      spellId: m.spellId ?? null,
      spellName: m.spellName ?? '',
      hitResolution: m.hitResolution ?? 'spell_attack',
      damageDice: m.damageDice ?? '',
      damageTypeSpell: m.damageTypeSpell ?? '',
      extraDamageDice: Array.isArray(m.extraDamageDice) ? m.extraDamageDice : [],
      abilityForAttack: m.abilityForAttack ?? null,
      damageType: m.damageType ?? null,
      weaponProficient: m.weaponProficient !== false,
      weaponNameSuffix: m.weaponNameSuffix ?? '',
    }))
  })
  const [showAddCombatMeanModal, setShowAddCombatMeanModal] = useState(false)
  const [editingCombatMeanId, setEditingCombatMeanId] = useState(null) // 编辑法术攻击时设为该条 id
  const [addMeanStep, setAddMeanStep] = useState('type') // 'type' | 'weapon' | 'item' | 'spell_attack'
  const [addSpellAttackName, setAddSpellAttackName] = useState('')
  const [addSpellAttackSpellId, setAddSpellAttackSpellId] = useState('')
  const [addSpellAttackHitResolution, setAddSpellAttackHitResolution] = useState('spell_attack')
  const [addSpellAttackDice, setAddSpellAttackDice] = useState('')
  const [addSpellAttackDamageType, setAddSpellAttackDamageType] = useState('')
  const [addWeaponIndex, setAddWeaponIndex] = useState(null)
  const [addWeaponNameSuffix, setAddWeaponNameSuffix] = useState('')
  const [addAbility, setAddAbility] = useState('str')
  const [addDamageType, setAddDamageType] = useState('')
  const [addWeaponProficient, setAddWeaponProficient] = useState(true)
  const [addItemIndex, setAddItemIndex] = useState(null)
  const [showSpellModule, setShowSpellModule] = useState(() => char?.showSpellModule !== false)
  const [showExtraSlotsEdit, setShowExtraSlotsEdit] = useState(false)
  const [showExtraSlotsModal, setShowExtraSlotsModal] = useState(false)
  const [explosiveUsePending, setExplosiveUsePending] = useState(null) // { inventoryIndex, name, diceExpr, damageType }
  const [focusUsePending, setFocusUsePending] = useState(null) // { inventoryIndex, name } 法器投掷待确认

  useEffect(() => {
    setShowSpellModule(char?.showSpellModule !== false)
  }, [char?.id, char?.showSpellModule])

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
      type: m.type === 'spell_attack' ? 'spell_attack' : m.type === 'spell' ? 'spell' : m.type === 'item' ? 'item' : 'physical',
      weaponInventoryIndex: m.weaponInventoryIndex ?? null,
      itemInventoryIndex: m.itemInventoryIndex ?? null,
      spellId: m.spellId ?? null,
      spellName: m.spellName ?? '',
      hitResolution: m.hitResolution ?? 'spell_attack',
      damageDice: m.damageDice ?? '',
      damageTypeSpell: m.damageTypeSpell ?? '',
      extraDamageDice: Array.isArray(m.extraDamageDice) ? m.extraDamageDice : [],
      abilityForAttack: m.abilityForAttack ?? null,
      damageType: m.damageType ?? null,
      weaponProficient: m.weaponProficient !== false,
      weaponNameSuffix: m.weaponNameSuffix ?? '',
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
        itemInventoryIndex: m.itemInventoryIndex ?? null,
        spellId: m.spellId,
        spellName: m.spellName,
        hitResolution: m.hitResolution,
        damageDice: m.damageDice,
        damageTypeSpell: m.damageTypeSpell,
        extraDamageDice: m.extraDamageDice,
      abilityForAttack: m.abilityForAttack,
      damageType: m.damageType,
      weaponProficient: m.weaponProficient,
      weaponNameSuffix: m.weaponNameSuffix,
      })),
    })
  }
  const openAddCombatMeanModal = () => {
    setEditingCombatMeanId(null)
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
    setAddWeaponNameSuffix('')
    setAddWeaponExtraDice([])
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
      extraDamageDice: [...addWeaponExtraDice],
      abilityForAttack: addAbility,
      damageType: addDamageType || null,
      weaponProficient: addWeaponProficient,
      weaponNameSuffix: (addWeaponNameSuffix || '').trim(),
    }
    saveCombatMeans([...combatMeans, newMean])
    setShowAddCombatMeanModal(false)
  }
  const confirmAddItemMean = () => {
    const newMean = {
      id: 'cm_' + Date.now(),
      type: 'item',
      weaponInventoryIndex: null,
      itemInventoryIndex: addItemIndex,
      spellId: null,
      extraDamageDice: [],
      abilityForAttack: null,
      damageType: null,
      weaponProficient: true,
    }
    saveCombatMeans([...combatMeans, newMean])
    setShowAddCombatMeanModal(false)
  }
  const confirmAddSpellAttackMean = () => {
    const name = (addSpellAttackSpellId ? (getSpellById(addSpellAttackSpellId)?.name ?? addSpellAttackName) : addSpellAttackName).trim() || '法术攻击'
    const patch = {
      type: 'spell_attack',
      spellName: name,
      hitResolution: addSpellAttackHitResolution || 'spell_attack',
      damageDice: (addSpellAttackDice || '').trim(),
      damageTypeSpell: (addSpellAttackDamageType || '').trim(),
    }
    if (editingCombatMeanId) {
      updateCombatMean(editingCombatMeanId, patch)
      setEditingCombatMeanId(null)
    } else {
      const newMean = {
        id: 'cm_' + Date.now(),
        ...patch,
        weaponInventoryIndex: null,
        itemInventoryIndex: null,
        spellId: null,
        extraDamageDice: [],
        abilityForAttack: null,
        damageType: null,
        weaponProficient: true,
      }
      saveCombatMeans([...combatMeans, newMean])
    }
    setShowAddCombatMeanModal(false)
    setAddSpellAttackName('')
    setAddSpellAttackSpellId('')
    setAddSpellAttackHitResolution('spell_attack')
    setAddSpellAttackDice('')
    setAddSpellAttackDamageType('')
  }
  const openEditSpellAttack = (cm) => {
    setEditingCombatMeanId(cm.id)
    setAddSpellAttackName(cm.spellName || '')
    setAddSpellAttackSpellId(cm.spellId || '')
    setAddSpellAttackHitResolution(cm.hitResolution || 'spell_attack')
    setAddSpellAttackDice(cm.damageDice || '')
    setAddSpellAttackDamageType(cm.damageTypeSpell || '')
    setAddMeanStep('spell_attack')
    setShowAddCombatMeanModal(true)
  }
  const consumeExplosiveAndRoll = (inventoryIndex, diceExpr, label, damageType) => {
    const inv = [...(char?.inventory ?? [])]
    const entry = inv[inventoryIndex]
    if (!entry) {
      setExplosiveUsePending(null)
      return
    }
    const qty = Math.max(0, (Number(entry.qty) ?? 1) - 1)
    inv[inventoryIndex] = { ...entry, qty }
    onSave({ inventory: inv })
    setExplosiveUsePending(null)
    if (diceExpr && /^\d+d\d+/i.test(diceExpr)) {
      const { total, rolls } = rollDice(diceExpr)
      setLastDamageRoll({ key: Date.now(), label, total, rolls, dice: diceExpr, modifier: 0 })
    }
  }
  const useFocusCharge = (inventoryIndex, displayName) => {
    const inv = [...(char?.inventory ?? [])]
    const entry = inv[inventoryIndex]
    if (!entry) {
      setFocusUsePending(null)
      return
    }
    const nextCharge = Math.max(0, (Number(entry.charge) || 0) - 1)
    inv[inventoryIndex] = { ...entry, charge: nextCharge }
    onSave({ inventory: inv })
    setFocusUsePending(null)
    const containedSpell = entry?.effects?.find((e) => e.effectType === 'contained_spell')?.value
    const cs = containedSpell && typeof containedSpell === 'object' && !Array.isArray(containedSpell) ? containedSpell : null
    const dCount = Math.max(0, Number(cs?.damageDiceCount) ?? 0)
    const dSides = Math.max(1, Number(cs?.damageDiceSides) ?? 6)
    if (dCount > 0) {
      const diceExpr = `${dCount}d${dSides}`
      const { total, rolls } = rollDice(diceExpr)
      const damageTypeLabel = cs?.damageType ? getDamageTypeLabel(cs.damageType) : ''
      const label = damageTypeLabel ? `${displayName || '魔杖'} ${damageTypeLabel}` : (displayName || '魔杖')
      setLastDamageRoll({ key: Date.now(), label, total, rolls, dice: diceExpr, modifier: 0 })
    }
  }
  /** 使用卷轴：扣 1 数量，数量为 1 时从背包移除 */
  const useScroll = (inventoryIndex) => {
    const inv = [...(char?.inventory ?? [])]
    const entry = inv[inventoryIndex]
    if (!entry) return
    const qty = Math.max(0, (Number(entry.qty) ?? 1) - 1)
    if (qty <= 0) inv.splice(inventoryIndex, 1)
    else inv[inventoryIndex] = { ...entry, qty }
    onSave({ inventory: inv })
  }
  const removeCombatMean = (id) => {
    saveCombatMeans(combatMeans.filter((m) => m.id !== id))
  }
  const updateCombatMean = (id, patch) => {
    saveCombatMeans(combatMeans.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  const [lastDamageRoll, setLastDamageRoll] = useState(null) // { byType: { [type]: { rolls, modifier } } } 或旧格式 { total, rolls, modifier }
  const [addWeaponExtraDice, setAddWeaponExtraDice] = useState([]) // 添加武器时的额外伤害骰，如 ['1d6 电']
  const [addWeaponExtraCount, setAddWeaponExtraCount] = useState(1)
  const [addWeaponExtraSides, setAddWeaponExtraSides] = useState(6)
  const [addWeaponExtraType, setAddWeaponExtraType] = useState('钝击')

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
  const explosivesFromInv = useMemo(() => getExplosivesFromInventory(char?.inventory ?? []), [char?.inventory])
  const focusFromInv = useMemo(() => getFocusItemsFromInventory(char?.inventory ?? []), [char?.inventory])
  const scrollsFromInv = useMemo(() => getScrollsFromInventory(char?.inventory ?? []), [char?.inventory])
  /** 道具攻击可选列表：消耗品（爆炸品）+ 法器（法杖/魔杖/权杖）+ 卷轴 */
  const itemMeansFromInv = useMemo(() => {
    const ex = (explosivesFromInv || []).map((e) => ({ ...e, kind: 'explosive', label: `${e.name}（消耗品）` }))
    const fo = (focusFromInv || []).filter((f) => f.chargeMax != null || f.isWandStaffRod).map((f) => ({ ...f, kind: 'focus', label: `${f.name}（法器）` }))
    const sc = (scrollsFromInv || []).map((s) => ({ ...s, kind: 'scroll', label: `${s.name}（卷轴）` }))
    return [...ex, ...fo, ...sc]
  }, [explosivesFromInv, focusFromInv, scrollsFromInv])
  const preparedSpellsList = useMemo(() => {
    const raw = char?.spells ?? []
    return raw
      .filter((s) => s.prepared)
      .map((s) => ({ spellId: s.spellId ?? s.id, spell: getSpellById(s.spellId ?? s.id) }))
      .filter((x) => x.spell)
  }, [char?.spells])
  const effectiveAbilities = buffStats?.abilities ?? abilities
  const { spellAbility, spellAttackBonus, spellDC, prof } = getSpellcastingCombatStats(char, buffStats, level, abilities)
  const spellcastingLevel = getSpellcastingLevel(char)
  const maxSlotsByRing = useMemo(() => getMaxSpellSlotsByRing(char), [char])
  const spellSlotsMaxOverride = char?.spellSlotsMax && typeof char.spellSlotsMax === 'object' ? char.spellSlotsMax : {}
  const extraSpellSlotsMode = char?.extraSpellSlotsMode === 'points' ? 'points' : 'slots'
  const extraSpellSlotsPoints = useMemo(() => {
    const p = char?.extraSpellSlotsPoints
    const max = Math.max(0, Number(p?.max) ?? 0)
    const current = Math.max(0, Math.min(max || 999, Number(p?.current) ?? max))
    return { max, current }
  }, [char?.extraSpellSlotsPoints])
  const extraSpellSlotsList = useMemo(() => {
    const raw = char?.extraSpellSlots
    if (Array.isArray(raw)) return raw.map((e) => ({ id: e.id ?? 'ex_' + Math.random().toString(36).slice(2), ring: Math.min(9, Math.max(1, Number(e.ring) || 1)), max: Math.max(0, Number(e.max) ?? 1) }))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return Object.entries(raw).filter(([, n]) => (n || 0) > 0).map(([ring, max]) => ({ id: 'ex_' + ring, ring: Number(ring) || 1, max: Number(max) || 0 }))
    }
    return []
  }, [char?.extraSpellSlots])
  const effectiveMaxByRing = useMemo(() => {
    const out = {}
    const fromExtra = extraSpellSlotsMode === 'slots' ? extraSpellSlotsList : []
    for (let ring = 1; ring <= 9; ring++) {
      const base = spellSlotsMaxOverride[ring] != null ? Math.max(0, Number(spellSlotsMaxOverride[ring]) || 0) : (maxSlotsByRing[ring] ?? 0)
      out[ring] = base + fromExtra.filter((e) => e.ring === ring).reduce((s, e) => s + (e.max || 0), 0)
    }
    return out
  }, [maxSlotsByRing, spellSlotsMaxOverride, extraSpellSlotsList, extraSpellSlotsMode])
  const spellSlotsCurrent = char?.spellSlots ?? {}
  const setSpellSlotCurrent = (ring, remaining) => {
    const max = effectiveMaxByRing[ring] ?? 0
    const next = { ...spellSlotsCurrent, [ring]: Math.max(0, Math.min(max, remaining)) }
    onSave({ spellSlots: next })
  }
  const saveExtraSpellSlots = (next) => {
    onSave({ extraSpellSlots: next.map((e) => ({ id: e.id, ring: e.ring, max: e.max })) })
  }
  const addExtraSpellSlot = () => {
    saveExtraSpellSlots([...extraSpellSlotsList, { id: 'ex_' + Date.now(), ring: 1, max: 1 }])
  }
  const removeExtraSpellSlot = (id) => {
    saveExtraSpellSlots(extraSpellSlotsList.filter((e) => e.id !== id))
  }
  const updateExtraSpellSlot = (id, patch) => {
    saveExtraSpellSlots(extraSpellSlotsList.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }
  const setExtraSpellSlotsMode = (mode) => {
    onSave({ extraSpellSlotsMode: mode })
  }
  const saveExtraSpellSlotsPoints = (max, current) => {
    const m = Math.max(0, Number(max) ?? 0)
    const c = Math.max(0, Math.min(m || 999, Number(current) ?? m))
    onSave({ extraSpellSlotsPoints: { max: m, current: c } })
  }
  const deductExtraSpellPoints = (ring) => {
    const cost = Math.min(9, Math.max(1, Number(ring) || 1))
    const next = Math.max(0, extraSpellSlotsPoints.current - cost)
    onSave({ extraSpellSlotsPoints: { ...extraSpellSlotsPoints, current: next } })
  }

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
  const deathSuccesses = dsResults.filter((r) => r === 'success').length
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

  const statusEffectDescription = useMemo(() => {
    const parts = []
    if (exhaustion > 0 && EXHAUSTION_DESCRIPTIONS[exhaustion]) parts.push(`力竭${exhaustion}：${EXHAUSTION_DESCRIPTIONS[exhaustion]}`)
    conditions.forEach((c) => { const d = CONDITION_DESCRIPTIONS[c]; if (d) parts.push(`${CONDITION_LABELS[c] ?? c}：${d}`) })
    return parts.length ? parts.join('；') : ''
  }, [exhaustion, conditions])

  const deathSaveSummaryLine = useMemo(() => {
    const parts = [`成功 ${deathSuccesses}/3 · 失败 ${deathFailures}/3`]
    if (deathSaves.lastRoll != null) parts.push(`上次 d20=${deathSaves.lastRoll.roll}`)
    return parts.join(' · ')
  }, [deathSuccesses, deathFailures, deathSaves.lastRoll])

  const DEATH_SAVE_RULE_HINT =
    'd20≥10 成功；投出 1 计两次失败；投出 20 恢复 1 HP 并清醒。累计 3 次成功伤势稳定；累计 3 次失败死亡。'

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-b from-[#243147]/35 to-[#1f2a3d]/30 p-3 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/28 to-[#222f45]/22 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1.5">生命值</h3>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-white font-bold text-xl font-mono">
            {displayCurrent} / {maxHp}
            {hasTempHp && <span className="text-blue-400 text-sm font-normal ml-1">（含 {hpTemp} 临时）</span>}
          </span>
        </div>
        <div className="h-3 rounded bg-gray-900 overflow-hidden">
          <div className={`h-full rounded transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        {canEdit && isCreatureTemplate && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-gray-400 text-sm whitespace-nowrap">生命上限</label>
            <input
              type="number"
              min={1}
              value={char?.hp?.max ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1) {
                  onSave({ hp: { current: hpCurrent, max: v, temp: hpTemp } })
                }
              }}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10)
                const safe = (isNaN(v) || v < 1) ? maxHpCalculated : v
                onSave({ hp: { current: hpCurrent, max: safe, temp: hpTemp } })
              }}
              placeholder={String(maxHpCalculated)}
              className={inputClass + ' h-8 w-24 font-mono'}
            />
          </div>
        )}
        {canEdit && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={deductVal}
                  onChange={(e) => setDeductVal(e.target.value)}
                  placeholder="输入单次扣除血量"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                />
                <button type="button" onClick={handleDeduct} className="px-3 py-1.5 rounded bg-dnd-red text-white text-sm font-medium">
                  扣除
                </button>
              </div>
            </div>
            <div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={healVal}
                  onChange={(e) => setHealVal(e.target.value)}
                  placeholder="输入单次恢复血量"
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
              <div className="flex gap-2">
                <input
                  type="number"
                  value={tempInputVal}
                  onChange={(e) => setTempInputVal(e.target.value)}
                  placeholder="输入临时血量"
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div
          className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex items-center justify-center gap-2"
          title={buffStats?.ac != null
            ? `由 Buff 计算器得出: ${acTotal}`
            : [
                `基础AC ${acResult.base ?? '—'}`,
                `+ 敏调 ${(acResult.dexContrib ?? 0) >= 0 ? '+' : ''}${acResult.dexContrib ?? 0}`,
                (acResult.shieldBase ?? acResult.shield) > 0 ? `+ 盾AC ${acResult.shieldBase ?? acResult.shield}` : null,
                (acResult.shieldMagic ?? 0) > 0 ? `+ 盾牌增强 ${acResult.shieldMagic}` : null,
                (acResult.armorMagic ?? 0) > 0 ? `+ 盔甲增强 ${acResult.armorMagic}` : null,
                (acResult.outerMagic ?? 0) > 0 ? `+ 外袍 ${acResult.outerMagic}` : null,
                (acResult.other ?? 0) !== 0 ? `+ 其他 ${(acResult.other ?? 0) >= 0 ? '+' : ''}${acResult.other}` : null,
                `+ BUFF ${(acResult.buff ?? 0) >= 0 ? '+' : ''}${acResult.buff ?? 0}`,
                (buffStats?.acBonus ?? 0) !== 0 ? `+ Buff加值 ${(buffStats?.acBonus ?? 0) >= 0 ? '+' : ''}${buffStats?.acBonus}` : null,
              ].filter(Boolean).join(' → ') + ` = ${acTotal}`}
        >
          <span className="text-gray-400 text-2xl font-medium">AC</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{acTotal}</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex items-center justify-center gap-2">
          <span className="text-gray-400 text-2xl font-medium">先攻</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{init}</span>
          <button type="button" onClick={() => openForCheck('先攻', init)} title="投掷先攻" className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0">
            <Dices className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
        <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex items-center justify-center gap-2">
          <span className="text-gray-400 text-2xl font-medium">被动察觉</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{perception}</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex items-center justify-center gap-2">
          <span className="text-gray-400 text-2xl font-medium">速度</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{speed} 尺</span>
        </div>
        <div className="col-span-2 sm:col-span-4 flex gap-2 min-w-0">
          <div className="flex-[3] min-w-0 rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 px-2 py-2 flex flex-col gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider leading-tight shrink-0">状态效果</h3>
            <div className="flex flex-col gap-2 min-h-8 overflow-hidden min-w-0">
              <div className="flex items-center gap-1 shrink-0">
                {canEdit ? (
                  <>
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
                  </>
                ) : (
                  <span className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-medium whitespace-nowrap shrink-0 ${exhaustion > 0 ? 'bg-red-900/20 ' + getExhaustionColor(exhaustion) : 'text-gray-400'}`}>
                    力竭 {exhaustion > 0 ? exhaustion : '无'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 min-w-0">
                {conditions.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-xs bg-red-900/40 text-red-200 whitespace-nowrap shrink-0"
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
                    className="px-1 py-0.5 rounded text-xs border border-gray-600 text-gray-400 hover:bg-gray-700 whitespace-nowrap shrink-0"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-[1.125rem] px-0.5 pt-2 text-xs text-gray-400 truncate border-t border-white/10 leading-tight" title={statusEffectDescription || undefined}>
              {statusEffectDescription || '\u00A0'}
            </div>
          </div>

          <div className="flex-[2] min-w-0 rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 px-2 py-2 flex flex-col gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider leading-tight shrink-0">死亡豁免</h3>
            <div className="flex flex-col gap-2 min-h-8 overflow-hidden min-w-0">
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <span className="text-gray-500 text-xs whitespace-nowrap">记录</span>
                <span className="text-emerald-400/90 text-xs font-mono tabular-nums">
                  成功 {deathSuccesses}/3
                </span>
                <span className="text-gray-600 text-xs">·</span>
                <span className="text-red-400/90 text-xs font-mono tabular-nums">
                  失败 {deathFailures}/3
                </span>
                {deathSaves.lastRoll != null && (
                  <span className="text-gray-500 text-xs whitespace-nowrap tabular-nums">
                    d20={deathSaves.lastRoll.roll}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <div className="flex items-center gap-1.5">
                  {dsResults.map((r, i) => (
                    <span
                      key={i}
                      className={`w-6 h-6 rounded-full border flex-shrink-0 box-border ${
                        r === 'success' ? 'bg-emerald-600 border-emerald-500' : r === 'failure' ? 'bg-red-600 border-red-500' : 'bg-gray-700 border-gray-600'
                      }`}
                      title={r === 'success' ? '成功' : r === 'failure' ? '失败' : '未投'}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                  <button
                    type="button"
                    onClick={rollDeathSave}
                    title="投掷死亡豁免"
                    className="w-8 h-8 min-w-8 min-h-8 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0 box-border"
                  >
                    <Dices className="w-4 h-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={resetDeathSaves}
                    title="清空死亡豁免记录"
                    className="h-8 px-2 min-h-8 flex items-center justify-center rounded text-xs border border-gray-500 text-gray-400 hover:bg-gray-700/50 shrink-0 box-border"
                  >
                    重置
                  </button>
                </div>
              </div>
            </div>
            <div
              className="min-h-[1.125rem] px-0.5 pt-2 text-xs text-gray-400 border-t border-white/10 leading-tight truncate"
              title={`${deathSaveSummaryLine}\n${DEATH_SAVE_RULE_HINT}`}
            >
              {deathSaveSummaryLine} · {DEATH_SAVE_RULE_HINT}
            </div>
          </div>
        </div>
      </div>

      {showSpellModule ? (
        <div className="w-full mt-2 rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-2 flex flex-col gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {/* 第一行：施法能力整行均分平铺，保持一行内，字号统一 */}
          <div className="flex flex-nowrap items-center justify-evenly gap-x-2 gap-y-1 min-w-0 overflow-x-auto text-sm">
            <span className="text-dnd-gold-light font-bold uppercase tracking-wider shrink-0">施法能力</span>
            <span className="border-r border-white/10 h-5 self-center shrink-0" aria-hidden />
            <span className="text-dnd-text-muted shrink-0">法术攻击加值</span>
            <span className="text-white font-mono tabular-nums shrink-0">{spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : '—'}</span>
            {spellAttackBonus != null && (
              <button type="button" onClick={() => openForCheck('法术攻击', spellAttackBonus)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="投掷法术攻击">
                <Dices className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="border-r border-white/10 h-5 self-center shrink-0" aria-hidden />
            <span className="text-dnd-text-muted shrink-0">DC</span>
            <span className="text-white font-mono tabular-nums shrink-0">{spellDC != null ? spellDC : '—'}</span>
            <span className="border-r border-white/10 h-5 self-center shrink-0" aria-hidden />
            <span className="text-dnd-text-muted shrink-0">施法属性</span>
            <span className="text-white shrink-0">{spellAbility != null ? (ABILITY_NAMES_ZH[spellAbility] ?? spellAbility) : '—'}</span>
            <span className="border-r border-white/10 h-5 self-center shrink-0" aria-hidden />
            <span className="text-dnd-text-muted shrink-0">施法者等级</span>
            <span className="text-white font-mono tabular-nums shrink-0">{spellcastingLevel}</span>
            {canEdit && (
              <button type="button" onClick={() => { setShowSpellModule(false); onSave({ showSpellModule: false }); }} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除施法能力模块">
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {/* 第二行：法术环位+额外环位占整行全宽，均分平铺；额外环位在法术环位层级下 */}
          <div className="w-full">
            <div className="w-full min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded border border-white/10 bg-[#233148]/25 p-1.5 text-sm">
              <span className="text-dnd-gold-light font-bold uppercase tracking-wider shrink-0">法术环位</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((ring) => (effectiveMaxByRing[ring] ?? 0) > 0).map((ring) => {
                  const max = effectiveMaxByRing[ring] ?? 0
                  const cur = Math.min(max, Math.max(0, spellSlotsCurrent[ring] ?? max))
                  return (
                    <span key={ring} className="inline-flex items-center gap-0.5">
                      <span className="text-gray-400">{ring}环</span>
                      {canEdit ? (
                        <span className="flex gap-0.5">
                          {Array.from({ length: max }, (_, i) => {
                            const remainingIfClick = i + 1
                            const isFilled = i < cur
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  if (remainingIfClick === 1 && cur === 1) setSpellSlotCurrent(ring, 0)
                                  else setSpellSlotCurrent(ring, remainingIfClick)
                                }}
                                className={`w-3.5 h-3.5 rounded-full border shrink-0 ${
                                  isFilled ? 'bg-dnd-gold/80 border-dnd-gold-light' : 'bg-transparent border-gray-500'
                                }`}
                                title={remainingIfClick === 1 && cur === 1 ? '点击后剩余 0（实心=剩余，空心=已用）' : `点击后剩余 ${remainingIfClick}/${max}（实心=剩余，空心=已用）`}
                              />
                            )
                          })}
                        </span>
                      ) : (
                        <span className="text-white font-mono tabular-nums text-sm">{cur}/{max}</span>
                      )}
                    </span>
                  )
                })}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].every((ring) => (effectiveMaxByRing[ring] ?? 0) === 0) && (
                  <span className="text-gray-500">—</span>
                )}
              </span>
              <span className="border-r border-white/10 h-4 self-center shrink-0" aria-hidden />
              <span className="text-dnd-text-muted shrink-0">额外环位</span>
              <span className="flex flex-wrap items-center justify-start gap-x-1.5 gap-y-1 min-w-0">
                {extraSpellSlotsMode === 'points' && extraSpellSlotsPoints.max > 0 && (
                  <>
                    <span className="text-gray-300">{extraSpellSlotsPoints.current}/{extraSpellSlotsPoints.max}</span>
                    <span className="inline-flex flex-wrap items-center gap-0.5">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => (
                        <button key={r} type="button" onClick={() => deductExtraSpellPoints(r)} disabled={extraSpellSlotsPoints.current < r} className="w-6 h-6 rounded border border-gray-500 bg-gray-800/50 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed" title={`施放${r}环法术，扣${r}点`}>−{r}</button>
                      ))}
                    </span>
                  </>
                )}
                {extraSpellSlotsMode === 'slots' && extraSpellSlotsList.length > 0 && (
                  <span className="text-gray-400">已设 {extraSpellSlotsList.length} 项</span>
                )}
                {extraSpellSlotsMode === 'slots' && extraSpellSlotsList.length === 0 && !canEdit && <span className="text-gray-500">—</span>}
                {extraSpellSlotsMode === 'points' && extraSpellSlotsPoints.max === 0 && !canEdit && <span className="text-gray-500">—</span>}
                {canEdit && (
                  <button type="button" onClick={() => setShowExtraSlotsModal(true)} className="px-1.5 py-0.5 rounded border border-gray-500 text-gray-400 hover:bg-gray-700 shrink-0">
                    设置
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      ) : canEdit ? (
        <button type="button" onClick={() => { setShowSpellModule(true); onSave({ showSpellModule: true }); }} className="w-full mt-2 py-1.5 rounded-lg border border-dashed border-gray-500 text-gray-400 hover:bg-gray-800/50 text-sm font-bold uppercase tracking-wider">
          + 添加施法能力
        </button>
      ) : null}

      <div className="flex gap-2 mt-2 flex-col sm:flex-row">
        <div className="min-w-0 flex-[3]">
      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-2 h-full">
        <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider mb-1">战斗手段</h3>
        <div className="space-y-2">
          <div className="rounded-lg border border-dashed border-gray-500 bg-gray-800/30 px-2 py-1.5 min-h-[2rem] flex items-start sm:items-center justify-between gap-1.5 flex-wrap sm:flex-nowrap">
              <div className="text-xs font-mono min-w-0 flex-1 break-words flex items-baseline gap-1.5 flex-wrap">
                {lastDamageRoll ? (
                  lastDamageRoll.byType ? (
                    <>
                      {Object.entries(lastDamageRoll.byType).map(([type, { rolls, modifier }]) => {
                        const total = (rolls?.reduce((a, b) => a + b, 0) || 0) + (modifier || 0)
                        const expr = (rolls?.length ? rolls.join('+') : '') + (modifier != null && modifier !== 0 ? (modifier >= 0 ? '+' : '') + modifier : '')
                        return (
                          <span key={type} className="text-dnd-gold-light/90">
                            <span className="text-dnd-gold-light/70">{expr}=</span>
                            <span className="text-dnd-gold-light font-bold">{total}</span>
                            <span className="text-dnd-gold-light/70">{type}</span>
                            {' '}
                          </span>
                        )
                      })}
                    </>
                  ) : (
                    <>
                      <span className="text-dnd-gold-light font-bold text-sm">{lastDamageRoll.total}</span>
                      {lastDamageRoll.rolls?.length ? (
                        <span className="text-dnd-gold-light/70">({lastDamageRoll.rolls.join('+')}{lastDamageRoll.modifier != null && lastDamageRoll.modifier !== 0 ? (lastDamageRoll.modifier >= 0 ? '+' : '') + lastDamageRoll.modifier : ''})</span>
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
            const isItem = cm.type === 'item'
            const itemMeanOpt = isItem && cm.itemInventoryIndex != null ? itemMeansFromInv.find((x) => x.index === cm.itemInventoryIndex) : null
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
            const rawDamageType = cm.damageType || attackParsed.type
            const displayDamageType = rawDamageType ? getDamageTypeLabel(rawDamageType) : '—'
            const isSpellAttack = cm.type === 'spell_attack'
            const spellOpt = !isPhysical && !isItem && !isSpellAttack && cm.spellId ? preparedSpellsList.find((p) => p.spellId === cm.spellId) : null
            const spell = spellOpt?.spell
            const spellDesc = spell?.description ?? ''
            const spellIsAttack = spellUsesAttack(spellDesc)
            const spellDamageList = spell ? parseSpellDamageFromDescription(spellDesc) : []

            /* 无效项（仅会显示 — 的模块）不渲染，避免出现空白卡片 */
            if (isItem && !itemMeanOpt) return null
            if (isPhysical && !weaponOpt) return null
            if (!isPhysical && !isItem && !isSpellAttack && !spellOpt) return null

            return (
              <div key={cm.id} className="rounded-lg border border-gray-600 bg-gray-800/80 p-2.5">
                {isItem && itemMeanOpt ? (
                  <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] items-center gap-x-1 w-full min-w-0 overflow-hidden">
                    <span className="text-white font-medium text-sm truncate pr-2 min-w-0">{itemMeanOpt.name}</span>
                    {itemMeanOpt.kind === 'explosive' ? (
                      (() => {
                        const currentEntry = char?.inventory?.[cm.itemInventoryIndex]
                        const currentQty = currentEntry != null ? Math.max(0, Number(currentEntry.qty) ?? 1) : 0
                        const c = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'
                        const e = 'pl-2 border-l border-gray-600 min-w-0 overflow-hidden'
                        return (
                          <>
                            <div className={c}><span className="text-dnd-text-muted text-sm shrink-0">抛距</span><span className="text-white text-sm truncate">{itemMeanOpt.攻击距离 || '—'}{/^\d+$/.test(String(itemMeanOpt.攻击距离 || '').trim()) ? '尺' : ''}</span></div>
                            <div className={c}><span className="text-dnd-text-muted text-sm shrink-0">爆炸半径</span><span className="text-white text-sm truncate">{itemMeanOpt.爆炸半径 != null ? `${itemMeanOpt.爆炸半径}尺` : '—'}</span></div>
                            <div className={c + ' col-span-2'}><span className="text-dnd-text-muted text-sm shrink-0">伤害</span><span className="text-white font-mono text-sm truncate whitespace-nowrap">{(itemMeanOpt.dice || '—').toUpperCase()} {itemMeanOpt.damageType || '—'}</span></div>
                            <div className={c + ' justify-center'}><span className="text-dnd-text-muted text-sm shrink-0">数量</span><span className="text-white text-sm tabular-nums">{currentQty}</span></div>
                            <div className="pl-2 border-l border-gray-600 flex items-center justify-end gap-1 shrink-0 min-w-0">
                              {itemMeanOpt.dice && currentQty > 0 && (
                                <button type="button" onClick={() => setExplosiveUsePending({ inventoryIndex: itemMeanOpt.index, name: itemMeanOpt.name, diceExpr: itemMeanOpt.dice, damageType: itemMeanOpt.damageType })} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-gold hover:bg-dnd-gold-light text-white shrink-0" title="投掷伤害（使用后扣 1 数量）">
                                  <Dices className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canEdit && (
                                <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </>
                        )
                      })()
                    ) : itemMeanOpt.kind === 'scroll' ? (
                      (() => {
                        const currentEntry = char?.inventory?.[cm.itemInventoryIndex]
                        const currentQty = currentEntry != null ? Math.max(0, Number(currentEntry.qty) ?? 1) : 0
                        const c = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'
                        const e = 'pl-2 border-l border-gray-600 min-w-0 overflow-hidden'
                        return (
                          <>
                            <div className={e} />
                            <div className={e} />
                            <div className={e} />
                            <div className={e} />
                            <div className={e} />
                            <div className={c + ' justify-center'}><span className="text-dnd-text-muted text-sm shrink-0">数量</span><span className="text-white text-sm tabular-nums">{currentQty}张</span></div>
                            <div className="pl-2 border-l border-gray-600 flex items-center justify-end gap-1 shrink-0 min-w-0">
                              {currentQty > 0 && (
                                <button type="button" onClick={() => useScroll(itemMeanOpt.index)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="使用（消耗 1 张）">
                                  <Dices className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canEdit && (
                                <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </>
                        )
                      })()
                    ) : (() => {
                      const currentEntry = char?.inventory?.[cm.itemInventoryIndex]
                      const currentCharge = currentEntry != null ? Math.max(0, Number(currentEntry.charge) ?? 0) : 0
                      const chargeMaxRaw = itemMeanOpt.chargeMax ?? currentEntry?.chargeMax ?? 0
                      const chargeMax = chargeMaxRaw > 0 ? chargeMaxRaw : (currentCharge > 0 ? currentCharge : 0)
                      const containedSpell = currentEntry?.effects?.find((e) => e.effectType === 'contained_spell')?.value
                      const cs = containedSpell && typeof containedSpell === 'object' && !Array.isArray(containedSpell) ? containedSpell : null
                      const level = Math.max(0, Math.min(9, Number(cs?.level) ?? 0))
                      const power = getWandScrollSpellPower(level)
                      const hitRes = cs?.hitResolution && HIT_RESOLUTION_LABELS[cs.hitResolution] ? cs.hitResolution : 'dex_save'
                      const hitLabel = HIT_RESOLUTION_LABELS[hitRes]
                      const hitValue = hitRes === 'spell_attack' ? (power.attackBonus >= 0 ? '+' : '') + power.attackBonus : power.dc
                      const hitText = hitRes === 'spell_attack' ? `${hitLabel} ${hitValue}` : `${hitLabel} DC ${hitValue}`
                      const dCount = Math.max(0, Number(cs?.damageDiceCount) ?? 0)
                      const dSides = Math.max(1, Number(cs?.damageDiceSides) ?? 6)
                      const damageDiceText = dCount > 0 ? `${dCount}d${dSides}` : ''
                      const damageTypeLabel = cs?.damageType ? getDamageTypeLabel(cs.damageType) : ''
                      const damageText = damageDiceText ? (damageTypeLabel ? `${damageDiceText} ${damageTypeLabel}` : damageDiceText) : '—'
                      const spellRange = (cs?.range != null && String(cs.range).trim() !== '') ? (String(cs.range).trim() + (/^\d+$/.test(String(cs.range).trim()) ? '尺' : '')) : '—'
                      const cell = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'
                      const empty = 'pl-2 border-l border-gray-600 min-w-0 overflow-hidden'
                      return (
                        <>
                          <div className={cell}><span className="text-dnd-text-muted text-sm shrink-0">距离</span><span className="text-white text-sm truncate">{spellRange}</span></div>
                          <div className={cell}><span className="text-white text-sm truncate">{hitText || '—'}</span></div>
                          <div className={cell + ' col-span-2'}><span className="text-dnd-text-muted text-sm shrink-0">伤害</span><span className="text-white font-mono text-sm truncate whitespace-nowrap">{damageText}</span></div>
                          <div className={cell + ' justify-center'}><span className="text-dnd-text-muted text-sm shrink-0">充能</span><span className="text-white font-mono text-sm truncate">{currentCharge}/{chargeMax}</span></div>
                          <div className="pl-2 border-l border-gray-600 flex items-center justify-end gap-1 shrink-0 min-w-0">
                            {currentCharge > 0 && (
                              <button type="button" onClick={() => setFocusUsePending({ inventoryIndex: itemMeanOpt.index, name: itemMeanOpt.name })} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="投掷（确认后扣 1 充能）">
                                <Dices className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canEdit && (
                              <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                ) : isSpellAttack ? (
                  (() => {
                    const hitRes = cm.hitResolution && HIT_RESOLUTION_LABELS[cm.hitResolution] ? cm.hitResolution : 'spell_attack'
                    const hitLabel = HIT_RESOLUTION_LABELS[hitRes]
                    const hitValue = hitRes === 'spell_attack' ? (spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : null) : (spellDC != null ? spellDC : null)
                    /** 战斗手段行内空间有限，法术攻击用简称「法攻」避免截断 */
                    const hitLabelShort = hitRes === 'spell_attack' ? '法攻' : hitLabel
                    const hitText = hitRes === 'spell_attack' ? (hitValue != null ? `${hitLabelShort} ${hitValue}` : '—') : (hitValue != null ? `${hitLabel} DC ${hitValue}` : '—')
                    const damageText = (cm.damageDice || '').trim() ? ((cm.damageDice || '').toUpperCase() + (cm.damageTypeSpell ? ' ' + getDamageTypeLabel(cm.damageTypeSpell) : '')) : '—'
                    const cell = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'
                    const empty = 'pl-2 border-l border-gray-600 min-w-0 overflow-hidden'
                    return (
                      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] items-center gap-x-1 w-full min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1 min-w-0 pr-2">
                          <span className="text-white font-medium text-sm truncate min-w-0">{cm.spellName || '法术攻击'}</span>
                          {canEdit && (
                            <button type="button" onClick={() => openEditSpellAttack(cm)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title="编辑法术">
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                        <div className={empty}><span className="text-dnd-text-muted text-sm shrink-0">距离</span><span className="text-white text-sm truncate">—</span></div>
                        <div className={cell + ' flex items-center gap-x-1.5 min-w-0'}>
                          <span className="text-white text-sm truncate min-w-0">{hitText}</span>
                          {hitRes === 'spell_attack' && spellAttackBonus != null && (
                            <button type="button" onClick={() => openForCheck((cm.spellName || '法术攻击') + ' 法术攻击', spellAttackBonus)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="投掷法术攻击">
                              <Dices className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className={cell + ' col-span-2'}><span className="text-dnd-text-muted text-sm shrink-0">伤害</span><span className="text-white font-mono text-sm truncate whitespace-nowrap">{damageText}</span></div>
                        <div className={empty} />
                        <div className="pl-2 border-l border-gray-600 flex items-center justify-end gap-1 shrink-0 min-w-0">
                          {(cm.damageDice || '').trim() && (
                            <>
                              <button type="button" onClick={() => rollDamageDice((cm.damageDice || '').trim(), (cm.spellName || '法术') + ' ' + (getDamageTypeLabel(cm.damageTypeSpell) || ''), 'spell_attack-' + cm.id)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-gold hover:bg-dnd-gold-light text-white shrink-0" title="投掷伤害">
                                <Dices className="w-3.5 h-3.5" />
                              </button>
                              {hitRes === 'spell_attack' && (
                                <button type="button" onClick={() => rollDamageDice((cm.damageDice || '').trim(), (cm.spellName || '法术') + ' ' + (getDamageTypeLabel(cm.damageTypeSpell) || ''), 'spell_attack-' + cm.id, 0, true)} className="w-7 h-7 flex items-center justify-center rounded bg-red-700 hover:bg-red-600 text-white text-sm font-bold shrink-0 leading-none" title="投掷伤害（重击）">
                                  重
                                </button>
                              )}
                            </>
                          )}
                          {canEdit && (
                            <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })()
                ) : isPhysical ? (
                  <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] items-center gap-x-1 w-full min-w-0 overflow-hidden">
                    <span className="text-white font-medium text-sm truncate pr-2 min-w-0">{(weaponOpt?.name ?? '—') + (cm.weaponNameSuffix ? String(cm.weaponNameSuffix).trim() : '')}</span>
                    {weaponOpt && (
                      (() => {
                        const isRanged = weaponOpt.proto?.子类型 === '远程'
                        const attackDist = (weaponOpt.entry?.攻击距离 ?? weaponOpt.proto?.攻击距离)?.toString?.()?.trim()
                        const weaponNote = (weaponOpt.entry?.附注 ?? weaponOpt.proto?.附注 ?? '').trim()
                        const { range: noteRange } = parseWeaponNoteToTraits(weaponNote)
                        const 附注 = weaponNote
                        const hasExplicitRange = attackDist || noteRange
                        const rangeDisplay = hasExplicitRange
                          ? (attackDist || noteRange || '—')
                          : (isRanged ? '—' : (/触及/.test(附注) ? '触及10尺' : '触及'))
                        return (
                      <>
                        <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden">
                          <span className="text-dnd-text-muted text-sm shrink-0">射程</span>
                          <span className="text-white text-sm truncate">{rangeDisplay}</span>
                        </div>
                        <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1.5 min-w-0 overflow-hidden">
                          <span className="text-dnd-text-muted text-sm shrink-0">攻击</span>
                          <span className="text-white font-mono text-sm tabular-nums truncate">{physicalAttackBonus >= 0 ? '+' : ''}{physicalAttackBonus}</span>
                          <button type="button" onClick={() => openForCheck(weaponOpt.name + ' 攻击', physicalAttackBonus)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="投掷攻击">
                            <Dices className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden flex-nowrap col-span-3">
                          <span className="text-dnd-text-muted text-sm shrink-0">伤害</span>
                          <span className="text-white font-mono text-sm tabular-nums truncate shrink-0 whitespace-nowrap">
                            {(attackParsed.dice ?? '—').toUpperCase()}{damageMod >= 0 ? '+' : ''}{damageMod !== 0 ? damageMod : ''} {displayDamageType}
                          </span>
                          {(cm.extraDamageDice || [])
                            .filter((d) => {
                              const p = parseWeaponAttack(d)
                              const mainDice = (attackParsed.dice || '').toLowerCase()
                              const extraDice = (p.dice || '').toLowerCase()
                              const sameDice = mainDice && extraDice && mainDice === extraDice
                              const sameType = (p.type || '').trim() === (rawDamageType || '').trim()
                              return !(sameDice && sameType)
                            })
                            .map((d, i) => (
                              <span key={i} className="text-white font-mono text-sm shrink-0">{d}</span>
                            ))}
                        </div>
                        <div className="pl-2 border-l border-gray-600 flex items-center justify-end gap-1 shrink-0 min-w-0">
                          {(attackParsed.dice || (cm.extraDamageDice?.length ?? 0) > 0) && (
                            <>
                              <button type="button" onClick={() => rollAllWeaponDamage(cm, weaponOpt, attackParsed, damageMod, displayDamageType, false)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-gold hover:bg-dnd-gold-light text-white shrink-0" title="投掷伤害">
                                <Dices className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => rollAllWeaponDamage(cm, weaponOpt, attackParsed, damageMod, displayDamageType, true)} className="w-7 h-7 flex items-center justify-center rounded bg-red-700 hover:bg-red-600 text-white shrink-0" title="投掷伤害（重击）">
                                <Dices className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {canEdit && (
                            <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </>
                        )
                      })()
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
                                <button type="button" onClick={() => rollDamageDice(d.dice, spell.name + ' ' + d.type, 'spell-' + cm.id + '-' + i)} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-gold hover:bg-dnd-gold-light text-white" title="投掷伤害">
                                  <Dices className="w-3.5 h-3.5" />
                                </button>
                                {spellIsAttack && (
                                  <button type="button" onClick={() => rollDamageDice(d.dice, spell.name + ' ' + d.type, 'spell-' + cm.id + '-' + i, 0, true)} className="w-7 h-7 flex items-center justify-center rounded bg-red-700 hover:bg-red-600 text-white text-sm font-bold shrink-0 leading-none" title="投掷伤害（重击）">
                                    重
                                  </button>
                                )}
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

          {explosiveUsePending && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={() => setExplosiveUsePending(null)}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-dnd-gold-light text-sm font-bold mb-2">是否使用？</h3>
                <p className="text-gray-300 text-sm mb-3">使用将消耗 1 数量，并投掷伤害。</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setExplosiveUsePending(null)} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">取消</button>
                  <button type="button" onClick={() => consumeExplosiveAndRoll(explosiveUsePending.inventoryIndex, explosiveUsePending.diceExpr, explosiveUsePending.name + ' ' + (getDamageTypeLabel(explosiveUsePending.damageType) || ''), explosiveUsePending.damageType)} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-sm">使用</button>
                </div>
              </div>
            </div>
          )}
          {focusUsePending && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={() => setFocusUsePending(null)}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-dnd-gold-light text-sm font-bold mb-2">是否使用？</h3>
                <p className="text-gray-300 text-sm mb-3">使用将消耗 1 充能。</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFocusUsePending(null)} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">取消</button>
                  <button type="button" onClick={() => useFocusCharge(focusUsePending.inventoryIndex, focusUsePending.name)} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-sm">使用</button>
                </div>
              </div>
            </div>
          )}
          {showExtraSlotsModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowExtraSlotsModal(false)}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-md w-full mx-2 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-dnd-gold-light text-sm font-bold mb-3">额外环位设置</h3>
                <div className="inline-flex rounded border border-gray-600 bg-gray-800/50 p-0.5 text-xs mb-3">
                  <button type="button" onClick={() => setExtraSpellSlotsMode('slots')} className={`px-3 py-1.5 rounded ${extraSpellSlotsMode === 'slots' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>按环位</button>
                  <button type="button" onClick={() => setExtraSpellSlotsMode('points')} className={`px-3 py-1.5 rounded ${extraSpellSlotsMode === 'points' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>按点数</button>
                </div>
                {extraSpellSlotsMode === 'points' && (
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-500 text-xs">输入总点数，施法时 1 环扣 1 点、2 环扣 2 点，以此类推。</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-400">上限</span>
                      <input type="number" min={0} value={extraSpellSlotsPoints.max || ''} onChange={(ev) => saveExtraSpellSlotsPoints(ev.target.value === '' ? 0 : parseInt(ev.target.value, 10), extraSpellSlotsPoints.current)} className={inputClass + ' w-20 h-8 text-center text-sm'} placeholder="0" />
                      <span className="text-gray-400">剩余</span>
                      <input type="number" min={0} value={extraSpellSlotsPoints.current} onChange={(ev) => saveExtraSpellSlotsPoints(extraSpellSlotsPoints.max, ev.target.value === '' ? 0 : parseInt(ev.target.value, 10))} className={inputClass + ' w-20 h-8 text-center text-sm'} />
                    </div>
                    {extraSpellSlotsPoints.max > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => (
                          <button key={r} type="button" onClick={() => deductExtraSpellPoints(r)} disabled={extraSpellSlotsPoints.current < r} className="w-8 h-8 rounded border border-gray-500 bg-gray-800/50 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs" title={`施放${r}环扣${r}点`}>−{r}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {extraSpellSlotsMode === 'slots' && (
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-500 text-xs">为各环位分别设置额外数量，与法术环位合并显示。</p>
                    <div className="flex flex-col gap-2">
                      {extraSpellSlotsList.map((e) => (
                        <div key={e.id} className="inline-flex items-center gap-2">
                          <select value={e.ring} onChange={(ev) => updateExtraSpellSlot(e.id, { ring: Number(ev.target.value) })} className={inputClass + ' h-8 w-24 text-sm'} title={`${e.ring}环`}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => (
                              <option key={r} value={r}>{r}环</option>
                            ))}
                          </select>
                          <span className="text-gray-500">上限</span>
                          <input type="number" min={1} value={e.max} onChange={(ev) => updateExtraSpellSlot(e.id, { max: Math.max(1, parseInt(ev.target.value, 10) || 1) })} className={inputClass + ' w-16 h-8 text-center text-sm'} />
                          <button type="button" onClick={() => removeExtraSpellSlot(e.id)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => addExtraSpellSlot()} className="mt-1 px-2 py-1 rounded border border-dashed border-gray-500 text-gray-400 hover:bg-gray-700 text-xs">
                      + 添加一项
                    </button>
                  </div>
                )}
                <button type="button" onClick={() => setShowExtraSlotsModal(false)} className="mt-4 w-full py-2 rounded border border-gray-500 text-gray-400 hover:bg-gray-700 text-sm">
                  关闭
                </button>
              </div>
            </div>
          )}
          {showAddCombatMeanModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => { setEditingCombatMeanId(null); setShowAddCombatMeanModal(false); }}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                {addMeanStep === 'type' ? (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">添加战斗手段</h3>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => { const nextIdx = weaponsFromInv.length ? weaponsFromInv[0].index : null; setAddWeaponIndex(nextIdx); const w = weaponsFromInv.find((x) => x.index === nextIdx); setAddDamageType(w ? (parseWeaponAttack(w.攻击).type || '') : ''); setAddMeanStep('weapon'); }} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm">
                        武器攻击
                      </button>
                      <button type="button" onClick={() => { const first = itemMeansFromInv[0]; setAddItemIndex(first ? first.index : null); setAddMeanStep('item'); }} disabled={itemMeansFromInv.length === 0} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm">
                        道具攻击
                      </button>
                      <button type="button" onClick={() => { setAddSpellAttackName(''); setAddSpellAttackSpellId(''); setAddSpellAttackHitResolution('spell_attack'); setAddSpellAttackDice(''); setAddSpellAttackDamageType(''); setAddMeanStep('spell_attack'); }} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm">
                        法术攻击
                      </button>
                    </div>
                    {itemMeansFromInv.length === 0 && <p className="text-dnd-text-muted text-xs mt-1">背包中暂无消耗品、法器（法杖/魔杖/权杖）或卷轴时，道具攻击不可选。</p>}
                    <button type="button" onClick={() => setShowAddCombatMeanModal(false)} className="mt-3 w-full py-1.5 rounded border border-gray-500 text-gray-400 text-xs">取消</button>
                  </>
                ) : addMeanStep === 'spell_attack' ? (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑法术' : '法术攻击'}</h3>
                    <p className="text-dnd-text-muted text-xs mb-2">输入法术名查找并选择，设置命中判定与伤害。</p>
                    <div className="space-y-2.5 text-sm">
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">法术名</label>
                        <input
                          type="text"
                          value={addSpellAttackName}
                          onChange={(e) => {
                            const name = e.target.value
                            setAddSpellAttackName(name)
                            if (!name.trim()) {
                              setAddSpellAttackSpellId('')
                              return
                            }
                            const spell = getMergedSpells().find((s) => s.name && s.name.trim() === name.trim())
                            if (spell) {
                              setAddSpellAttackSpellId(spell.id)
                              const damages = parseSpellDamageFromDescription(spell.description ?? '')
                              const first = damages[0]
                              if (first) {
                                setAddSpellAttackDice(first.dice || '')
                                setAddSpellAttackDamageType(first.type || '')
                              }
                            } else {
                              setAddSpellAttackSpellId('')
                            }
                          }}
                          placeholder="输入以查找"
                          className={inputClass + ' w-full h-8 text-xs'}
                          list="spell-attack-spell-list"
                        />
                        <datalist id="spell-attack-spell-list">
                          {getMergedSpells()
                            .filter((s) => !addSpellAttackName.trim() || (s.name && s.name.toLowerCase().includes(addSpellAttackName.trim().toLowerCase())))
                            .slice(0, 80)
                            .map((s) => (
                              <option key={s.id} value={s.name} />
                            ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">命中判定</label>
                        <select value={addSpellAttackHitResolution} onChange={(e) => setAddSpellAttackHitResolution(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          {Object.entries(HIT_RESOLUTION_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">伤害骰</label>
                        <input type="text" value={addSpellAttackDice} onChange={(e) => setAddSpellAttackDice(e.target.value)} placeholder="如 2d6" className={inputClass + ' w-full h-8 text-xs font-mono'} />
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">伤害类型</label>
                        <select value={addSpellAttackDamageType} onChange={(e) => setAddSpellAttackDamageType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          <option value="">—</option>
                          {DAMAGE_TYPE_OPTIONS.map((d) => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => { setEditingCombatMeanId(null); setAddMeanStep('type'); }} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
                      <button type="button" onClick={confirmAddSpellAttackMean} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-xs">{editingCombatMeanId ? '保存' : '保存'}</button>
                    </div>
                  </>
                ) : addMeanStep === 'item' ? (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">道具攻击</h3>
                    <p className="text-dnd-text-muted text-xs mb-2">从背包中的消耗品（爆炸品）、法器（法杖/魔杖/权杖）或卷轴选择一项。</p>
                    <div className="space-y-2.5 text-sm">
                      <label className="block text-dnd-text-muted text-xs mb-0.5">道具</label>
                      <select value={addItemIndex ?? ''} onChange={(e) => setAddItemIndex(e.target.value === '' ? null : parseInt(e.target.value, 10))} className={inputClass + ' w-full h-8 text-xs'}>
                        <option value="">—</option>
                        {itemMeansFromInv.map((it) => (
                          <option key={it.index} value={it.index}>{it.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => setAddMeanStep('type')} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
                      <button type="button" onClick={confirmAddItemMean} disabled={addItemIndex == null} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-xs">确认</button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">武器攻击</h3>
                    <div className="space-y-2.5 text-sm">
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">武器</label>
                        <div className="flex items-center gap-1.5 w-full min-w-0 flex-nowrap">
                          <select value={addWeaponIndex ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : parseInt(e.target.value, 10); setAddWeaponIndex(v); const w = weaponsFromInv.find((x) => x.index === v); if (w) setAddDamageType(parseWeaponAttack(w.攻击).type || addDamageType); }} className={inputClass + ' h-8 text-xs shrink-0 max-w-[10rem]'} disabled={!canEdit} style={{ width: 'auto', minWidth: '6rem' }}>
                            <option value="">—</option>
                            {weaponsFromInv.map((w) => (
                              <option key={w.index} value={w.index}>{w.name}</option>
                            ))}
                          </select>
                          <input type="text" value={addWeaponNameSuffix} onChange={(e) => setAddWeaponNameSuffix(e.target.value)} placeholder="追加名称" className={inputClass + ' h-8 text-xs flex-1 min-w-0'} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">武器所用属性</label>
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
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">额外攻击投掷</label>
                        {addWeaponExtraDice.length > 0 && (
                          <ul className="space-y-1 mb-1.5">
                            {addWeaponExtraDice.map((d, i) => (
                              <li key={i} className="flex items-center gap-1.5 text-xs">
                                <span className="text-white font-mono">{d}</span>
                                <button type="button" onClick={() => setAddWeaponExtraDice((arr) => arr.filter((_, j) => j !== i))} className="px-1.5 py-0.5 rounded border border-gray-500 text-gray-400 hover:bg-gray-600 shrink-0">移除</button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input type="number" min={1} value={addWeaponExtraCount} onChange={(e) => setAddWeaponExtraCount(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-8 w-12 text-xs text-center'} />
                          <span className="text-dnd-text-muted text-xs">d</span>
                          <select value={addWeaponExtraSides} onChange={(e) => setAddWeaponExtraSides(Number(e.target.value))} className={inputClass + ' h-8 text-xs w-16'}>
                            <option value={4}>D4</option>
                            <option value={6}>D6</option>
                            <option value={8}>D8</option>
                            <option value={12}>D12</option>
                          </select>
                          <select value={addWeaponExtraType} onChange={(e) => setAddWeaponExtraType(e.target.value)} className={inputClass + ' h-8 text-xs min-w-0'} style={{ width: '5.5rem' }}>
                            {DAMAGE_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => { setAddWeaponExtraDice((arr) => [...arr, `${addWeaponExtraCount}d${addWeaponExtraSides} ${addWeaponExtraType}`]); }} className="px-2 py-1 rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-xs">添加</button>
                        </div>
                      </div>
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

