/**
 * 战斗状态（重写版）
 * 显示：HP、AC、先攻、死亡豁免、状态效果、力竭、其它职业资源、战斗手段
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Plus, Minus, Trash2, Dices, Pencil } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
import {
  abilityModifier,
  proficiencyBonus,
  getAC,
  calcMaxHP,
  getHPBuffSum,
  getACModeOptionsForCharacter,
  getEffectiveACCalculationMode,
} from '../lib/formulas'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { getBuffsFromEquipmentAndInventory } from '../lib/effects/effectMapping'
import { skillProfFactor } from '../data/dndSkills'
import { CONDITION_OPTIONS, CONDITION_DESCRIPTIONS, EXHAUSTION_DESCRIPTIONS, DAMAGE_TYPES, ABILITY_NAMES_ZH, getDamageTypeLabel, formatDamageForAttack } from '../data/buffTypes'
import { inputClass, inputClassInline } from '../lib/inputStyles'

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
import { MARTIAL_TECHNIQUES, MARTIAL_TECHNIQUE_STYLES, getMartialTechniqueById } from '../data/martialTechniques'
import MartialStyleIntroBlock from './MartialStyleIntroBlock'

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

/** 匹配 XdY / XDY / 全角ｄ 等骰子片段（不含前导加值数字） */
const WEAPON_DICE_CHUNK_RE = /\d+[dD\uFF44]\d+/gi

/**
 * 解析武器「攻击」字符串：支持多段伤害骰如 "2d8+1d6+5 贯通"
 * - diceList：全部骰段（统一小写 d）；dice：首段（兼容旧逻辑）
 * - type：去掉所有骰子与独立数值加值后的余下文案（多为伤害类型）
 */
function parseWeaponAttack(attackStr) {
  if (!attackStr || typeof attackStr !== 'string') return { dice: null, diceList: [], type: '—' }
  const s = attackStr.trim()
  if (!s || s === '—') return { dice: null, diceList: [], type: '—' }
  const rawMatches = s.match(WEAPON_DICE_CHUNK_RE)
  const diceList = rawMatches ? rawMatches.map((d) => d.replace(/\uFF44/g, 'd').replace(/D/g, 'd').toLowerCase()) : []
  const dice = diceList[0] ?? null
  let rest = s
  for (const raw of rawMatches || []) {
    rest = rest.replace(new RegExp(String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  }
  rest = rest.replace(/\s+/g, ' ').trim()
  /** 去掉与骰子混写的纯数字加值（如 2d8+1d6+5 贯通 中的 +5），保留文字类型 */
  rest = rest
    .split(/\s+/)
    .filter((tok) => tok && !/^\+*\d+$/.test(tok))
    .join(' ')
    .trim()
  const type = rest && rest !== '' ? rest : '—'
  if (diceList.length === 0) {
    return { dice: null, diceList: [], type: s }
  }
  return { dice, diceList, type }
}

/** 战斗行内展示：多骰用 + 连接，如 2D8+1D6 */
function formatWeaponAttackDiceDisplay(attackParsed) {
  const list = attackParsed?.diceList?.length
    ? attackParsed.diceList
    : attackParsed?.dice
      ? [attackParsed.dice]
      : []
  if (!list.length) return '—'
  return list.join('+').toUpperCase()
}

/**
 * 合并背包武器「攻击」与「伤害」/「附注」中的骰子（多段骰有时只写在伤害栏或附注里）
 */
function getWeaponAttackStringForParsing(weaponOpt) {
  if (!weaponOpt) return ''
  let attack = String(weaponOpt.攻击 ?? '').trim()
  const appendDiceFromText = (text) => {
    if (!text || String(text).trim() === '' || String(text).trim() === '—') return
    const extra = String(text).match(WEAPON_DICE_CHUNK_RE) || []
    for (const seg of extra) {
      const segNorm = seg.replace(/\uFF44/g, 'd').replace(/D/g, 'd').toLowerCase()
      if (!attack.toLowerCase().includes(segNorm)) {
        attack = attack ? `${attack.replace(/\s+$/, '')}+${segNorm}` : segNorm
      }
    }
  }
  appendDiceFromText(weaponOpt.伤害)
  appendDiceFromText(weaponOpt.entry?.附注)
  appendDiceFromText(weaponOpt.proto?.附注)
  return attack
}

/** 非零时输出 +N / -N；为 0 时输出空串（避免出现「2d6+」后无数字） */
function formatSignedModifier(n) {
  const m = Number(n)
  if (Number.isNaN(m) || m === 0) return ''
  return m > 0 ? `+${m}` : `${m}`
}

/**
 * 从武器背包条目的附魔 effects 读取：命中/伤害加值（仅平加值）、额外伤害骰文案
 * magicBonus 已在 enhancement 中体现，此处不重复读取 attack_melee
 */
function getWeaponEntryDamageExtras(entry) {
  if (!entry || !Array.isArray(entry.effects)) return { flatBonus: 0, extraDiceStrings: [] }
  let flatBonus = 0
  const extraDiceStrings = []
  for (const e of entry.effects) {
    if (!e) continue
    if (e.effectType === 'attack_damage_bonus') {
      const raw = e.value
      const v = typeof raw === 'object' && raw && 'val' in raw ? Number(raw.val) : Number(raw)
      if (!Number.isNaN(v)) flatBonus += v
      if (typeof raw === 'string') {
        const dmgMatch = raw.match(/伤害\s*[+＋]?\s*(\d+)/i)
        if (dmgMatch) flatBonus += parseInt(dmgMatch[1], 10) || 0
      }
    }
    if (e.effectType === 'extra_damage_dice') {
      const raw = e.value
      if (typeof raw === 'string' && raw.trim()) {
        extraDiceStrings.push(raw.trim())
      } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const line = formatDamageForAttack(raw)
        if (line) extraDiceStrings.push(line)
      }
    }
  }
  return { flatBonus, extraDiceStrings }
}

function getMergedWeaponExtraDiceStrings(cm, weaponOpt) {
  const fromMean = Array.isArray(cm?.extraDamageDice) ? [...cm.extraDamageDice] : []
  const fromEntry = weaponOpt?.entry ? getWeaponEntryDamageExtras(weaponOpt.entry).extraDiceStrings : []
  const seen = new Set()
  const out = []
  for (const d of [...fromMean, ...fromEntry]) {
    const s = typeof d === 'string' ? d.trim() : ''
    if (!s) continue
    const key = s.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/** 与主武器任一段骰+类型完全相同时不重复展示额外一行 */
function filterExtraDiceAgainstMain(attackParsed, rawDamageType, lines) {
  const mainDiceList = attackParsed?.diceList?.length
    ? attackParsed.diceList
    : attackParsed?.dice
      ? [attackParsed.dice]
      : []
  const mainLower = mainDiceList.map((x) => x.toLowerCase())
  return lines.filter((d) => {
    const p = parseWeaponAttack(d)
    const extraDice = (p.dice || '').toLowerCase()
    const sameDice = extraDice && mainLower.includes(extraDice)
    const sameType = (p.type || '').trim() === (rawDamageType || '').trim()
    return !(sameDice && sameType)
  })
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
  const acModeOptions = useMemo(() => getACModeOptionsForCharacter(char), [char?.['class'], char?.multiclass, char?.prestige])
  const acModeEffective = getEffectiveACCalculationMode(char)
  const showAcModeSelect = canEdit && acModeOptions.length > 1
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
  /** 战斗区·武技：引用武技库 id 列表 */
  const [martialSlots, setMartialSlots] = useState(() => {
    const arr = Array.isArray(char?.combatMartialTechniques) ? char.combatMartialTechniques : []
    return arr.map((m) => ({
      id: m.id ?? 'mt_' + Math.random().toString(36).slice(2),
      techniqueId: m.techniqueId || '',
    })).filter((m) => m.techniqueId)
  })
  const [showAddMartialModal, setShowAddMartialModal] = useState(false)
  const [martialSearch, setMartialSearch] = useState('')
  /** 武技库弹窗：按流派筛选，空字符串表示全部 */
  const [martialStyleFilter, setMartialStyleFilter] = useState('')

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
    const arr = Array.isArray(char?.combatMartialTechniques) ? char.combatMartialTechniques : []
    setMartialSlots(
      arr.map((m) => ({
        id: m.id ?? 'mt_' + Math.random().toString(36).slice(2),
        techniqueId: m.techniqueId || '',
      })).filter((m) => m.techniqueId)
    )
  }, [char?.id, char?.combatMartialTechniques])

  useEffect(() => {
    if (hpCurrent > maxHp) setHpCurrent(maxHp)
  }, [maxHp, hpCurrent])

  const saveCombatMartialSlots = (next) => {
    setMartialSlots(next)
    onSave({
      combatMartialTechniques: next.map((m) => ({ id: m.id, techniqueId: m.techniqueId })),
    })
  }

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
    } else {
      setAddWeaponIndex(null)
    }
    setAddDamageType('')
    setAddWeaponNameSuffix('')
    setAddWeaponExtraDice([])
    setShowWeaponExtraDiceEditor(false)
    setAddAbility('str')
    setAddWeaponProficient(true)
    setShowAddCombatMeanModal(true)
  }
  const confirmAddWeaponMean = () => {
    const patch = {
      type: 'physical',
      weaponInventoryIndex: addWeaponIndex,
      spellId: null,
      extraDamageDice: [...addWeaponExtraDice],
      abilityForAttack: addAbility,
      damageType: addDamageType || null,
      weaponProficient: addWeaponProficient,
      weaponNameSuffix: (addWeaponNameSuffix || '').trim(),
    }
    if (editingCombatMeanId) {
      updateCombatMean(editingCombatMeanId, patch)
      setEditingCombatMeanId(null)
    } else {
      saveCombatMeans([...combatMeans, { id: 'cm_' + Date.now(), ...patch }])
    }
    setShowWeaponExtraDiceEditor(false)
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
  useEffect(() => {
    if (!lastDamageRoll || typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('dnd-external-roll', { detail: lastDamageRoll }))
  }, [lastDamageRoll])
  const [addWeaponExtraDice, setAddWeaponExtraDice] = useState([]) // 添加武器时的额外伤害骰，如 ['1d6 电']
  const [addWeaponExtraCount, setAddWeaponExtraCount] = useState(1)
  const [addWeaponExtraSides, setAddWeaponExtraSides] = useState(6)
  const [addWeaponExtraType, setAddWeaponExtraType] = useState('钝击')
  /** 额外伤害骰：默认折叠，点「添加」后展开编辑（类似附魔） */
  const [showWeaponExtraDiceEditor, setShowWeaponExtraDiceEditor] = useState(false)

  /** 物理武器：汇总主伤+所有额外骰，按伤害类型分组投掷并展示 */
  const rollAllWeaponDamage = (cm, weaponOpt, attackParsed, totalDamageMod, displayDamageType, isCrit) => {
    const sources = []
    const mainDiceList = attackParsed?.diceList?.length
      ? attackParsed.diceList
      : attackParsed?.dice
        ? [attackParsed.dice]
        : []
    mainDiceList.forEach((oneDice, i) => {
      sources.push({
        dice: oneDice,
        modifier: i === 0 ? Number(totalDamageMod) || 0 : 0,
        type: displayDamageType || '钝击',
      })
    })
    const rawT = cm.damageType || attackParsed.type
    const extras = filterExtraDiceAgainstMain(attackParsed, rawT, getMergedWeaponExtraDiceStrings(cm, weaponOpt))
    extras.forEach((d) => {
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

  const filteredMartialTechniques = useMemo(() => {
    let list = martialStyleFilter
      ? MARTIAL_TECHNIQUES.filter((t) => t.style === martialStyleFilter)
      : MARTIAL_TECHNIQUES
    const q = martialSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (t) =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.style && String(t.style).toLowerCase().includes(q)) ||
        (t.type && String(t.type).toLowerCase().includes(q)) ||
        (t.id && t.id.toLowerCase().includes(q))
    )
  }, [martialSearch, martialStyleFilter])

  const openEditWeaponMean = useCallback((cm) => {
    setEditingCombatMeanId(cm.id)
    setAddWeaponIndex(cm.weaponInventoryIndex ?? null)
    setAddWeaponNameSuffix(cm.weaponNameSuffix ?? '')
    setAddAbility(cm.abilityForAttack === 'dex' ? 'dex' : cm.abilityForAttack === 'spell' ? 'spell' : 'str')
    setAddDamageType(cm.damageType ? String(cm.damageType) : '')
    setAddWeaponProficient(cm.weaponProficient !== false)
    setAddWeaponExtraDice(Array.isArray(cm.extraDamageDice) ? [...cm.extraDamageDice] : [])
    setShowWeaponExtraDiceEditor(false)
    setAddMeanStep('weapon')
    setShowAddCombatMeanModal(true)
  }, [])

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
  const baseMaxByRing = useMemo(() => {
    const out = {}
    for (let ring = 1; ring <= 9; ring++) {
      out[ring] = spellSlotsMaxOverride[ring] != null
        ? Math.max(0, Number(spellSlotsMaxOverride[ring]) || 0)
        : (maxSlotsByRing[ring] ?? 0)
    }
    return out
  }, [maxSlotsByRing, spellSlotsMaxOverride])
  const extraMaxByRing = useMemo(() => {
    const out = {}
    for (let ring = 1; ring <= 9; ring++) out[ring] = 0
    if (extraSpellSlotsMode !== 'slots') return out
    for (const e of extraSpellSlotsList) {
      const ring = Math.min(9, Math.max(1, Number(e.ring) || 1))
      out[ring] += Math.max(0, Number(e.max) || 0)
    }
    return out
  }, [extraSpellSlotsList, extraSpellSlotsMode])
  const effectiveMaxByRing = useMemo(() => {
    const out = {}
    for (let ring = 1; ring <= 9; ring++) {
      out[ring] = (baseMaxByRing[ring] ?? 0) + (extraMaxByRing[ring] ?? 0)
    }
    return out
  }, [baseMaxByRing, extraMaxByRing])
  const visibleBaseRings = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((r) => (baseMaxByRing[r] ?? 0) > 0),
    [baseMaxByRing],
  )
  const visibleExtraRings = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((r) => (extraMaxByRing[r] ?? 0) > 0),
    [extraMaxByRing],
  )
  const [spellSlotsCurrentLocal, setSpellSlotsCurrentLocal] = useState(char?.spellSlots ?? {})
  const spellSlotsSaveTimerRef = useRef(null)
  useEffect(() => {
    setSpellSlotsCurrentLocal(char?.spellSlots ?? {})
  }, [char?.spellSlots])
  useEffect(() => () => {
    if (spellSlotsSaveTimerRef.current) clearTimeout(spellSlotsSaveTimerRef.current)
  }, [])
  const saveSpellSlotsDebounced = useCallback((next) => {
    if (spellSlotsSaveTimerRef.current) clearTimeout(spellSlotsSaveTimerRef.current)
    spellSlotsSaveTimerRef.current = setTimeout(() => {
      onSave({ spellSlots: next })
      spellSlotsSaveTimerRef.current = null
    }, 140)
  }, [onSave])
  const setSpellSlotCurrentTotal = (ring, remaining) => {
    const max = effectiveMaxByRing[ring] ?? 0
    setSpellSlotsCurrentLocal((prev) => {
      const next = { ...(prev ?? {}), [ring]: Math.max(0, Math.min(max, remaining)) }
      saveSpellSlotsDebounced(next)
      return next
    })
  }
  const getSlotSplit = useCallback((ring) => {
    const baseMax = baseMaxByRing[ring] ?? 0
    const extraMax = extraMaxByRing[ring] ?? 0
    const effectiveMax = Math.max(0, baseMax + extraMax)
    const totalCur = Math.min(effectiveMax, Math.max(0, spellSlotsCurrentLocal[ring] ?? effectiveMax))
    const baseCur = Math.min(baseMax, totalCur)
    const extraCur = Math.max(0, totalCur - baseMax)
    return { baseMax, extraMax, effectiveMax, baseCur, extraCur, totalCur }
  }, [baseMaxByRing, extraMaxByRing, spellSlotsCurrentLocal])
  const setBaseSlotCurrent = (ring, remainingBase) => {
    const { extraCur, baseMax } = getSlotSplit(ring)
    const nextBase = Math.max(0, Math.min(baseMax, remainingBase))
    setSpellSlotCurrentTotal(ring, nextBase + extraCur)
  }
  const setExtraSlotCurrent = (ring, remainingExtra) => {
    const { baseCur, extraMax } = getSlotSplit(ring)
    const nextExtra = Math.max(0, Math.min(extraMax, remainingExtra))
    setSpellSlotCurrentTotal(ring, baseCur + nextExtra)
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
          className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-2 sm:p-3 min-h-[4rem] flex flex-row flex-nowrap items-center justify-center gap-1.5 sm:gap-2 min-w-0"
          title={[
            buffStats?.ac != null ? `由 Buff 计算器得出: ${acTotal}` : null,
            acResult.acFormulaNote ? `职业特性：${acResult.acFormulaNote}` : null,
            [
              acResult.acFormulaNote ? `特性基准 ${acResult.base ?? '—'}` : `基础AC ${acResult.base ?? '—'}`,
              !acResult.acFormulaNote ? `+ 敏调 ${(acResult.dexContrib ?? 0) >= 0 ? '+' : ''}${acResult.dexContrib ?? 0}` : null,
              (acResult.shieldBase ?? acResult.shield) > 0 ? `+ 盾AC ${acResult.shieldBase ?? acResult.shield}` : null,
              (acResult.shieldMagic ?? 0) > 0 ? `+ 盾牌增强 ${acResult.shieldMagic}` : null,
              (acResult.armorMagic ?? 0) > 0 ? `+ 盔甲增强 ${acResult.armorMagic}` : null,
              (acResult.outerMagic ?? 0) > 0 ? `+ 外袍 ${acResult.outerMagic}` : null,
              (acResult.other ?? 0) !== 0 ? `+ 其他 ${(acResult.other ?? 0) >= 0 ? '+' : ''}${acResult.other}` : null,
              `+ BUFF ${(acResult.buff ?? 0) >= 0 ? '+' : ''}${acResult.buff ?? 0}`,
              (buffStats?.acBonus ?? 0) !== 0 ? `+ Buff加值 ${(buffStats?.acBonus ?? 0) >= 0 ? '+' : ''}${buffStats?.acBonus}` : null,
            ].filter(Boolean).join(' → ') + ` = ${acTotal}`,
          ].filter(Boolean).join('\n')}
        >
          {showAcModeSelect ? (
            <select
              value={acModeEffective}
              onChange={(e) => onSave({ acCalculationMode: e.target.value || 'equipment' })}
              className={inputClass + ' !w-[8.75rem] max-w-[9.5rem] shrink-0 h-7 text-xs py-0 pl-2 pr-7 box-border'}
              title="AC 计算方式"
            >
              {acModeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : acModeEffective !== 'equipment' ? (
            <span className="text-xs text-gray-400 leading-tight inline-block min-w-0 max-w-[9.5rem] shrink-0 text-left whitespace-nowrap">
              {acModeOptions.find((o) => o.value === acModeEffective)?.label ?? ''}
            </span>
          ) : null}
          <div className="flex items-center justify-center gap-1 sm:gap-2 shrink-0">
            <span className="text-gray-400 text-xl sm:text-2xl font-medium">AC</span>
            <span className="text-gray-600 text-xl sm:text-2xl">|</span>
            <span className="text-white font-bold text-3xl sm:text-4xl font-mono tabular-nums">{acTotal}</span>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex items-center justify-center gap-2">
          <span className="text-gray-400 text-2xl font-medium">先攻</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{init}</span>
          <button type="button" onClick={() => openForCheck('先攻', init, { quickRoll: true })} title="投掷先攻" className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0">
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
              <button type="button" onClick={() => openForCheck('法术攻击', spellAttackBonus, { quickRoll: true })} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="投掷法术攻击">
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
          {char?.psychicCollapseEcho && (
            <div className="w-full rounded-lg border border-dnd-gold/45 bg-dnd-gold/10 px-3 py-2 text-xs">
              <p className="text-dnd-gold-light font-bold uppercase tracking-wide mb-0.5">灵崩回响 · 下回合</p>
              <p className="text-gray-300 leading-snug">
                原目标原地点再结算「{char.psychicCollapseEcho.spellName}」（{char.psychicCollapseEcho.ring}环）
                {char.psychicCollapseEcho.source === 'extraPoints' ? ' · 上次为额外点数' : ''}
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onSave({ psychicCollapseEcho: null })}
                  className="mt-1.5 touch-manipulation rounded border border-dnd-gold/40 px-2 py-1 text-[11px] text-dnd-gold-light hover:bg-dnd-gold/15"
                >
                  已执行 / 清除
                </button>
              )}
            </div>
          )}
          {/* 法术环位 | 圆点… 组间竖线；同一行内所有圆点 flex-1 均分剩余宽度 */}
          <div className="w-full">
            <div className="w-full min-w-0 flex flex-col gap-2 rounded border border-white/10 bg-[#233148]/25 p-2 sm:p-2.5 text-sm">
              <div className="flex min-w-0 w-full items-stretch gap-2 sm:gap-3">
                <div className="flex shrink-0 flex-col justify-center border-r border-white/15 pr-2 sm:pr-3">
                  <span className="text-dnd-gold-light text-xs font-bold uppercase tracking-wide sm:text-sm">法术环位</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <div
                    className="flex min-h-9 min-w-0 flex-row items-center"
                    role="group"
                    aria-label="1 至 9 环法术位，圆点均分宽度"
                  >
                    {visibleBaseRings.flatMap((ring, ringIdx) => {
                      const { baseMax: max, baseCur: cur } = getSlotSplit(ring)
                      const sep =
                        ringIdx > 0 ? (
                          <div
                            key={`sep-dot-${ring}`}
                            className="mx-0.5 h-5 w-px shrink-0 self-center bg-white/20 sm:mx-1"
                            aria-hidden
                          />
                        ) : null
                      const out = []
                      if (sep) out.push(sep)
                      const numeralClass = 'text-[8px] sm:text-[9px] tabular-nums'
                      if (canEdit) {
                        for (let i = 0; i < max; i++) {
                          const remainingIfClick = i + 1
                          const isFilled = i < cur
                          const tip =
                            remainingIfClick === 1 && cur === 1
                              ? '点击后剩余 0（实心=剩余，空心=已用）'
                              : `点击后剩余 ${remainingIfClick}/${max}（实心=剩余，空心=已用）`
                          out.push(
                            <button
                              key={`${ring}-${i}`}
                              type="button"
                              onClick={() => {
                                if (remainingIfClick === 1 && cur === 1) setBaseSlotCurrent(ring, 0)
                                else setBaseSlotCurrent(ring, remainingIfClick)
                              }}
                              className="touch-manipulation flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5"
                              title={`${ring}环 · ${tip}`}
                              aria-label={`${ring}环 · ${tip}`}
                            >
                              <span
                                className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight ${numeralClass} ${
                                  isFilled
                                    ? 'border-dnd-gold-light bg-dnd-gold/85 text-[#141820] shadow-[0_0_6px_rgba(212,184,120,0.35)]'
                                    : 'border-gray-500 bg-transparent text-gray-400'
                                }`}
                              >
                                {ring}
                              </span>
                            </button>,
                          )
                        }
                      } else {
                        for (let i = 0; i < max; i++) {
                          const isFilled = i < cur
                          out.push(
                            <div
                              key={`${ring}-${i}`}
                              className="flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5"
                              aria-hidden
                            >
                              <span
                                className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight ${numeralClass} ${
                                  isFilled
                                    ? 'border-dnd-gold-light bg-dnd-gold/85 text-[#141820]'
                                    : 'border-gray-500 bg-transparent text-gray-400'
                                }`}
                              >
                                {ring}
                              </span>
                            </div>,
                          )
                        }
                      }
                      return out
                    })}
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 w-full flex-wrap items-stretch gap-2 border-t border-white/10 pt-2 sm:gap-3">
                <div className="flex shrink-0 flex-col justify-center border-r border-white/15 pr-2 sm:pr-3">
                  <span className="text-dnd-text-muted text-xs font-bold uppercase tracking-wide sm:text-sm">额外环位</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  {extraSpellSlotsMode === 'points' && extraSpellSlotsPoints.max > 0 && (
                    <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 font-mono text-sm tabular-nums text-gray-300">
                        {extraSpellSlotsPoints.current}/{extraSpellSlotsPoints.max}
                      </span>
                      <div
                        className="flex min-h-9 min-w-0 flex-1 flex-row items-center basis-[min(100%,24rem)] sm:basis-auto"
                        role="group"
                        aria-label="额外环位点数：按环阶扣除"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((r, idx) => {
                          const numeralClass = 'text-[8px] sm:text-[9px] tabular-nums'
                          const canPay = extraSpellSlotsPoints.current >= r
                          const sep =
                            idx > 0 ? (
                              <div
                                key={`extra-sep-${r}`}
                                className="mx-0.5 h-5 w-px shrink-0 self-center bg-white/20 sm:mx-1"
                                aria-hidden
                              />
                            ) : null
                          const btn = (
                            <button
                              key={r}
                              type="button"
                              onClick={() => deductExtraSpellPoints(r)}
                              disabled={!canPay}
                              className="touch-manipulation flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5 disabled:cursor-not-allowed"
                              title={canPay ? `施放${r}环法术，扣 ${r} 点` : `点数不足（需 ${r} 点）`}
                              aria-label={canPay ? `扣除 ${r} 点施放${r}环` : `点数不足，无法施放${r}环`}
                            >
                              <span
                                className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight transition-colors ${numeralClass} ${
                                  canPay
                                    ? 'border-dnd-gold/55 bg-dnd-gold/15 text-dnd-gold-light shadow-[0_0_4px_rgba(212,184,120,0.12)] hover:border-dnd-gold-light hover:bg-dnd-gold/25'
                                    : 'border-gray-600 bg-transparent text-gray-600 opacity-70'
                                }`}
                              >
                                {r}
                              </span>
                            </button>
                          )
                          return sep ? [sep, btn] : [btn]
                        })}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setShowExtraSlotsModal(true)}
                          className="touch-manipulation shrink-0 rounded-full border border-gray-500/80 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:border-dnd-gold/40 hover:bg-gray-700/60 hover:text-dnd-gold-light"
                        >
                          设置
                        </button>
                      )}
                    </div>
                  )}
                  {extraSpellSlotsMode === 'slots' && extraSpellSlotsList.length > 0 && (
                    <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                      <div
                        className="flex min-h-9 min-w-0 flex-1 flex-row items-center basis-[min(100%,24rem)] sm:basis-auto"
                        role="group"
                        aria-label="额外环位，按环位分开展示"
                      >
                        {visibleExtraRings.flatMap((r, idx) => {
                          const { extraMax, extraCur } = getSlotSplit(r)
                          const numeralClass = 'text-[8px] sm:text-[9px] tabular-nums'
                          const sep =
                            idx > 0 ? (
                              <div
                                key={`extra-slot-sep-${r}`}
                                className="mx-0.5 h-5 w-px shrink-0 self-center bg-white/20 sm:mx-1"
                                aria-hidden
                              />
                            ) : null
                          const out = []
                          if (sep) out.push(sep)
                          for (let i = 0; i < extraMax; i++) {
                            const remainingIfClick = i + 1
                            const isFilled = i < extraCur
                            const tip =
                              remainingIfClick === 1 && extraCur === 1
                                ? '点击后额外环位剩余 0'
                                : `点击后额外环位剩余 ${remainingIfClick}/${extraMax}`
                            out.push(
                              canEdit ? (
                                <button
                                  key={`extra-slot-${r}-${i}`}
                                  type="button"
                                  onClick={() => {
                                    if (remainingIfClick === 1 && extraCur === 1) setExtraSlotCurrent(r, 0)
                                    else setExtraSlotCurrent(r, remainingIfClick)
                                  }}
                                  className="touch-manipulation flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5"
                                  title={`${r}环额外 · ${tip}`}
                                  aria-label={`${r}环额外 · ${tip}`}
                                >
                                  <span
                                    className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight ${numeralClass} ${
                                      isFilled
                                        ? 'border-sky-300 bg-sky-400/35 text-sky-100 shadow-[0_0_6px_rgba(125,211,252,0.25)]'
                                        : 'border-sky-700/70 bg-transparent text-sky-600/90'
                                    }`}
                                  >
                                    {r}
                                  </span>
                                </button>
                              ) : (
                                <div
                                  key={`extra-slot-${r}-${i}`}
                                  className="flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5"
                                  aria-hidden
                                >
                                  <span
                                    className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight ${numeralClass} ${
                                      isFilled
                                        ? 'border-sky-300 bg-sky-400/35 text-sky-100'
                                        : 'border-sky-700/70 bg-transparent text-sky-600/90'
                                    }`}
                                  >
                                    {r}
                                  </span>
                                </div>
                              ),
                            )
                          }
                          return out
                        })}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setShowExtraSlotsModal(true)}
                          className="touch-manipulation shrink-0 rounded-full border border-gray-500/80 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:border-dnd-gold/40 hover:bg-gray-700/60 hover:text-dnd-gold-light"
                        >
                          设置
                        </button>
                      )}
                    </div>
                  )}
                  {((extraSpellSlotsMode === 'slots' && extraSpellSlotsList.length === 0 && !canEdit) ||
                    (extraSpellSlotsMode === 'points' && extraSpellSlotsPoints.max === 0 && !canEdit)) && (
                    <span className="text-gray-500">—</span>
                  )}
                  {extraSpellSlotsMode === 'slots' && extraSpellSlotsList.length === 0 && canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowExtraSlotsModal(true)}
                      className="touch-manipulation shrink-0 rounded-full border border-gray-500/80 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:border-dnd-gold/40 hover:bg-gray-700/60 hover:text-dnd-gold-light"
                    >
                      设置
                    </button>
                  )}
                  {extraSpellSlotsMode === 'points' && extraSpellSlotsPoints.max === 0 && canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-500 text-sm">未启用点数额外环位</span>
                      <button
                        type="button"
                        onClick={() => setShowExtraSlotsModal(true)}
                        className="touch-manipulation shrink-0 rounded-full border border-gray-500/80 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:border-dnd-gold/40 hover:bg-gray-700/60 hover:text-dnd-gold-light"
                      >
                        设置
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : canEdit ? (
        <button type="button" onClick={() => { setShowSpellModule(true); onSave({ showSpellModule: true }); }} className="w-full mt-2 py-1.5 rounded-lg border border-dashed border-gray-500 text-gray-400 hover:bg-gray-800/50 text-sm font-bold uppercase tracking-wider">
          + 添加施法能力
        </button>
      ) : null}

      <div className="flex gap-2 mt-2 flex-col sm:flex-row sm:items-start">
        <div className="min-w-0 flex-[3] flex flex-col gap-2">
      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-2 w-full min-w-0">
        <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider mb-1">战斗手段</h3>
        <div className="space-y-2">
          {combatMeans.map((cm) => {
            const isPhysical = cm.type === 'physical'
            const isItem = cm.type === 'item'
            const itemMeanOpt = isItem && cm.itemInventoryIndex != null ? itemMeansFromInv.find((x) => x.index === cm.itemInventoryIndex) : null
            const weaponOpt = isPhysical && cm.weaponInventoryIndex != null ? weaponsFromInv.find((w) => w.index === cm.weaponInventoryIndex) : null
            const attackParsed = weaponOpt
              ? parseWeaponAttack(getWeaponAttackStringForParsing(weaponOpt))
              : { dice: null, diceList: [], type: '—' }
            const enhancement = Number(weaponOpt?.entry?.magicBonus) || 0
            const abilityKey = cm.abilityForAttack === 'spell' ? spellAbility : (cm.abilityForAttack === 'dex' ? 'dex' : 'str')
            const abilityMod = abilityModifier(effectiveAbilities?.[abilityKey] ?? 10)
            const isRanged = weaponOpt?.proto?.子类型 === '远程'
            const buffAttackBonus = isRanged ? (buffStats?.rangedAttackBonus ?? 0) : (buffStats?.meleeAttackBonus ?? 0)
            const weaponProficient = cm.weaponProficient !== false
            const physicalAttackBonus = enhancement + abilityMod + (weaponProficient ? prof : 0) + buffAttackBonus
            const damageMod = abilityMod + enhancement
            const weaponEffectFlat = weaponOpt?.entry ? getWeaponEntryDamageExtras(weaponOpt.entry).flatBonus : 0
            const totalDamageMod = damageMod + weaponEffectFlat
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
                            <button type="button" onClick={() => openForCheck((cm.spellName || '法术攻击') + ' 法术攻击', spellAttackBonus, { quickRoll: true })} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="投掷法术攻击">
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
                  <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(5.25rem,auto)] items-center gap-x-1 w-full min-w-0">
                    <div className="flex items-center gap-1 min-w-0 pr-2">
                      <span className="text-white font-medium text-sm truncate min-w-0">{(weaponOpt?.name ?? '—') + (cm.weaponNameSuffix ? String(cm.weaponNameSuffix).trim() : '')}</span>
                      {canEdit && (
                        <button type="button" onClick={() => openEditWeaponMean(cm)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title="编辑武器">
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                    {weaponOpt && (
                      (() => {
                        const isRanged = weaponOpt.proto?.子类型 === '远程'
                        const entryAttackDist = (weaponOpt.entry?.攻击距离 ?? '').toString().trim()
                        const protoAttackDist = (weaponOpt.proto?.攻击距离 ?? '').toString().trim()
                        const entryNote = (weaponOpt.entry?.附注 ?? '').trim()
                        const protoNote = (weaponOpt.proto?.附注 ?? '').trim()
                        const entryRangeMatch = entryNote.match(/(\d+\s*\/\s*\d+)/)
                        const manualRangeFromNote = entryRangeMatch ? entryRangeMatch[1].replace(/\s+/g, '') : ''
                        const { range: entryNoteRange } = parseWeaponNoteToTraits(entryNote)
                        const { range: protoNoteRange } = parseWeaponNoteToTraits(protoNote)
                        const mergedNote = (entryNote || protoNote || '').trim()
                        // 射程显示优先手动输入（装备条目）→ 词条默认（武器库）→ 近战兜底
                        const explicitRange = entryAttackDist || manualRangeFromNote || entryNoteRange || protoAttackDist || protoNoteRange
                        const rangeDisplay = explicitRange
                          ? (entryAttackDist || manualRangeFromNote || entryNoteRange || protoAttackDist || protoNoteRange || '—')
                          : (isRanged ? '—' : (/触及/.test(mergedNote) ? '触及10尺' : '触及'))
                        return (
                      <>
                        <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden">
                          <span className="text-dnd-text-muted text-sm shrink-0">射程</span>
                          <span className="text-white text-sm truncate">{rangeDisplay}</span>
                        </div>
                        <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1.5 min-w-0 overflow-hidden">
                          <span className="text-dnd-text-muted text-sm shrink-0">攻击</span>
                          <span className="text-white font-mono text-sm tabular-nums truncate">{physicalAttackBonus >= 0 ? '+' : ''}{physicalAttackBonus}</span>
                          <button type="button" onClick={() => openForCheck(weaponOpt.name + ' 攻击', physicalAttackBonus, { quickRoll: true })} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0" title="投掷攻击">
                            <Dices className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="pl-2 border-l border-gray-600 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 col-span-3">
                          <span className="text-dnd-text-muted text-sm shrink-0">伤害</span>
                          <span className="min-w-0 flex-1 font-mono text-sm tabular-nums text-white whitespace-nowrap [overflow-wrap:anywhere] sm:truncate">
                            {formatWeaponAttackDiceDisplay(attackParsed)}
                            {formatSignedModifier(totalDamageMod)} {displayDamageType}
                            {filterExtraDiceAgainstMain(attackParsed, rawDamageType, getMergedWeaponExtraDiceStrings(cm, weaponOpt)).map((d) => ` + ${d}`).join('')}
                          </span>
                          {((attackParsed.diceList?.length || attackParsed.dice)
                            || filterExtraDiceAgainstMain(attackParsed, rawDamageType, getMergedWeaponExtraDiceStrings(cm, weaponOpt)).length > 0) && (
                            <>
                              <button type="button" onClick={() => rollAllWeaponDamage(cm, weaponOpt, attackParsed, totalDamageMod, displayDamageType, false)} className="h-7 w-7 shrink-0 flex items-center justify-center rounded bg-dnd-gold hover:bg-dnd-gold-light text-white" title="投掷伤害">
                                <Dices className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => rollAllWeaponDamage(cm, weaponOpt, attackParsed, totalDamageMod, displayDamageType, true)} className="h-7 w-7 shrink-0 flex items-center justify-center rounded bg-red-700 hover:bg-red-600 text-white" title="投掷伤害（重击）">
                                <Dices className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                        <div className="flex min-w-0 items-center justify-end gap-1 pl-2 border-l border-gray-600 shrink-0">
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
                              <button type="button" onClick={() => openForCheck(spell.name + ' 法术攻击', spellAttackBonus, { quickRoll: true })} className="w-7 h-7 flex items-center justify-center rounded bg-dnd-red hover:bg-dnd-red-hover text-white" title="投掷法术攻击">
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
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-gray-500/70 bg-gray-800/40 p-2 w-full min-w-0">
        <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider mb-1">武技</h3>
        <div className="space-y-2">
          {martialSlots.length === 0 ? (
            <p className="text-dnd-text-muted text-xs">暂无武技，点击下方从武技库添加</p>
          ) : (
            martialSlots.map((slot) => {
              const tech = getMartialTechniqueById(slot.techniqueId)
              if (!tech) {
                return (
                  <div key={slot.id} className="flex items-center justify-between gap-2 rounded border border-gray-600 bg-gray-800/50 px-2 py-1.5 text-xs text-gray-500">
                    <span className="truncate">未知武技（库中无此条目）</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => saveCombatMartialSlots(martialSlots.filter((x) => x.id !== slot.id))}
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-900/40 hover:text-dnd-red"
                        title="移除"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                )
              }
              return (
                <div key={slot.id} className="space-y-0.5 rounded border border-gray-600/80 bg-gray-800/60 px-2 py-1.5">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{tech.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] text-dnd-text-muted">
                        {tech.style ? <span>{tech.style}</span> : null}
                        {tech.type ? <span className="text-dnd-gold-light/90">{tech.type}</span> : null}
                        {tech.action ? <span>{tech.action}</span> : null}
                        {tech.range ? <span>{tech.range}</span> : null}
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => saveCombatMartialSlots(martialSlots.filter((x) => x.id !== slot.id))}
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-900/40 hover:text-dnd-red"
                        title="移除"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  {tech.description ? (
                    <p className="line-clamp-4 text-[11px] leading-snug text-dnd-text-body">{tech.description}</p>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setMartialSearch('')
              setMartialStyleFilter('')
              setShowAddMartialModal(true)
            }}
            className="mt-1 w-full rounded-lg border border-dashed border-gray-500 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-400 hover:bg-gray-800/50"
          >
            + 添加武技
          </button>
        )}
      </div>

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
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => { setEditingCombatMeanId(null); setShowWeaponExtraDiceEditor(false); setShowAddCombatMeanModal(false); }}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                {addMeanStep === 'type' ? (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">添加战斗手段</h3>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => { const nextIdx = weaponsFromInv.length ? weaponsFromInv[0].index : null; setAddWeaponIndex(nextIdx); setAddDamageType(''); setShowWeaponExtraDiceEditor(false); setAddMeanStep('weapon'); }} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm">
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
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑武器' : '武器攻击'}</h3>
                    <div className="space-y-2.5 text-sm">
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">武器</label>
                        <div className="flex items-center gap-1.5 w-full min-w-0 flex-nowrap">
                          <select value={addWeaponIndex ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : parseInt(e.target.value, 10); setAddWeaponIndex(v); }} className={inputClass + ' h-8 text-xs shrink-0 max-w-[10rem]'} disabled={!canEdit} style={{ width: 'auto', minWidth: '6rem' }}>
                            <option value="">—</option>
                            {weaponsFromInv.map((w) => (
                              <option key={w.index} value={w.index}>{w.name}</option>
                            ))}
                          </select>
                          <input type="text" value={addWeaponNameSuffix} onChange={(e) => setAddWeaponNameSuffix(e.target.value)} placeholder="追加名称" className={inputClass + ' h-8 text-xs flex-1 min-w-0'} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="min-w-0">
                          <label className="block text-dnd-text-muted text-xs mb-0.5">武器所用属性</label>
                          <select value={addAbility} onChange={(e) => setAddAbility(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                            <option value="str">力量</option>
                            <option value="dex">敏捷</option>
                            <option value="spell">施法属性</option>
                          </select>
                        </div>
                        <div className="min-w-0">
                          <label className="block text-dnd-text-muted text-xs mb-0.5">伤害类型</label>
                          <select value={addDamageType} onChange={(e) => setAddDamageType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                            <option value="">—</option>
                            {DAMAGE_TYPE_OPTIONS.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={addWeaponProficient} onChange={(e) => setAddWeaponProficient(e.target.checked)} className="rounded border-gray-500" />
                        <span className="text-dnd-text-body text-xs">武器熟练</span>
                      </label>
                      <div className="w-full border-t border-gray-600/80 pt-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">额外伤害骰（可选）</label>
                          {!showWeaponExtraDiceEditor && (
                            <button
                              type="button"
                              onClick={() => setShowWeaponExtraDiceEditor(true)}
                              className="flex shrink-0 items-center gap-0.5 rounded border border-dashed border-dnd-gold/50 px-2 py-0.5 text-[10px] font-medium text-dnd-gold-light hover:bg-dnd-gold/15"
                            >
                              <Plus className="h-3 w-3" />
                              添加
                            </button>
                          )}
                        </div>
                        {addWeaponExtraDice.length > 0 && (
                          <ul className="mb-1.5 space-y-1">
                            {addWeaponExtraDice.map((d, i) => (
                              <li key={i} className="flex items-center gap-1.5 text-xs">
                                <span className="font-mono text-white">{d}</span>
                                <button type="button" onClick={() => setAddWeaponExtraDice((arr) => arr.filter((_, j) => j !== i))} className="shrink-0 rounded border border-gray-500 px-1.5 py-0.5 text-gray-400 hover:bg-gray-600">
                                  移除
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {showWeaponExtraDiceEditor && (
                          <div className="space-y-2 rounded border border-gray-600 bg-gray-700/30 p-2">
                            <p className="text-[10px] leading-snug text-dnd-text-muted">设置数量、骰面与伤害类型后，点击「加入列表」；可多次添加。</p>
                            <div className="flex w-full min-w-0 flex-wrap items-stretch gap-1.5">
                              <div className="grid min-w-0 flex-1 grid-cols-[4rem_4rem_minmax(8rem,1fr)] items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  value={addWeaponExtraCount}
                                  onChange={(e) => setAddWeaponExtraCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                  className={'input-no-spin ' + inputClassInline + ' h-8 w-full min-w-0 px-2 text-xs text-center tabular-nums'}
                                  title="骰子个数"
                                />
                                <select
                                  value={addWeaponExtraSides}
                                  onChange={(e) => setAddWeaponExtraSides(Number(e.target.value))}
                                  className={inputClassInline + ' h-8 w-full min-w-0 px-1.5 text-xs text-center'}
                                  title="骰面"
                                >
                                  <option value={4}>d4</option>
                                  <option value={6}>d6</option>
                                  <option value={8}>d8</option>
                                  <option value={12}>d12</option>
                                </select>
                                <select
                                  value={addWeaponExtraType}
                                  onChange={(e) => setAddWeaponExtraType(e.target.value)}
                                  className={inputClassInline + ' h-8 w-full min-w-0 text-xs'}
                                  title={addWeaponExtraType}
                                >
                                  {DAMAGE_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setShowWeaponExtraDiceEditor(false)}
                                className="rounded border border-gray-500 px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-700"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddWeaponExtraDice((arr) => [...arr, `${addWeaponExtraCount}d${addWeaponExtraSides} ${addWeaponExtraType}`])
                                  setShowWeaponExtraDiceEditor(false)
                                }}
                                className="rounded bg-dnd-red px-2 py-1 text-[10px] font-medium text-white hover:bg-dnd-red-hover"
                              >
                                加入列表
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => { setEditingCombatMeanId(null); setShowWeaponExtraDiceEditor(false); setAddMeanStep('type'); }} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
                      <button type="button" onClick={confirmAddWeaponMean} disabled={addWeaponIndex == null} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-xs">{editingCombatMeanId ? '保存' : '确认'}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {showAddMartialModal && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2"
              onClick={() => setShowAddMartialModal(false)}
            >
              <div
                className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl w-full max-w-md max-h-[85vh] flex flex-col min-h-0"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-dnd-gold-light text-sm font-bold mb-2 shrink-0">从武技库添加武技</h3>
                <p className="text-dnd-text-muted text-xs mb-2 shrink-0">先选流派缩小范围；下方可再按名称或类型搜索。点击一条加入战斗区（可重复添加）。</p>
                <label className="block text-dnd-text-muted text-[11px] mb-1 shrink-0">流派</label>
                <select
                  value={martialStyleFilter}
                  onChange={(e) => setMartialStyleFilter(e.target.value)}
                  className={inputClass + ' w-full h-9 text-sm mb-2 shrink-0'}
                  autoFocus
                >
                  <option value="">全部流派</option>
                  {MARTIAL_TECHNIQUE_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {martialStyleFilter ? (
                  <div className="mb-2 shrink-0 max-h-[30vh] overflow-y-auto pr-0.5">
                    <MartialStyleIntroBlock styleName={martialStyleFilter} compact />
                  </div>
                ) : null}
                <label className="block text-dnd-text-muted text-[11px] mb-1 shrink-0">搜索（可选）</label>
                <input
                  type="search"
                  value={martialSearch}
                  onChange={(e) => setMartialSearch(e.target.value)}
                  placeholder="在当前流派内搜索名称或类型…"
                  className={inputClass + ' w-full h-9 text-sm mb-2 shrink-0'}
                />
                <div className="min-h-0 flex-1 overflow-y-auto space-y-1 pr-0.5">
                  {filteredMartialTechniques.length === 0 ? (
                    <p className="text-dnd-text-muted text-xs py-2">
                      {martialStyleFilter ? '当前流派下无匹配武技，可换流派或清空搜索。' : '无匹配武技，请调整流派或搜索。'}
                    </p>
                  ) : (
                    filteredMartialTechniques.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          saveCombatMartialSlots([
                            ...martialSlots,
                            { id: 'mt_' + Math.random().toString(36).slice(2, 11), techniqueId: t.id },
                          ])
                          setShowAddMartialModal(false)
                        }}
                        className="w-full text-left rounded border border-gray-600 bg-gray-800/60 hover:border-dnd-gold/40 hover:bg-gray-800 px-2 py-1.5 text-xs text-dnd-text-body transition-colors"
                      >
                        <div className="font-medium text-white truncate">{t.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] text-dnd-text-muted">
                          {t.style ? <span>{t.style}</span> : null}
                          {t.type ? <span className="text-dnd-gold-light/90">{t.type}</span> : null}
                          {t.action ? <span>{t.action}</span> : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddMartialModal(false)}
                  className="mt-3 w-full py-2 rounded border border-gray-500 text-gray-400 hover:bg-gray-700 text-sm shrink-0"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-[1]">
          <div className="rounded-lg border border-gray-600 bg-gray-800/50 px-1.5 py-1 min-w-0 flex flex-col min-h-0">
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

