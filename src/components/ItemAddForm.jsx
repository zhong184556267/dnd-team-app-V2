/**
 * 物品添加弹窗：在 BUFF 添加逻辑基础上改造
 * 1. 选择物品类型 → 获得基础信息（重量、简介、名字）
 * 2. 可修改名字、简介
 * 3. 可增减的效果模块（同 BUFF 式添加/删除）
 * 4. 数量 -/+
 * 生成新物品条目，由调用方写入背包或仓库
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { getItemListGrouped, getItemById, getItemDisplayName, parseWeaponNoteToTraits, buildWeaponNoteFromTraits, WEAPON_TRAIT_OPTIONS, WEAPON_MASTERY_OPTIONS } from '../data/itemDatabase'
import { inputClass, textareaClass } from '../lib/inputStyles'
import { useModule } from '../contexts/ModuleContext'
import { BUFF_TYPES, getCategories, normalizeEffectCategory, parseDamageString, formatDamageForAttack } from '../data/buffTypes'
import { EffectValueEditor, isComplexValueType, DamageDiceInlineRow, NumberStepper } from './BuffForm'

/** 从护甲/衣服附注解析为可编辑字段（先匹配护甲基础再匹配盾牌，与 formulas 一致） */
function parseArmorNoteToFields(note) {
  const empty = { isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' }
  if (!note || typeof note !== 'string') return empty
  const s = note.trim()
  if (!s) return empty
  // 护甲：AC 14+敏捷(最大2)
  const armorDexCapMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷\s*[（(]\s*最大\s*(\d+)\s*[）)]/i)
  if (armorDexCapMatch) {
    return { ...empty, baseAC: armorDexCapMatch[1], dexMode: 'cap', dexCap: parseInt(armorDexCapMatch[2], 10) || 2, strReq: (s.match(/力量\s*(\d+)/i) || [])[1] || '', stealth: /隐匿\s*劣势/i.test(s) ? '劣势' : '—' }
  }
  // 护甲：AC 14+敏捷
  const armorDexMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷/i)
  if (armorDexMatch) {
    return { ...empty, baseAC: armorDexMatch[1], dexMode: 'full', strReq: (s.match(/力量\s*(\d+)/i) || [])[1] || '', stealth: /隐匿\s*劣势/i.test(s) ? '劣势' : '—' }
  }
  // 护甲：AC 14（不加敏捷）
  const armorFixedMatch = s.match(/AC\s*(\d+)(?:\s*[;；]|\s*$)/i)
  if (armorFixedMatch) {
    return { ...empty, baseAC: armorFixedMatch[1], dexMode: 'none', strReq: (s.match(/力量\s*(\d+)/i) || [])[1] || '', stealth: /隐匿\s*劣势/i.test(s) ? '劣势' : '—' }
  }
  // 盾牌：AC +2
  const shieldMatch = s.match(/AC\s*\+\s*(\d+)/i)
  if (shieldMatch) {
    return { ...empty, isShield: true, shieldBonus: shieldMatch[1] }
  }
  return empty
}

/** 根据护甲/衣服字段构建附注字符串 */
function buildArmorNoteFromFields(fields) {
  if (!fields) return ''
  if (fields.isShield) {
    const n = fields.shieldBonus === '' ? '2' : String(fields.shieldBonus)
    return `AC +${n}；力量—；隐匿—`
  }
  const base = fields.baseAC === '' ? '10' : String(fields.baseAC)
  let acPart = `AC ${base}`
  if (fields.dexMode === 'full') acPart += '+敏捷'
  else if (fields.dexMode === 'cap') acPart += `+敏捷（最大${fields.dexCap ?? 2}）`
  const strPart = fields.strReq === '' ? '—' : fields.strReq
  const stealthPart = fields.stealth === '劣势' ? '劣势' : '—'
  return `${acPart}；力量${strPart}；隐匿${stealthPart}`
}

function createEmptyModule() {
  const firstCat = getCategories()[0]?.key ?? 'ability'
  const firstEffect = BUFF_TYPES[firstCat]?.effects?.[0]?.key ?? 'ability_score'
  return {
    id: 'm_' + Math.random().toString(36).slice(2),
    category: firstCat,
    effectType: firstEffect,
    value: 0,
    customText: '',
    collapsed: false,
  }
}

/** 将背包条目转成可增加模块列表（与 BUFF 一致：category + effectType） */
function entryToEffectModules(entry, proto) {
  const mods = []
  const add = (category, effectType, data = {}) => mods.push({
    ...createEmptyModule(),
    category,
    effectType,
    id: 'm_' + Math.random().toString(36).slice(2),
    ...data,
  })

  const isShield = proto?.子类型 === '盾牌'
  const shieldBaseMatch = isShield && (entry?.附注 ?? proto?.附注 ?? '').match(/AC\s*\+\s*(\d+)/i)
  const shieldBaseAC = shieldBaseMatch ? parseInt(shieldBaseMatch[1], 10) : null
  // 若条目已有 effects（含空数组），优先从中还原；空数组表示用户已删光附魔效果，不再从其它字段推断
  if (Array.isArray(entry?.effects)) {
    if (entry.effects.length === 0) return []
    const toRestore = isShield && shieldBaseAC != null
      ? entry.effects.filter((e) => (e.effectType ?? '') !== 'ac_bonus' || (Number(e.value) || 0) !== shieldBaseAC)
      : entry.effects
    toRestore.forEach((e) => {
      let val = e.value ?? 0
      if (e.effectType === 'contained_spell' && typeof val === 'object' && val && !Array.isArray(val) && val.charges === undefined && entry.charge != null) {
        val = { ...val, charges: Number(entry.charge) || 0 }
      }
      add(normalizeEffectCategory(e.effectType ?? '', e.category), e.effectType ?? '', {
        value: val,
        customText: typeof e.value === 'string' ? e.value : (e.customText ?? ''),
      })
    })
    return mods
  }

  const magicVal = entry.magicBonus != null && entry.magicBonus !== '' ? Number(entry.magicBonus) : 0
  if (magicVal !== 0) {
    if (proto && (proto.类型 === '盔甲' || proto.类型 === '衣服')) add('defense', 'ac_bonus', { value: magicVal })
    else add('offense', 'attack_melee', { value: magicVal })
  }
  if (entry.charge != null && entry.charge !== '') add('mobility_casting', 'charge', { value: Number(entry.charge) || 0 })
  const 附注 = (entry.附注 ?? proto?.附注 ?? '').trim()
  const acMatch = 附注.match(/AC\s*\+\s*(\d+)/i)
  if (acMatch && !isShield) add('defense', 'ac_bonus', { value: parseInt(acMatch[1], 10) || 0 })
  if (entry.spellDC != null && entry.spellDC !== '') add('mobility_casting', 'save_dc_bonus', { value: { val: Number(entry.spellDC) || 0, advantage: '' } })
  const 攻击距离 = (entry.攻击距离 ?? '').trim()
  const reachNum = 攻击距离.match(/(\d+)/)?.[1]
  if (reachNum) add('offense', 'reach_bonus', { value: parseInt(reachNum, 10) || 0 })
  if ((entry.攻击范围 ?? '').trim()) add('offense', 'attack_range', { customText: String(entry.攻击范围).trim() })
  if (mods.length === 0) add('offense', 'attack_melee', { value: 0 })
  return mods
}

/** 从 BUFF 效果模块写出到物品条目的字段（附注片段、magicBonus、攻击距离等） */
function effectModuleToEntryParts(mod, currentEffect) {
  if (!currentEffect) return {}
  const key = currentEffect.key
  const val = mod.value
  const text = mod.customText ?? ''
  const num = typeof val === 'number' ? val : (typeof val === 'object' && val && !Array.isArray(val) && (val.val != null || val.speed != null) ? (val.val ?? val.speed ?? 0) : 0)
  if (key === 'ac_bonus') return { 附注Part: (num > 0 ? 'AC+' + num : '') }
  if (key === 'attack_melee' || key === 'attack_ranged' || key === 'attack_all') return { magicBonus: num }
  if (key === 'attack_bonus') return { magicBonus: typeof val === 'object' && val && val.val != null ? Number(val.val) : 0 }
  if (key === 'reach_bonus') return { 攻击距离: num > 0 ? num + '尺' : '' }
  if (key === 'attack_range') return { 攻击范围: text.trim() || '' }
  if (key === 'charge') return { charge: num }
  if (key === 'save_dc_bonus' || key === 'spell_attack_bonus') return { spellDC: typeof val === 'object' && val && val.val != null ? Number(val.val) : 0 }
  if (key === 'dmg_bonus_melee') return { 附注Part: num > 0 ? '近战伤害+' + num : '' }
  if (key === 'dmg_bonus_ranged') return { 附注Part: num > 0 ? '远程伤害+' + num : '' }
  if (key === 'crit_extra_dice') return { 附注Part: num > 0 ? '暴击+' + num : '' }
  if (key === 'crit_range_expand') return { 附注Part: text.trim() ? '暴击范围 ' + text.trim() : '' }
  if (key?.startsWith('custom_')) return { 附注Part: text.trim() }
  return {}
}

/** 物品稀有度选项 */
const RARITY_OPTIONS = [
  { value: '', label: '— 稀有度 —' },
  { value: '普通', label: '普通' },
  { value: '非普通', label: '非普通' },
  { value: '珍稀', label: '珍稀' },
  { value: '极珍稀', label: '极珍稀' },
  { value: '传说', label: '传说' },
  { value: '神器', label: '神器' },
]

export default function ItemAddForm({ open, onClose, onSave, submitLabel = '确认加入', editEntry = null, inventory = [], spellDC, spellAttackBonus }) {
  const { customLibraryEpoch } = useModule()
  const grouped = useMemo(() => getItemListGrouped(), [customLibraryEpoch])
  const ammoOptionsFromInv = useMemo(() => {
    const cats = new Set()
    inventory.forEach((entry) => {
      const proto = getItemById(entry?.itemId)
      if (proto?.类型 === '弹药' && proto?.类别) cats.add(proto.类别)
    })
    return [...cats].sort((a, b) => a.localeCompare(b))
  }, [inventory])
  const [type, setType] = useState('')
  const [itemId, setItemId] = useState('')
  const [rarity, setRarity] = useState('')
  const [name, setName] = useState('')
  const [intro, setIntro] = useState('')
  const [qty, setQty] = useState(1)
  const [effectModules, setEffectModules] = useState(() => [])
  const [armorFields, setArmorFields] = useState(() => ({ isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' }))
  const [weaponDamage, setWeaponDamage] = useState(() => ({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' }))
  const [weaponTraits, setWeaponTraits] = useState(() => [])
  const [weaponRange, setWeaponRange] = useState(() => '')
  const [weaponAmmoCategory, setWeaponAmmoCategory] = useState(() => '')
  const [weaponMastery, setWeaponMastery] = useState(() => '')
  const [explosiveAttackDistance, setExplosiveAttackDistance] = useState(() => '')
  const [explosiveRadius, setExplosiveRadius] = useState(() => 0)
  const [explosiveDamage, setExplosiveDamage] = useState(() => ({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' }))
  const introRef = useRef(null)

  const typeGroup = grouped.find((g) => g.type === type)
  const subTypeGroups = typeGroup?.subTypes ?? []
  const items = subTypeGroups.flatMap((s) => s.items ?? [])
  const selectedPrototype = itemId ? getItemById(itemId) : null
  const weightDisplay = selectedPrototype?.重量 ?? '—'
  const isEdit = !!editEntry
  const isArmorOrClothing = selectedPrototype && (selectedPrototype.类型 === '盔甲' || selectedPrototype.类型 === '衣服')
  const isWeapon = selectedPrototype && (selectedPrototype.类型 === '近战武器' || selectedPrototype.类型 === '远程武器' || selectedPrototype.类型 === '枪械')
  const isExplosive = selectedPrototype && (selectedPrototype.类型 === '爆炸物' || (selectedPrototype.类型 === '消耗品' && selectedPrototype.子类型 === '爆炸品'))
  const isShield = isArmorOrClothing && selectedPrototype?.子类型 === '盾牌'
  /** 魔杖/卷轴使用固定法强表（按环阶），不沿用角色法术DC/攻击加值 */
  const useWandScrollTable = (() => {
    const p = isEdit ? getItemById(editEntry?.itemId) : selectedPrototype
    return !!(p && (/魔杖|卷轴/.test(p.类别 || '') || p.子类型 === '卷轴'))
  })()

  const autoResizeIntro = () => {
    const el = introRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    if (!open) return
    if (editEntry) {
      const proto = editEntry.itemId ? getItemById(editEntry.itemId) : null
      const typeFromProto = proto ? (grouped.find((g) => g.type === proto.类型)?.type ?? proto.类型 ?? '') : ''
      setType(typeFromProto)
      setItemId(editEntry.itemId ?? '')
      setRarity(editEntry.rarity ?? '')
      setName((editEntry.name && editEntry.name.trim()) || (proto ? getItemDisplayName(proto) : '') || '')
      setIntro((editEntry.详细介绍 != null && editEntry.详细介绍 !== '') ? String(editEntry.详细介绍) : (proto?.详细介绍 ?? '') || '')
      setQty(Math.max(1, Number(editEntry.qty) ?? 1))
      setEffectModules(entryToEffectModules(editEntry, proto))
      const note = (editEntry.附注 != null && editEntry.附注 !== '') ? String(editEntry.附注) : (proto?.附注 ?? '')
      if (proto && (proto.类型 === '盔甲' || proto.类型 === '衣服')) {
        let f = parseArmorNoteToFields(note)
        if (proto.类型 === '衣服' && f.baseAC === '' && !f.isShield) f = { ...f, baseAC: '10', dexMode: 'full' }
        setArmorFields(f)
      } else {
        setArmorFields({ isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' })
      }
      if (proto && (proto.类型 === '近战武器' || proto.类型 === '远程武器' || proto.类型 === '枪械')) {
        setWeaponDamage(parseDamageString(editEntry?.攻击 ?? proto?.攻击 ?? ''))
        const { traits, range, ammoCategory } = parseWeaponNoteToTraits(editEntry?.附注 ?? proto?.附注 ?? '')
        setWeaponTraits(traits)
        setWeaponRange(range)
        setWeaponAmmoCategory(ammoCategory ?? '')
        setWeaponMastery((editEntry?.精通 != null && editEntry?.精通 !== '') ? String(editEntry.精通) : (proto?.精通 ?? ''))
      } else {
        setWeaponDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
        setWeaponTraits([])
        setWeaponRange('')
        setWeaponAmmoCategory('')
        setWeaponMastery('')
      }
      if (proto && (proto.类型 === '爆炸物' || (proto.类型 === '消耗品' && proto.子类型 === '爆炸品'))) {
        const rangeStr = (editEntry?.攻击距离 ?? proto?.攻击距离 ?? '').trim()
        setExplosiveAttackDistance(rangeStr || '')
        setExplosiveRadius(typeof editEntry?.爆炸半径 === 'number' ? editEntry.爆炸半径 : (proto?.爆炸半径 ?? 0))
        setExplosiveDamage(parseDamageString(editEntry?.攻击 ?? proto?.攻击 ?? ''))
      } else {
        setExplosiveAttackDistance('')
        setExplosiveRadius(0)
        setExplosiveDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
      }
    } else {
      setType('')
      setItemId('')
      setRarity('')
      setName('')
      setIntro('')
      setQty(1)
      setEffectModules([])
      setArmorFields({ isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' })
      setWeaponDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
      setWeaponTraits([])
      setWeaponRange('')
      setWeaponAmmoCategory('')
      setWeaponMastery('')
      setExplosiveAttackDistance('')
      setExplosiveRadius(0)
      setExplosiveDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
    }
  }, [open, editEntry, grouped])

  useEffect(() => {
    if (!itemId || isEdit) return
    const proto = getItemById(itemId)
    setName(proto ? getItemDisplayName(proto) : '')
    setIntro(proto?.详细介绍 ?? '')
    if (proto && (proto.类型 === '盔甲' || proto.类型 === '衣服')) {
      let f = parseArmorNoteToFields(proto.附注 ?? '')
      if (proto.类型 === '衣服' && f.baseAC === '' && !f.isShield) f = { ...f, baseAC: '10', dexMode: 'full' }
      setArmorFields(f)
    }
    if (proto && (proto.类型 === '近战武器' || proto.类型 === '远程武器' || proto.类型 === '枪械')) {
      setWeaponDamage(parseDamageString(proto.攻击 ?? ''))
      const { traits, range, ammoCategory } = parseWeaponNoteToTraits(proto.附注 ?? '')
      setWeaponTraits(traits)
      setWeaponRange(range)
      setWeaponAmmoCategory(ammoCategory ?? '')
      setWeaponMastery(proto.精通 ?? '')
    }
    if (proto && (proto.类型 === '爆炸物' || (proto.类型 === '消耗品' && proto.子类型 === '爆炸品'))) {
      setExplosiveAttackDistance((proto.攻击距离 ?? '').trim() || '')
      setExplosiveRadius(proto.爆炸半径 ?? 0)
      setExplosiveDamage(parseDamageString(proto.攻击 ?? ''))
    } else {
      setExplosiveAttackDistance('')
      setExplosiveRadius(0)
      setExplosiveDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
    }
  }, [itemId, isEdit])

  useEffect(() => {
    if (!open) return
    autoResizeIntro()
  }, [open, intro])

  const addModule = () => {
    setEffectModules((prev) => [...prev, createEmptyModule()])
  }

  const updateModule = (id, next) => {
    setEffectModules((prev) => prev.map((m) => (m.id === id ? (typeof next === 'function' ? next(m) : { ...m, ...next }) : m)))
  }

  const removeModule = (id) => {
    setEffectModules((prev) => prev.filter((m) => m.id !== id))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!itemId && !editEntry) return
    const proto = itemId ? getItemById(itemId) : (editEntry?.itemId ? getItemById(editEntry.itemId) : null)
    let 攻击 = (editEntry?.攻击 ?? proto?.攻击 ?? '').trim() || undefined
    let 伤害 = (editEntry?.伤害 ?? proto?.伤害 ?? '').trim() || undefined
    let 攻击距离 = (editEntry?.攻击距离 ?? proto?.攻击距离 ?? '').trim() || undefined
    let 攻击范围 = (editEntry?.攻击范围 ?? '').trim() || undefined
    if (isWeapon && weaponDamage) {
      const parts = []
      if (weaponDamage.minus) parts.push(weaponDamage.minus + '+')
      if (weaponDamage.plus) parts.push(weaponDamage.plus)
      const attackStr = parts.join('') + (weaponDamage.type ? ' ' + weaponDamage.type : '')
      攻击 = attackStr.trim() || 攻击
      伤害 = weaponDamage.type || 伤害
    }
    if (isExplosive && explosiveDamage) {
      攻击 = formatDamageForAttack(explosiveDamage).trim() || 攻击
      伤害 = explosiveDamage.type || 伤害
      攻击距离 = (explosiveAttackDistance != null && String(explosiveAttackDistance).trim() !== '') ? String(explosiveAttackDistance).trim() : 攻击距离
    }
    let 附注 = ''
    if (isArmorOrClothing) 附注 = buildArmorNoteFromFields(armorFields)
    else if (isWeapon) 附注 = buildWeaponNoteFromTraits(weaponTraits, weaponRange, weaponAmmoCategory) || (proto?.附注 ?? '').trim()
    else 附注 = (proto?.附注 ?? '').trim()
    const 精通 = isWeapon && weaponMastery ? weaponMastery : (editEntry?.精通 ?? proto?.精通 ?? undefined)
    let magicBonus = 0
    let charge = 0
    let spellDC = undefined
    const effectsForSave = []
    effectModules.forEach((mod) => {
      const catData = BUFF_TYPES[mod.category]
      const effects = catData?.effects ?? []
      const currentEffect = effects.find((e) => e.key === mod.effectType)
      if (!currentEffect) return
      // 统一 Effect 结构（与 src/lib/effects/effectModel 一致），保证下次编辑 1:1 还原且与 BUFF 计算共用
      let saveVal = mod.value ?? 0
      if (currentEffect.dataType === 'text') saveVal = typeof mod.value === 'string' ? mod.value : (mod.customText ?? '')
      else if (currentEffect.dataType === 'boolean') saveVal = !!(mod.value === true || mod.value === 'true' || mod.value === 1)
      effectsForSave.push({
        category: mod.category,
        effectType: currentEffect.key,
        value: saveVal,
        customText: mod.customText ?? '',
      })
      const parts = effectModuleToEntryParts(mod, currentEffect)
      // 盔甲/衣服：AC 加值写入 magicBonus，用于 AC 计算；不拼进附注
      if (isArmorOrClothing && currentEffect.key === 'ac_bonus') {
        const val = typeof mod.value === 'number'
          ? mod.value
          : (typeof mod.value === 'object' && mod.value && !Array.isArray(mod.value) && (mod.value.val != null)
            ? mod.value.val
            : 0)
        if (val != null) magicBonus = Number(val) || 0
        return
      }
      if (!isArmorOrClothing && parts.附注Part) 附注 = (附注 ? 附注 + '；' : '') + parts.附注Part
      if (parts.magicBonus != null) magicBonus = parts.magicBonus
      if (parts.charge != null) charge = parts.charge
      if (currentEffect.key === 'contained_spell' && typeof mod.value === 'object' && mod.value && 'charges' in mod.value) {
        const c = Number(mod.value.charges)
        if (!Number.isNaN(c) && c >= 0) charge = c
      }
      if (parts.spellDC != null) spellDC = parts.spellDC
      if (parts.攻击距离 !== undefined) 攻击距离 = parts.攻击距离 || undefined
      if (parts.攻击范围 !== undefined) 攻击范围 = parts.攻击范围 || undefined
    })
    const entry = {
      ...(editEntry ? { id: editEntry.id, isAttuned: !!editEntry.isAttuned } : { id: 'inv_' + Date.now(), isAttuned: false }),
      itemId: itemId || editEntry?.itemId || '',
      ...(rarity ? { rarity } : {}),
      name: (name?.trim()) || editEntry?.name || proto?.类别 || (proto ? getItemDisplayName(proto) : '') || '—',
      攻击: 攻击 || undefined,
      伤害: 伤害 || undefined,
      攻击距离: 攻击距离 || undefined,
      攻击范围: 攻击范围 || undefined,
      详细介绍: intro?.trim() ?? '',
      ...(附注 ? { 附注 } : {}),
      ...(isWeapon && 精通 ? { 精通 } : {}),
      重量: proto?.重量,
      qty: Math.max(1, qty),
      magicBonus,
      charge,
      ...(spellDC != null ? { spellDC } : {}),
      effects: effectsForSave,
      ...(isExplosive ? { 爆炸半径: Number(explosiveRadius) || 0 } : {}),
    }
    onSave(entry)
    onClose()
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/50" onClick={onClose} aria-hidden />
      <div className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-5xl sm:w-full z-[201] overflow-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-2.5 p-3 bg-gray-800 rounded-xl border border-gray-600 min-w-0 w-full max-w-full">
          {isEdit && <h4 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">编辑物品</h4>}

          {/* 选择物品类型 → 获得基础信息（编辑时为只读） */}
          <div className="min-w-0 max-w-full">
            <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5">{isEdit ? '物品类型' : '选择物品类型'}</label>
            {isEdit ? (
              <div className="flex flex-wrap items-center gap-1.5 h-8 text-sm text-dnd-text-body">
                <span className="text-gray-400">{type || '—'}</span>
                <span className="text-gray-500">/</span>
                <span>{selectedPrototype ? (getItemDisplayName(selectedPrototype) || itemId) : itemId || '—'}</span>
                {rarity ? <span className="text-dnd-text-muted text-xs">稀有度：{rarity}</span> : null}
                <span className="text-dnd-text-muted text-xs">重量：{weightDisplay}</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 min-w-0 max-w-full">
                <select
                  value={type}
                  onChange={(e) => { setType(e.target.value); setItemId(''); }}
                  className={inputClass + ' h-8 min-w-0 w-[7rem] text-sm shrink-0'}
                >
                  <option value="">— 类型 —</option>
                  {grouped.map((g) => (
                    <option key={g.type} value={g.type}>{g.type}</option>
                  ))}
                </select>
                <div className="flex flex-1 min-w-0 gap-1.5 flex-nowrap max-w-full overflow-hidden">
                  <select
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                    className={inputClass + ' h-8 flex-1 min-w-0 text-sm max-w-full'}
                    disabled={!type}
                  >
                    <option value="">— 选择物品 —</option>
                    {items.map((x) => (
                      <option key={x.id} value={x.id}>{x._display || getItemDisplayName(x) || x.类别}</option>
                    ))}
                  </select>
                  {/* 稀有度宽度固定为 30%，请勿改为全宽或其它比例 */}
                  <select
                    value={rarity}
                    onChange={(e) => setRarity(e.target.value)}
                    className={inputClass + ' h-8 text-sm flex-[0_0_30%] max-w-[30%]'}
                  >
                    {RARITY_OPTIONS.map((o) => (
                      <option key={o.value || '_'} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 名字（可修改） */}
          <div>
            <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5">名字</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selectedPrototype ? `不填则用「${getItemDisplayName(selectedPrototype)}」` : '可选'}
              className={inputClass + ' w-full h-8 text-sm'}
            />
          </div>

          {/* 简介（可修改） */}
          <div>
            <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5">简介</label>
            <textarea
              ref={introRef}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              onInput={autoResizeIntro}
              placeholder="附魔、说明等"
              rows={2}
              className={textareaClass + ' w-full text-sm min-w-0 break-words resize-none overflow-hidden'}
            />
          </div>

          {/* 爆炸物：三模块 — 左+中占 1/2 弹窗，右占 1/2；模块内内容均分平铺 */}
          {isExplosive && selectedPrototype ? (
            <div className="w-full rounded border border-gray-600 bg-gray-700/30 px-2 py-1">
              <div className="flex flex-nowrap items-baseline gap-0 min-w-0 w-full text-gray-200 text-xs">
                {/* 左半：抛投距离 | 分隔符 | 爆炸半径，共占 50% */}
                <div className="flex flex-nowrap items-baseline gap-0 min-w-0 flex-1">
                  <div className="flex items-baseline justify-evenly gap-1.5 min-w-0 flex-1 px-0.5">
                    <span className="shrink-0">抛投距离</span>
                    <NumberStepper
                      value={parseInt(explosiveAttackDistance, 10) || parseInt(String(explosiveAttackDistance || '').match(/\d+/)?.[0], 10) || 0}
                      onChange={(n) => setExplosiveAttackDistance(String(n))}
                      min={0}
                      max={999}
                      step={5}
                      compact
                      narrow
                      unifiedColor
                    />
                    <span className="shrink-0">尺</span>
                  </div>
                  <div className="flex shrink-0 self-stretch items-stretch" aria-hidden>
                    <span className="w-3 shrink-0" />
                    <span className="border-l border-gray-500 w-0 shrink-0 self-stretch" />
                    <span className="w-3 shrink-0" />
                  </div>
                  <div className="flex items-baseline justify-evenly gap-1.5 min-w-0 flex-1 px-0.5">
                    <span className="shrink-0">爆炸半径</span>
                    <NumberStepper
                      value={explosiveRadius}
                      onChange={setExplosiveRadius}
                      min={0}
                      max={999}
                      step={5}
                      compact
                      narrow
                      unifiedColor
                    />
                    <span className="shrink-0">尺</span>
                  </div>
                </div>
                <div className="flex shrink-0 self-stretch items-stretch" aria-hidden>
                  <span className="w-3 shrink-0" />
                  <span className="border-l border-gray-500 w-0 shrink-0 self-stretch" />
                  <span className="w-3 shrink-0" />
                </div>
                {/* 右半：伤害，占 50% */}
                <div className="flex items-baseline justify-evenly min-w-0 flex-1 px-0.5">
                  <DamageDiceInlineRow
                    value={explosiveDamage}
                    onChange={(next) => {
                      if (next.value != null) setExplosiveDamage(next.value)
                    }}
                    module={{ id: 'explosive-dmg', value: explosiveDamage }}
                    compact
                    leftLabel="伤害"
                    narrowBlocks
                    evenSpacing
                    unifiedColor
                    evenSpread
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* 武器基本属性：伤害、词条、精通（选择物品时从基础数据自动填入）；下方为附魔效果 */}
          {isWeapon && selectedPrototype ? (
            <div className="w-full rounded border border-gray-600 bg-gray-700/30 px-2 py-1.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">武器基本属性</span>
                <button type="button" onClick={() => setWeaponDamage(parseDamageString(selectedPrototype.攻击 ?? ''))} className="text-xs px-1.5 py-0.5 rounded border border-gray-500 text-gray-400 hover:bg-gray-600">使用模版</button>
              </div>
              <div>
                <DamageDiceInlineRow
                  value={weaponDamage}
                  onChange={(next) => next.value != null && setWeaponDamage(next.value)}
                  module={{ id: 'weapon-dmg', effectType: 'extra_damage_dice', value: weaponDamage }}
                  compact
                  minusStepper
                  leftLabel="伤害"
                  trailing={
                    <>
                      <span className="text-dnd-text-muted text-xs shrink-0">精通</span>
                      <select value={weaponMastery} onChange={(e) => setWeaponMastery(e.target.value)} className={inputClass + ' h-7 text-xs min-w-[6rem] h-full py-0 pr-6'} title="精通">
                        <option value="">—</option>
                        {WEAPON_MASTERY_OPTIONS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </>
                  }
                />
              </div>
              <div>
                <span className="text-dnd-text-muted text-xs block mb-0.5">词条</span>
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  {WEAPON_TRAIT_OPTIONS.map((t) => {
                    const isRangeTrait = t === '射程'
                    const isAmmoTrait = t === '弹药'
                    const checked = weaponTraits.includes(t)
                    return (
                      <label key={t} className={`flex items-center gap-1 cursor-pointer text-xs ${(isRangeTrait || isAmmoTrait) ? 'whitespace-nowrap' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextChecked = e.target.checked
                            setWeaponTraits((prev) => nextChecked ? [...prev, t] : prev.filter((x) => x !== t))
                          }}
                          className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                        />
                        <span className="text-dnd-text-body">{t}</span>
                        {isRangeTrait && checked && (
                          <input
                            type="text"
                            value={weaponRange}
                            onChange={(e) => setWeaponRange(e.target.value)}
                            placeholder="XX/XX"
                            className={inputClass + ' h-7 text-xs w-28 ml-1'}
                          />
                        )}
                        {isAmmoTrait && checked && (
                          <select
                            value={weaponAmmoCategory}
                            onChange={(e) => setWeaponAmmoCategory(e.target.value)}
                            className={inputClass + ' h-7 text-xs min-w-0 max-w-[8rem] ml-1'}
                            title="选择背包内弹药"
                          >
                            <option value="">— 选择弹药 —</option>
                            {ammoOptionsFromInv.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="w-full pt-1.5 border-t border-gray-600/80">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">附魔效果（可多条）</label>
                  <button type="button" onClick={addModule} className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500 text-amber-400 hover:bg-amber-500/20 text-[10px] font-medium">
                    <Plus className="w-3 h-3" />
                    添加效果
                  </button>
                </div>
                <div className="space-y-1">
                  {effectModules.map((mod) => {
                    const catData = BUFF_TYPES[mod.category]
                    const effects = catData?.effects ?? []
                    const visibleEffects = effects.filter((e) => !e.hidden)
                    const hasCategory = !!mod.category && !!catData
                    const effectTypeValid = hasCategory && effects.some((e) => e.key === mod.effectType)
                    const effectiveEffectType = hasCategory && effectTypeValid ? mod.effectType : ''
                    const currentEffect = effects.find((e) => e.key === effectiveEffectType)
                    const complexValue = currentEffect ? isComplexValueType(currentEffect) : false
                    return (
                      <div key={mod.id} className="rounded border border-gray-600 bg-gray-700/30 p-1.5 space-y-1">
                        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] items-center gap-2 w-full min-w-0">
                          <div className="min-w-0">
                            <select
                              value={mod.category || ''}
                              onChange={(e) => {
                                const newCat = e.target.value
                                const newEffects = BUFF_TYPES[newCat]?.effects ?? []
                                updateModule(mod.id, { ...mod, category: newCat, effectType: newCat ? (newEffects[0]?.key ?? '') : '' })
                              }}
                              className={inputClass + ' h-7 text-xs w-full min-w-0'}
                            >
                              <option value="">&lt;效果大类&gt;</option>
                              {getCategories().map((c) => (
                                <option key={c.key} value={c.key}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="min-w-0">
                            <select
                              value={effectiveEffectType}
                              onChange={(e) => updateModule(mod.id, { ...mod, effectType: e.target.value })}
                              className={inputClass + ' h-7 text-xs w-full min-w-0'}
                              disabled={!hasCategory}
                            >
                              <option value="">&lt;具体效果&gt;</option>
                              {visibleEffects.map((e) => (
                                <option key={e.key} value={e.key}>{e.label}</option>
                              ))}
                            </select>
                          </div>
                          {!complexValue && (
                            <div className="col-span-3 min-w-0 flex items-center gap-1.5 flex-wrap">
                              <EffectValueEditor
                                module={{ ...mod, effectType: effectiveEffectType }}
                                onChange={(next) => updateModule(mod.id, next)}
                                catData={catData}
                                inline
                                spellDC={spellDC}
                                spellAttackBonus={spellAttackBonus}
                                useWandScrollTable={useWandScrollTable}
                              />
                            </div>
                          )}
                          {complexValue && <div className="col-span-3" />}
                          <button
                            type="button"
                            onClick={() => removeModule(mod.id)}
                            className="h-7 w-7 rounded border border-gray-600 text-gray-400 hover:bg-red-900/40 hover:text-red-400 hover:border-red-600 flex items-center justify-center shrink-0"
                            title="删除此效果"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {complexValue && (
                          <div className="pt-0.5 border-t border-gray-600/80">
                            <EffectValueEditor
                              module={{ ...mod, effectType: effectiveEffectType }}
                              onChange={(next) => updateModule(mod.id, next)}
                              catData={catData}
                              spellDC={spellDC}
                              spellAttackBonus={spellAttackBonus}
                              useWandScrollTable={useWandScrollTable}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* 盔甲/盾牌：基础属性与附魔为同级，先基础（必填）后附魔（魔法物品可选） */}
          {isArmorOrClothing && (
            <>
              <div className="rounded border border-gray-600 bg-gray-700/30 px-2 py-1.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">{isShield ? '盾牌基本属性' : '盔甲基本属性'}</span>
                </div>
                {isShield ? (
                  <div className="flex items-center gap-2">
                    <span className="text-dnd-text-muted text-xs">基础 AC</span>
                    <NumberStepper
                      value={Number(armorFields.shieldBonus) || 0}
                      onChange={(v) => setArmorFields((f) => ({ ...f, shieldBonus: String(Math.max(0, v)) }))}
                      min={0}
                      compact
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-dnd-text-muted shrink-0 text-xs">基础 AC</span>
                      <NumberStepper
                        value={Math.max(0, parseInt(armorFields.baseAC, 10) || 0)}
                        onChange={(v) => setArmorFields((f) => ({ ...f, baseAC: String(Math.max(0, v)) }))}
                        min={0}
                        max={30}
                        compact
                      />
                    </div>
                    <div className="flex items-center gap-1 min-w-[8rem] flex-1">
                      <span className="text-dnd-text-muted shrink-0">敏捷调整值</span>
                      <select
                        value={armorFields.dexMode === 'cap' ? (armorFields.dexCap === 3 ? 'cap3' : 'cap2') : 'full'}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === 'cap3') setArmorFields((f) => ({ ...f, dexMode: 'cap', dexCap: 3 }))
                          else if (v === 'cap2') setArmorFields((f) => ({ ...f, dexMode: 'cap', dexCap: 2 }))
                          else setArmorFields((f) => ({ ...f, dexMode: 'full', dexCap: 2 }))
                        }}
                        className={inputClass + ' h-7 text-xs flex-1'}
                      >
                        <option value="full">敏调</option>
                        <option value="cap2">敏调最大2</option>
                        <option value="cap3">中甲大师（敏调最大3）</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1 min-w-[7rem] flex-1">
                      <span className="text-dnd-text-muted shrink-0">力量需求</span>
                      <input
                        type="text"
                        value={armorFields.strReq}
                        onChange={(e) => setArmorFields((f) => ({ ...f, strReq: e.target.value }))}
                        className={inputClass + ' h-7 text-xs flex-1'}
                        placeholder="— / 13"
                      />
                    </div>
                    <div className="flex items-center gap-1 min-w-[7rem] flex-1">
                      <span className="text-dnd-text-muted shrink-0">隐匿劣势</span>
                      <select
                        value={armorFields.stealth}
                        onChange={(e) => setArmorFields((f) => ({ ...f, stealth: e.target.value }))}
                        className={inputClass + ' h-7 text-xs flex-1'}
                      >
                        <option value="—">—</option>
                        <option value="劣势">劣势</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded border border-gray-600 bg-gray-700/30 px-2 py-1.5 space-y-1.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">附魔效果（可多条）</span>
                  <button type="button" onClick={addModule} className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500 text-amber-400 hover:bg-amber-500/20 text-[10px] font-medium">
                    <Plus className="w-3 h-3" />
                    添加效果
                  </button>
                </div>
                <div className="space-y-1">
                  {effectModules.map((mod) => {
                    const catData = BUFF_TYPES[mod.category]
                    const effects = catData?.effects ?? []
                    const visibleEffects = effects.filter((e) => !e.hidden)
                    const hasCategory = !!mod.category && !!catData
                    const effectTypeValid = hasCategory && effects.some((e) => e.key === mod.effectType)
                    const effectiveEffectType = hasCategory && effectTypeValid ? mod.effectType : ''
                    const currentEffect = effects.find((e) => e.key === effectiveEffectType)
                    const complexValue = currentEffect ? isComplexValueType(currentEffect) : false
                    return (
                      <div key={mod.id} className="rounded border border-gray-600 bg-gray-700/30 p-1.5 space-y-1">
                        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] items-center gap-2 w-full min-w-0">
                          <div className="min-w-0">
                            <select
                              value={mod.category || ''}
                              onChange={(e) => {
                                const newCat = e.target.value
                                const newEffects = BUFF_TYPES[newCat]?.effects ?? []
                                updateModule(mod.id, { ...mod, category: newCat, effectType: newCat ? (newEffects[0]?.key ?? '') : '' })
                              }}
                              className={inputClass + ' h-7 text-xs w-full min-w-0'}
                            >
                              <option value="">&lt;效果大类&gt;</option>
                              {getCategories().map((c) => (
                                <option key={c.key} value={c.key}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="min-w-0">
                            <select
                              value={effectiveEffectType}
                              onChange={(e) => updateModule(mod.id, { ...mod, effectType: e.target.value })}
                              className={inputClass + ' h-7 text-xs w-full min-w-0'}
                              disabled={!hasCategory}
                            >
                              <option value="">&lt;具体效果&gt;</option>
                              {visibleEffects.map((e) => (
                                <option key={e.key} value={e.key}>{e.label}</option>
                              ))}
                            </select>
                          </div>
                          {!complexValue && (
                            <div className="col-span-3 min-w-0 flex items-center gap-1.5 flex-wrap">
                              <EffectValueEditor
                                module={{ ...mod, effectType: effectiveEffectType }}
                                onChange={(next) => updateModule(mod.id, next)}
                                catData={catData}
                                inline
                                spellDC={spellDC}
                                spellAttackBonus={spellAttackBonus}
                                useWandScrollTable={useWandScrollTable}
                              />
                            </div>
                          )}
                          {complexValue && <div className="col-span-3" />}
                          <button
                            type="button"
                            onClick={() => removeModule(mod.id)}
                            className="h-7 w-7 rounded border border-gray-600 text-gray-400 hover:bg-red-900/40 hover:text-red-400 hover:border-red-600 flex items-center justify-center shrink-0"
                            title="删除此效果"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {complexValue && (
                          <div className="pt-0.5 border-t border-gray-600/80">
                            <EffectValueEditor
                              module={{ ...mod, effectType: effectiveEffectType }}
                              onChange={(next) => updateModule(mod.id, next)}
                              catData={catData}
                              spellDC={spellDC}
                              spellAttackBonus={spellAttackBonus}
                              useWandScrollTable={useWandScrollTable}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* 非武器且非盔甲/衣服：仅附魔效果 */}
          {!isWeapon && !isArmorOrClothing && (
            <div className="w-full rounded border border-gray-600 bg-gray-700/30 px-2 py-1.5 space-y-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">附魔效果（可多条）</label>
                <button type="button" onClick={addModule} className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500 text-amber-400 hover:bg-amber-500/20 text-[10px] font-medium">
                  <Plus className="w-3 h-3" />
                  添加效果
                </button>
              </div>
              <div className="space-y-1">
                {effectModules.map((mod) => {
                  const catData = BUFF_TYPES[mod.category]
                  const effects = catData?.effects ?? []
                  const visibleEffects = effects.filter((e) => !e.hidden)
                  const hasCategory = !!mod.category && !!catData
                  const effectTypeValid = hasCategory && effects.some((e) => e.key === mod.effectType)
                  const effectiveEffectType = hasCategory && effectTypeValid ? mod.effectType : ''
                  const currentEffect = effects.find((e) => e.key === effectiveEffectType)
                  const complexValue = currentEffect ? isComplexValueType(currentEffect) : false
                  return (
                    <div key={mod.id} className="rounded border border-gray-600 bg-gray-700/30 p-1.5 space-y-1">
                      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] items-center gap-2 w-full min-w-0">
                        <div className="min-w-0">
                          <select
                            value={mod.category || ''}
                            onChange={(e) => {
                              const newCat = e.target.value
                              const newEffects = BUFF_TYPES[newCat]?.effects ?? []
                              updateModule(mod.id, { ...mod, category: newCat, effectType: newCat ? (newEffects[0]?.key ?? '') : '' })
                            }}
                            className={inputClass + ' h-7 text-xs w-full min-w-0'}
                          >
                            <option value="">&lt;效果大类&gt;</option>
                            {getCategories().map((c) => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="min-w-0">
                          <select
                            value={effectiveEffectType}
                            onChange={(e) => updateModule(mod.id, { ...mod, effectType: e.target.value })}
                            className={inputClass + ' h-7 text-xs w-full min-w-0'}
                            disabled={!hasCategory}
                          >
                            <option value="">&lt;具体效果&gt;</option>
                            {visibleEffects.map((e) => (
                              <option key={e.key} value={e.key}>{e.label}</option>
                            ))}
                          </select>
                        </div>
                        {!complexValue && (
                          <div className="col-span-3 min-w-0 flex items-center gap-1.5 flex-wrap">
                            <EffectValueEditor
                              module={{ ...mod, effectType: effectiveEffectType }}
                              onChange={(next) => updateModule(mod.id, next)}
                              catData={catData}
                              inline
                              spellDC={spellDC}
                              spellAttackBonus={spellAttackBonus}
                              useWandScrollTable={useWandScrollTable}
                            />
                          </div>
                        )}
                        {complexValue && <div className="col-span-3" />}
                        <button
                          type="button"
                          onClick={() => removeModule(mod.id)}
                          className="h-7 w-7 rounded border border-gray-600 text-gray-400 hover:bg-red-900/40 hover:text-red-400 hover:border-red-600 flex items-center justify-center shrink-0"
                          title="删除此效果"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {complexValue && (
                        <div className="pt-0.5 border-t border-gray-600/80">
                          <EffectValueEditor
                            module={{ ...mod, effectType: effectiveEffectType }}
                            onChange={(next) => updateModule(mod.id, next)}
                            catData={catData}
                            spellDC={spellDC}
                            spellAttackBonus={spellAttackBonus}
                            useWandScrollTable={useWandScrollTable}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 数量、重量 同行 */}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5">数量</label>
              <div className="flex items-center gap-1 h-8">
                <button type="button" onClick={() => setQty(Math.max(1, (qty || 1) - 1))} className="h-8 w-8 rounded border border-gray-600 bg-gray-700 text-white font-bold text-sm">−</button>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-8 w-16 text-center text-sm'} />
                <button type="button" onClick={() => setQty((qty || 1) + 1)} className="h-8 w-8 rounded border border-gray-600 bg-gray-700 text-white font-bold text-sm">+</button>
              </div>
            </div>
            <div>
              <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5">重量</label>
              <p className="h-8 flex items-center text-dnd-text-muted text-xs">{weightDisplay}</p>
            </div>
          </div>

          <div className="flex gap-1.5 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm">
              取消
            </button>
            <button type="submit" disabled={!itemId && !isEdit} className="px-3 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm disabled:opacity-50">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
