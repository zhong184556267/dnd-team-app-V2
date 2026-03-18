/**
 * 装备与背包：合并身穿装备和背包
 * 上方：手持与身穿（左右分栏）
 * 下方：背包
 */
import { useState, useEffect, Fragment } from 'react'
import { Plus, Trash2, ArrowDownToLine, ArrowUpFromLine, Pencil, Package, GripVertical } from 'lucide-react'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getCharacterWallet } from '../lib/currencyStore'
import { addToWarehouse } from '../lib/warehouseStore'
import { CurrencyGrid } from './CurrencyDisplay'
import { getItemWeightLb, parseWeightString } from '../lib/encumbrance'
import { getMaxAttunementSlots, getAttunedCountFromInventory } from '../lib/combatState'
import ItemAddForm from './ItemAddForm'
import EncumbranceBar from './EncumbranceBar'
import TransferModal from './TransferModal'
import { parseArmorNote } from '../lib/formulas'
import { abilityModifier, proficiencyBonus } from '../lib/formulas'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { getPrimarySpellcastingAbility } from '../data/classDatabase'
import { inputClass } from '../lib/inputStyles'
import { logTeamActivity } from '../lib/activityLog'
import { NumberStepper } from './BuffForm'

const HELD_LABELS = ['主手', '副手']
const WORN_SLOT_OPTIONS = [
  { id: 'head', label: '头部' },
  { id: 'body', label: '身体' },
  { id: 'shoulder', label: '肩背' },
  { id: 'coat', label: '外套' },
  { id: 'feet', label: '鞋子' },
  { id: 'hands', label: '手套' },
  { id: 'neck', label: '颈脖' },
  { id: 'eyes', label: '眼睛' },
]

function getEntryDisplayName(entry) {
  if (!entry) return '—'
  const customName = entry.name?.trim()
  if (customName) return customName
  const proto = entry?.itemId ? getItemById(entry.itemId) : null
  return getItemDisplayName(proto) || '—'
}

/** 手持：主手 武器+法器+枪械, 副手 盾牌+武器+枪械+法器（权杖/法杖等）, 备用 法器+武器 */
function getHeldOptions(inv, slotIndex) {
  return inv.filter((e) => {
    const proto = e.itemId ? getItemById(e.itemId) : null
    const t = proto?.类型 ?? ''
    const sub = proto?.子类型 ?? ''
    if (slotIndex === 0) return t === '近战武器' || t === '远程武器' || t === '枪械' || t === '法器'
    if (slotIndex === 1) return (t === '盔甲' && sub === '盾牌') || t === '近战武器' || t === '远程武器' || t === '枪械' || t === '法器'
    return t === '法器' || t === '近战武器' || t === '远程武器'
  })
}

/** 身穿：身体 盔甲(非盾牌)+衣服. 其他 全部 */
function getWornOptions(inv, slotId) {
  if (slotId === 'body') {
    return inv.filter((e) => {
      const proto = e.itemId ? getItemById(e.itemId) : null
      const t = proto?.类型 ?? ''
      const sub = proto?.子类型 ?? ''
      if (t === '衣服') return true
      if (t === '盔甲' && sub !== '盾牌') return true
      return false
    })
  }
  return inv
}

/** 迁移旧 equippedSlots 到 equippedHeld；旧身穿 8 槽转为 身体 + 可添加 */
function migrateSlots(character) {
  const old = character?.equippedSlots
  if (!Array.isArray(old) || old.length === 0) return null
  const held = old.map((s, i) => ({ id: s.id || 'held_' + i, inventoryId: s.inventoryId ?? null }))
  const existing = character?.equippedWorn ?? []
  const bodySlot = existing.find((w) => w.id === 'body') ?? { id: 'body', inventoryId: null }
  const addable = existing
    .filter((w) => w.id !== 'body')
    .filter((w) => w.inventoryId || (w.slotId && w.slotId !== 'body'))
    .map((w, i) => ({
      id: w.id?.startsWith('worn_') ? w.id : 'worn_migrate_' + i + '_' + Date.now(),
      slotId: w.slotId ?? w.id ?? 'head',
      inventoryId: w.inventoryId ?? null,
    }))
  const worn = [{ id: 'body', inventoryId: bodySlot.inventoryId }, ...addable]
  return { held, worn }
}

/** 构建 equipment 以支持 AC 计算（卸下时显式置空，便于 getAC 正确回退） */
function buildEquipmentForAC(heldSlots, wornSlots, inv) {
  const eq = { bodyArmor: null, shield: null }
  const bodySlot = wornSlots.find((s) => s.id === 'body' || s.slotId === 'body')
  if (bodySlot?.inventoryId) {
    const entry = inv.find((e) => e.id === bodySlot.inventoryId)
    if (entry) {
      const proto = entry.itemId ? getItemById(entry.itemId) : null
      if (proto?.类型 === '盔甲' && proto?.子类型 !== '盾牌') {
        eq.bodyArmor = { inventoryId: bodySlot.inventoryId, magicBonus: entry.magicBonus }
      }
    }
  }
  const offSlot = heldSlots[1]
  if (offSlot?.inventoryId) {
    const entry = inv.find((e) => e.id === offSlot.inventoryId)
    if (entry) {
      const proto = entry.itemId ? getItemById(entry.itemId) : null
      if (proto?.类型 === '盔甲' && proto?.子类型 === '盾牌') {
        eq.shield = { inventoryId: offSlot.inventoryId }
      }
    }
  }
  return eq
}

export default function EquipmentAndInventory({ character, canEdit, onSave, onWalletSuccess, activityActor }) {
  const inv = character?.inventory ?? []
  const migrated = migrateSlots(character)
  const buffStats = useBuffCalculator(character, character?.buffs)
  const level = Math.max(1, Math.min(20, parseInt(character?.level, 10) || 1))
  const abilities = character?.abilities ?? {}
  const spellAbility = getPrimarySpellcastingAbility(character)
  const prof = buffStats?.proficiencyOverride != null ? buffStats.proficiencyOverride : proficiencyBonus(level)
  const spellAttackBonus = spellAbility != null ? prof + abilityModifier(abilities?.[spellAbility] ?? 10) + (buffStats?.spellAttackBonus ?? 0) : null
  const spellDC = spellAbility != null ? 8 + prof + abilityModifier(abilities?.[spellAbility] ?? 10) + (buffStats?.saveDcBonus ?? 0) : null
  const heldSlots = character?.equippedHeld ?? migrated?.held ?? [
    { id: 'main', inventoryId: null },
    { id: 'off', inventoryId: null },
  ]
  const wornSlots = (() => {
    if (migrated?.worn) return migrated.worn
    const existing = character?.equippedWorn ?? []
    const body = existing.find((w) => w.id === 'body') ?? { id: 'body', inventoryId: null }
    const addable = existing
      .filter((w) => w.id !== 'body')
      .filter((w) => w.inventoryId || w.slotId)
      .map((w, i) => ({
        id: w.id?.startsWith('worn_') ? w.id : 'worn_' + Date.now() + '_' + i,
        slotId: w.slotId ?? w.id ?? 'head',
        inventoryId: w.inventoryId ?? null,
      }))
    return [{ id: 'body', inventoryId: body.inventoryId }, ...addable]
  })()
  const bodySlot = wornSlots[0]
  const wornAddable = wornSlots.slice(1)

  const maxAttunementSlots = getMaxAttunementSlots(character?.buffs ?? [])
  const attunedCount = getAttunedCountFromInventory(inv)
  const [wallet, setWallet] = useState({})
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDirection, setTransferDirection] = useState('toVault')
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [storeToVaultIndex, setStoreToVaultIndex] = useState(null)
  const [storeToVaultQty, setStoreToVaultQty] = useState(1)

  useEffect(() => {
    if (character?.id) setWallet(getCharacterWallet(character.id))
  }, [character?.id, character?.wallet])

  const saveWithEquipment = (patch) => {
    const nextHeld = patch.equippedHeld ?? heldSlots
    const nextWorn = patch.equippedWorn ?? wornSlots
    const nextInv = patch.inventory ?? inv
    const acEquipment = buildEquipmentForAC(nextHeld, nextWorn, nextInv)
    const equipment = { ...(character?.equipment ?? {}), ...acEquipment }
    onSave({ ...patch, equipment })
  }

  const setHeld = (next) => saveWithEquipment({ equippedHeld: next, equippedWorn: wornSlots })
  const setWorn = (next) => saveWithEquipment({ equippedHeld: heldSlots, equippedWorn: next }) 
  const setAttuned = (index, value) => {
    if (value && attunedCount >= maxAttunementSlots) return
    const next = inv.map((e, i) => (i === index ? { ...e, isAttuned: !!value } : e))
    onSave({ inventory: next })
  }

  const setHeldEquip = (i, inventoryId) => {
    const next = [...heldSlots]
    next[i] = { ...next[i], inventoryId: inventoryId || null }
    setHeld(next)
  }
  const setWornEquip = (inventoryId) => {
    const next = [{ ...bodySlot, inventoryId: inventoryId || null }, ...wornAddable]
    setWorn(next)
  }

  const setWornAddableSlotId = (addableIndex, slotId) => {
    const next = [...wornSlots]
    const idx = addableIndex + 1
    next[idx] = { ...next[idx], slotId: slotId || 'head', inventoryId: next[idx]?.inventoryId ?? null }
    setWorn(next)
  }

  const setWornAddableEquip = (addableIndex, inventoryId) => {
    const next = [...wornSlots]
    const idx = addableIndex + 1
    next[idx] = { ...next[idx], inventoryId: inventoryId || null }
    setWorn(next)
  }

  const setWornMagicBonus = (inventoryId, value) => {
    const entryIdx = inv.findIndex((e) => e.id === inventoryId)
    if (entryIdx < 0) return
    const n = Math.max(0, parseInt(value, 10) || 0)
    const nextInv = inv.map((e, i) => (i === entryIdx ? { ...e, magicBonus: n } : e))
    onSave({ inventory: nextInv })
  }

  /** 更新身穿身体槽条目上的瓦石层附魔数值（仅当 effects 中已有 ac_cap_stone_layer 时显示并编辑） */
  const setWornStoneLayer = (inventoryId, value) => {
    const entryIdx = inv.findIndex((e) => e.id === inventoryId)
    if (entryIdx < 0) return
    const n = Math.max(0, parseInt(value, 10) || 0)
    const entry = inv[entryIdx]
    const effects = Array.isArray(entry.effects) ? [...entry.effects] : []
    const idx = effects.findIndex((e) => e.effectType === 'ac_cap_stone_layer')
    if (idx >= 0) {
      effects[idx] = { ...effects[idx], value: n }
    } else {
      effects.push({ category: 'defense', effectType: 'ac_cap_stone_layer', value: n })
    }
    const nextInv = inv.map((e, i) => (i === entryIdx ? { ...e, effects } : e))
    onSave({ inventory: nextInv })
  }

  const addWornSlot = () => {
    const used = new Set(wornAddable.map((a) => a.slotId).filter(Boolean))
    const slotId = WORN_SLOT_OPTIONS.find((o) => o.id !== 'body' && !used.has(o.id))?.id ?? 'head'
    setWorn([...wornSlots, { id: 'worn_' + Date.now(), slotId, inventoryId: null }])
  }

  const removeWornSlot = (addableIndex) => {
    const next = [bodySlot, ...wornAddable.filter((_, i) => i !== addableIndex)]
    setWorn(next)
  }

  const toggleAttunedForEntry = (inventoryId, checked) => {
    const idx = inv.findIndex((e) => e.id === inventoryId)
    if (idx < 0) return
    setAttuned(idx, checked)
  }

  const HELD_FIXED = 2
  const addHeldSlot = () => setHeld([...heldSlots, { id: 'held_' + Date.now(), inventoryId: null }])
  const removeHeldSlot = (i) => {
    if (i < HELD_FIXED || heldSlots.length <= HELD_FIXED) return
    setHeld(heldSlots.filter((_, j) => j !== i))
  }

  const removeItem = (index) => onSave({ inventory: inv.filter((_, i) => i !== index) })

  const reorderInventory = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setEditingIndex(null)
    const next = [...inv]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    onSave({ inventory: next })
  }

  /** 同名物品（显示名称一致）可合并数量；invDisplayName 在下方定义，此处用内联比较 */
  const getInvMergeKey = (entry) => {
    if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      const customName = entry.name && entry.name.trim()
      if (customName) return customName
      return getItemDisplayName(item) || '—'
    }
    return entry?.name ?? '—'
  }
  const isSameItemForMerge = (a, b) => a && b && getInvMergeKey(a) === getInvMergeKey(b)

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('opacity-50')
  }
  const handleDragEnd = (e) => e.currentTarget.classList.remove('opacity-50')
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) return
    const source = inv[fromIndex]
    const target = inv[toIndex]
    if (isSameItemForMerge(source, target)) {
      setEditingIndex(null)
      const qtyT = Math.max(1, Number(target?.qty) ?? 1)
      const qtyS = Math.max(1, Number(source?.qty) ?? 1)
      const chargeT = Number(target?.charge) || 0
      const chargeS = Number(source?.charge) || 0
      const merged = { ...target, qty: qtyT + qtyS, charge: chargeT + chargeS }
      const next = inv.filter((_, i) => i !== fromIndex)
      const newToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      next[newToIndex] = merged
      onSave({ inventory: next })
    } else {
      reorderInventory(fromIndex, toIndex)
    }
  }
  const setQty = (index, value) => {
    const n = Math.max(1, parseInt(value, 10) || 1)
    const next = inv.map((e, i) => (i === index ? { ...e, qty: n } : e))
    onSave({ inventory: next })
  }
  const setMagicBonus = (index, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    const next = inv.map((e, i) => (i === index ? { ...e, magicBonus: n } : e))
    onSave({ inventory: next })
  }
  const setCharge = (index, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    const next = inv.map((e, i) => (i === index ? { ...e, charge: n } : e))
    onSave({ inventory: next })
  }

  const startEdit = (index) => {
    if (inv[index]) setEditingIndex(index)
  }
  const applyEditSave = (entry) => {
    if (editingIndex == null) return
    const next = [...inv]
    next[editingIndex] = entry
    onSave({ inventory: next })
    setEditingIndex(null)
  }

  const openStoreToVault = (index) => {
    setStoreToVaultIndex(index)
    setStoreToVaultQty(1)
  }
  const confirmStoreToVault = () => {
    if (storeToVaultIndex == null) return
    const e = inv[storeToVaultIndex]
    if (!e) { setStoreToVaultIndex(null); return }
    const q = Math.max(1, Number(e.qty) ?? 1)
    const toStore = Math.min(Math.max(1, storeToVaultQty), q)
    const moduleId = character?.moduleId ?? 'default'
    if (e.itemId) {
      addToWarehouse(moduleId, {
        itemId: e.itemId,
        name: e.name,
        攻击: e.攻击,
        伤害: e.伤害,
        攻击距离: e.攻击距离,
        详细介绍: e.详细介绍,
        ...(e.附注 ? { 附注: e.附注 } : {}),
        qty: toStore,
      })
    } else {
      addToWarehouse(moduleId, { name: e.name || '—', qty: toStore })
    }
    if (toStore >= q) {
      onSave({ inventory: inv.filter((_, i) => i !== storeToVaultIndex) })
    } else {
      const next = inv.map((entry, i) => (i === storeToVaultIndex ? { ...entry, qty: q - toStore } : entry))
      onSave({ inventory: next })
    }
    setStoreToVaultIndex(null)
    setStoreToVaultQty(1)
  }

  const handleTransferSuccess = () => {
    setWallet(getCharacterWallet(character.id))
    onWalletSuccess?.()
  }

  const invDisplayName = (entry) => {
    if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      const customName = entry.name && entry.name.trim()
      if (customName) return customName
      return getItemDisplayName(item) || '—'
    }
    return entry?.name ?? '—'
  }
  const getEntryWeight = (entry) => {
    if (entry?.重量 != null && entry?.重量 !== '') return parseWeightString(entry.重量)
    if (!entry?.itemId) return 0
    return getItemWeightLb(getItemById(entry.itemId))
  }
  const getEntryBriefFull = (entry) => {
    const brief = entry?.详细介绍?.trim()
    const range = entry?.攻击距离?.trim()
    const parts = []
    if (brief) parts.push(brief)
    if (range) parts.push(`攻击距离 ${range}`)
    if (parts.length) return parts.join('；')
    if (entry?.附注?.trim()) return entry.附注.trim()
    return getItemById(entry?.itemId)?.详细介绍 ?? ''
  }

  const selectClass = 'h-8 rounded bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-white text-xs px-2 min-w-0'
  const slotBaseClass = 'flex flex-col gap-0.5 rounded border border-gray-600 bg-gray-800/80 px-1.5 py-1 min-w-[10rem]'
  const subTitleClass = 'text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5'

  return (
    <div className="rounded-xl border border-gray-600 bg-gray-800/30 overflow-hidden pb-3">
      {/* 上方：同调位独占一行，手持与身穿两列在其下方 */}
      <div className="p-1.5 border-b border-gray-600 space-y-1.5">
        {/* 第一行：同调数独占一行 */}
        <div className="space-y-1">
          <h4 className={subTitleClass}>装备</h4>
          <div className={slotBaseClass}>
            <p className="text-dnd-text-muted text-xs">
              同调位：<span className="text-white font-medium tabular-nums">{attunedCount}/{maxAttunementSlots}</span>
            </p>
          </div>
        </div>
        {/* 第二行：手持 | 身穿 两列 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          <div className="space-y-1">
            <h4 className={subTitleClass}>手持</h4>
            {/* 主手、副手 */}
            <div className="flex flex-col gap-1">
              {heldSlots.slice(0, HELD_FIXED).map((slot, i) => {
                const entry = slot.inventoryId ? inv.find((e) => e.id === slot.inventoryId) ?? null : null
                const proto = entry?.itemId ? getItemById(entry.itemId) : null
                const isShield = proto?.类型 === '盔甲' && proto?.子类型 === '盾牌'
                const shieldMagicBonus = Number(entry?.magicBonus) || 0
                const options = getHeldOptions(inv, i)
                return (
                  <div key={slot.id} className={slotBaseClass}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-400 text-xs shrink-0 w-12">{HELD_LABELS[i]}</span>
                      {canEdit ? (
                        <>
                          <select
                            value={slot.inventoryId || ''}
                            onChange={(e) => setHeldEquip(i, e.target.value)}
                            className={selectClass + ' flex-1 min-w-0'}
                          >
                            <option value="">— 选择 —</option>
                            {options.map((e) => (
                              <option key={e.id} value={e.id}>{getEntryDisplayName(e)}</option>
                            ))}
                          </select>
                          {i === 1 && isShield && entry && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-gray-500 text-[10px]">盾牌增强</span>
                              <div className="flex items-center rounded border border-gray-600 bg-gray-800 overflow-hidden h-7">
                                <button type="button" onClick={() => setWornMagicBonus(entry.id, String(Math.max(0, shieldMagicBonus - 1)))} className="px-1.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-r border-gray-600 font-medium text-sm shrink-0">−</button>
                                <input type="number" min={0} value={shieldMagicBonus || ''} onChange={(e) => setWornMagicBonus(entry.id, e.target.value)} className="w-10 h-full bg-transparent border-0 text-center text-white text-xs tabular-nums px-0.5 focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                                <button type="button" onClick={() => setWornMagicBonus(entry.id, String(shieldMagicBonus + 1))} className="px-1.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-l border-gray-600 font-medium text-sm shrink-0">+</button>
                              </div>
                            </div>
                          )}
                          <label className={`flex items-center gap-1 shrink-0 ${entry ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`} title="同调">
                            <input
                              type="checkbox"
                              checked={!!entry?.isAttuned}
                              disabled={!entry || (!entry.isAttuned && attunedCount >= maxAttunementSlots)}
                              onChange={(e) => entry && toggleAttunedForEntry(entry.id, e.target.checked)}
                              className="rounded border-gray-500"
                            />
                            <span className="text-gray-500 text-[10px]">同调</span>
                          </label>
                        </>
                      ) : (
                        <>
                          <span className="text-white text-sm flex-1">{getEntryDisplayName(entry)}</span>
                          {i === 1 && isShield && shieldMagicBonus > 0 && (
                            <span className="text-amber-200/90 text-xs font-mono shrink-0" title="盾牌增强加值">+{shieldMagicBonus}</span>
                          )}
                        </>
                      )}
                    </div>
                    {i === 1 && entry && isShield && (() => {
                      const parsed = parseArmorNote(entry.附注 ?? proto?.附注 ?? '')
                      const baseAC = parsed?.isShield ? (parsed.bonus || 2) : 2
                      return (
                        <p className="text-amber-200/90 text-[10px]">
                          AC +{baseAC}{shieldMagicBonus > 0 ? <span className="ml-1">盾牌增强 +{shieldMagicBonus}</span> : null}
                        </p>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
            {/* 备用栏 */}
            <div className="flex flex-col gap-1">
              {heldSlots.slice(HELD_FIXED).map((slot, i) => {
                  const idx = HELD_FIXED + i
                  const entry = slot.inventoryId ? inv.find((e) => e.id === slot.inventoryId) ?? null : null
                  const options = getHeldOptions(inv, idx)
                  return (
                    <div key={slot.id} className={slotBaseClass}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-400 text-xs shrink-0 w-12">备用{i + 1}</span>
                        {canEdit ? (
                          <>
                            <select
                              value={slot.inventoryId || ''}
                              onChange={(e) => setHeldEquip(idx, e.target.value)}
                              className={selectClass + ' flex-1 min-w-0'}
                            >
                              <option value="">— 选择 —</option>
                              {options.map((e) => (
                                <option key={e.id} value={e.id}>{getEntryDisplayName(e)}</option>
                              ))}
                            </select>
                            {heldSlots.length > HELD_FIXED && (
                              <button type="button" onClick={() => removeHeldSlot(idx)} className="p-1 rounded text-gray-500 hover:text-dnd-red hover:bg-red-900/20 shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <label className={`flex items-center gap-1 shrink-0 ${entry ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`} title="同调">
                              <input
                                type="checkbox"
                                checked={!!entry?.isAttuned}
                                disabled={!entry || (!entry.isAttuned && attunedCount >= maxAttunementSlots)}
                                onChange={(e) => entry && toggleAttunedForEntry(entry.id, e.target.checked)}
                                className="rounded border-gray-500"
                              />
                              <span className="text-gray-500 text-[10px]">同调</span>
                            </label>
                          </>
                        ) : (
                          <span className="text-white text-sm flex-1">{getEntryDisplayName(entry)}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              {canEdit && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-gray-500 text-xs">可增加备用栏</span>
                  <button
                    type="button"
                    onClick={addHeldSlot}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 border border-gray-600 hover:border-gray-500 rounded px-2 py-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加备用
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 身穿（同调位下方第二列） */}
          <div className="space-y-1">
            <h4 className={subTitleClass}>身穿</h4>
            {/* 身体（固定） */}
            <div className={slotBaseClass}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-400 text-xs shrink-0 w-12">身体</span>
                {canEdit ? (
                  <>
                    <select
                      value={bodySlot.inventoryId || ''}
                      onChange={(e) => setWornEquip(e.target.value)}
                      className={selectClass + ' flex-1 min-w-0'}
                    >
                      <option value="">— 选择 —</option>
                      {getWornOptions(inv, 'body').map((e) => (
                        <option key={e.id} value={e.id}>{getEntryDisplayName(e)}</option>
                      ))}
                    </select>
                    {bodySlot.inventoryId && (() => {
                      const entry = inv.find((e) => e.id === bodySlot.inventoryId)
                      const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                      const hasStoneLayer = !!stoneEffect
                      const stoneValue = hasStoneLayer ? (Number(stoneEffect.value) || 0) : 0
                      return hasStoneLayer && entry ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-gray-500 text-[10px]">瓦石层</span>
                          <div className="flex items-center rounded border border-gray-600 bg-gray-800 overflow-hidden h-7">
                            <button type="button" onClick={() => setWornStoneLayer(entry.id, String(Math.max(0, stoneValue - 1)))} className="px-1.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-r border-gray-600 font-medium text-sm shrink-0">−</button>
                            <input type="number" min={0} value={stoneValue || ''} onChange={(e) => setWornStoneLayer(entry.id, e.target.value)} className="w-10 h-full bg-transparent border-0 text-center text-white text-xs tabular-nums px-0.5 focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                            <button type="button" onClick={() => setWornStoneLayer(entry.id, String(stoneValue + 1))} className="px-1.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-l border-gray-600 font-medium text-sm shrink-0">+</button>
                          </div>
                        </div>
                      ) : null
                    })()}
                    <label className={`flex items-center gap-1 shrink-0 ${bodySlot.inventoryId ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`} title="同调">
                      <input
                        type="checkbox"
                        checked={!!(inv.find((x) => x.id === bodySlot.inventoryId)?.isAttuned)}
                        disabled={!bodySlot.inventoryId || (!inv.find((x) => x.id === bodySlot.inventoryId)?.isAttuned && attunedCount >= maxAttunementSlots)}
                        onChange={(e) => bodySlot.inventoryId && toggleAttunedForEntry(bodySlot.inventoryId, e.target.checked)}
                        className="rounded border-gray-500"
                      />
                      <span className="text-gray-500 text-[10px]">同调</span>
                    </label>
                  </>
                ) : (
                  <>
                    <span className="text-white text-sm flex-1">{getEntryDisplayName(inv.find((e) => e.id === bodySlot.inventoryId))}</span>
                    {bodySlot.inventoryId && (() => {
                      const entry = inv.find((e) => e.id === bodySlot.inventoryId)
                      const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                      const stoneValue = stoneEffect != null ? (Number(stoneEffect.value) || 0) : 0
                      return stoneEffect && stoneValue > 0 ? (
                        <span className="text-amber-200/90 text-xs font-mono shrink-0" title="瓦石层">{stoneValue}层</span>
                      ) : null
                    })()}
                  </>
                )}
              </div>
            </div>
            {/* 可添加部位 */}
            <div className="flex flex-col gap-1">
              {wornAddable.map((slot, i) => {
                  const entry = slot.inventoryId ? inv.find((e) => e.id === slot.inventoryId) ?? null : null
                  const proto = entry?.itemId ? getItemById(entry.itemId) : null
                  const options = getWornOptions(inv, slot.slotId ?? 'head')
                  const parsed = entry ? parseArmorNote(entry.附注 ?? proto?.附注 ?? '') : null
                  const magicBonus = Number(entry?.magicBonus) || 0
                  const isArmorOrShield = proto?.类型 === '盔甲'
                  const slotLabel = WORN_SLOT_OPTIONS.find((o) => o.id === (slot.slotId ?? 'head'))?.label ?? '部位'
                  return (
                    <div key={slot.id} className={slotBaseClass}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {canEdit ? (
                          <>
                            <select
                              value={slot.slotId ?? 'head'}
                              onChange={(e) => setWornAddableSlotId(i, e.target.value)}
                              className={selectClass + ' w-20 shrink-0'}
                            >
                              {WORN_SLOT_OPTIONS.filter((o) => o.id !== 'body').map((o) => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                              ))}
                            </select>
                            <select
                              value={slot.inventoryId || ''}
                              onChange={(e) => setWornAddableEquip(i, e.target.value)}
                              className={selectClass + ' flex-1 min-w-0'}
                            >
                              <option value="">— 选择物品 —</option>
                              {options.map((e) => (
                                <option key={e.id} value={e.id}>{getEntryDisplayName(e)}</option>
                              ))}
                            </select>
                            {isArmorOrShield && entry && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-gray-500 text-[10px]">增强</span>
                                <div className="flex items-center rounded border border-gray-600 bg-gray-800 overflow-hidden h-7">
                                  <button type="button" onClick={() => setWornMagicBonus(entry.id, String(Math.max(0, magicBonus - 1)))} className="px-1.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-r border-gray-600 font-medium text-sm shrink-0">−</button>
                                  <input type="number" min={0} value={magicBonus || ''} onChange={(e) => setWornMagicBonus(entry.id, e.target.value)} className="w-10 h-full bg-transparent border-0 text-center text-white text-xs tabular-nums px-0.5 focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                                  <button type="button" onClick={() => setWornMagicBonus(entry.id, String(magicBonus + 1))} className="px-1.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-l border-gray-600 font-medium text-sm shrink-0">+</button>
                                </div>
                              </div>
                            )}
                            <button type="button" onClick={() => removeWornSlot(i)} className="p-1 rounded text-gray-500 hover:text-dnd-red hover:bg-red-900/20 shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <label className={`flex items-center gap-1 shrink-0 ${entry ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`} title="同调">
                              <input
                                type="checkbox"
                                checked={!!entry?.isAttuned}
                                disabled={!entry || (!entry.isAttuned && attunedCount >= maxAttunementSlots)}
                                onChange={(e) => entry && toggleAttunedForEntry(entry.id, e.target.checked)}
                                className="rounded border-gray-500"
                              />
                              <span className="text-gray-500 text-[10px]">同调</span>
                            </label>
                          </>
                        ) : (
                          <>
                            <span className="text-gray-400 text-xs shrink-0">{slotLabel}</span>
                            <span className="text-white text-sm flex-1">{getEntryDisplayName(entry)}</span>
                            {entry && isArmorOrShield && magicBonus > 0 && (
                              <span className="text-amber-200/90 text-xs font-mono shrink-0">+{magicBonus}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              {canEdit && (
                <div className="flex items-center justify-end mt-1">
                  <button
                    type="button"
                    onClick={addWornSlot}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 border border-gray-600 hover:border-gray-500 rounded px-2 py-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加身穿
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 下方：背包 + 个人持有（紧凑排版） */}
      <div className="p-1.5 space-y-1.5">
        {/* 背包 */}
        <div className="rounded-xl border border-gray-600 bg-gray-800/30 overflow-hidden">
          <div className="px-1.5 py-1 border-b border-gray-600 flex items-center justify-between flex-wrap gap-1">
            <h3 className={subTitleClass + ' mb-0'}>背包</h3>
            {canEdit && (
              <>
                <button type="button" onClick={() => setAddFormOpen(true)} className="h-7 px-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-xs">
                  添加物品
                </button>
                <ItemAddForm
                  open={addFormOpen}
                  onClose={() => setAddFormOpen(false)}
                  onSave={(entry) => {
                    onSave({ inventory: [...inv, entry] })
                    if (activityActor && character?.name) {
                      const nm = entry?.name?.trim() || '物品'
                      logTeamActivity({
                        actor: activityActor,
                        moduleId: character.moduleId ?? 'default',
                        summary: `玩家 ${activityActor} 为角色「${character.name}」的背包添加了「${nm}」`,
                      })
                    }
                    setAddFormOpen(false)
                  }}
                  submitLabel="放入背包"
                  inventory={inv}
                  spellDC={spellDC}
                  spellAttackBonus={spellAttackBonus}
                />
                <ItemAddForm open={editingIndex !== null} onClose={() => setEditingIndex(null)} onSave={applyEditSave} submitLabel="保存" editEntry={editingIndex != null ? inv[editingIndex] : null} inventory={inv} spellDC={spellDC} spellAttackBonus={spellAttackBonus} />
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="inventory-table w-full text-xs" style={{ tableLayout: 'fixed', minWidth: '520px' }}>
              <colgroup>
                {canEdit && <col style={{ width: '1.9%' }} />}
                <col style={{ width: canEdit ? '12.38%' : '14.29%' }} />
                <col style={{ width: '9.52%' }} />
                <col style={{ width: '54.76%' }} />
                <col style={{ width: '9.52%' }} />
                <col style={{ width: '4.76%' }} />
                {canEdit && <col style={{ width: '7.14%' }} />}
              </colgroup>
              <thead>
                <tr className="bg-gray-800/80 text-dnd-text-muted text-[10px] uppercase tracking-wider" style={{ height: 48, minHeight: 48, maxHeight: 48 }}>
                  {canEdit && <th className="py-0 px-4 align-middle text-center" style={{ height: 48, maxHeight: 48 }} title="拖拽排序" />}
                  <th className="py-0 px-4 font-semibold min-w-0 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>名称</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>充能</th>
                  <th className="py-0 px-4 font-semibold min-w-0 border-l border-gray-600 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>简要介绍</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>数量</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>总重</th>
                  {canEdit && <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }} />}
                </tr>
              </thead>
              <tbody>
                {inv.map((entry, i) => {
                  const qty = Math.max(1, Number(entry?.qty) ?? 1)
                  const unitLb = getEntryWeight(entry)
                  const totalLb = Math.round(unitLb * qty * 100) / 100
                  return (
                    <Fragment key={entry.id ?? `inv-${i}`}>
                      <tr
                        className={`border-t border-gray-700/80 hover:bg-gray-800/40 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                        draggable={canEdit}
                        onDragStart={canEdit ? (e) => handleDragStart(e, i) : undefined}
                        onDragEnd={canEdit ? handleDragEnd : undefined}
                        onDragOver={canEdit ? handleDragOver : undefined}
                        onDrop={canEdit ? (e) => handleDrop(e, i) : undefined}
                      >
                        {canEdit && (
                          <td className="py-1 px-4 align-middle text-center overflow-hidden" title="拖拽调整顺序" style={{ height: 48, maxHeight: 48 }}>
                            <span className="inline-flex justify-center"><GripVertical className="w-3.5 h-3.5" /></span>
                          </td>
                        )}
                        <td className="py-1 px-4 text-white font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          <span className="inline-flex items-center gap-0.5 truncate max-w-full">
                            {invDisplayName(entry)}
                            {(Number(entry.magicBonus) || 0) > 0 ? (
                              <span className="text-amber-200/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                            ) : null}
                            {(() => {
                              const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                              const stoneVal = stoneEffect != null && stoneEffect.value != null ? Number(stoneEffect.value) : null
                              if (stoneVal == null || Number.isNaN(stoneVal)) return null
                              return <span className="text-amber-200/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">{stoneVal}层</span>
                            })()}
                          </span>
                        </td>
                        <td className="py-1 px-2 border-l border-gray-600 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          {canEdit ? (
                            <div className="flex justify-center">
                              <NumberStepper
                                value={Number(entry.charge) || 0}
                                onChange={(v) => setCharge(i, v)}
                                min={0}
                                compact
                                pill
                              />
                            </div>
                          ) : (Number(entry.charge) || 0) > 0 ? (
                            <span className="tabular-nums text-dnd-text-body text-xs">{entry.charge}</span>
                          ) : null}
                        </td>
                        <td className="inventory-table-cell-brief py-1 px-4 text-dnd-text-body text-xs min-w-0 overflow-hidden border-l border-gray-600 align-middle text-left" style={{ height: 48, maxHeight: 48, overflow: 'hidden' }} title={getEntryBriefFull(entry) || undefined}>
                          <div className="min-h-0 overflow-hidden" style={{ maxHeight: 40 }}>
                            <span className="line-clamp-2 text-left inline-block w-full break-words">{getEntryBriefFull(entry) || '—'}</span>
                          </div>
                        </td>
                        <td className="py-1 px-2 border-l border-gray-600 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          {canEdit ? (
                            <div className="flex justify-center">
                              <NumberStepper
                                value={qty}
                                onChange={(v) => setQty(i, v)}
                                min={1}
                                compact
                                pill
                              />
                            </div>
                          ) : (
                            <span className="tabular-nums text-dnd-text-body text-xs">{qty}</span>
                          )}
                        </td>
                        <td className="py-1 px-2 tabular-nums text-dnd-text-body border-l border-gray-600 align-middle text-center overflow-hidden whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>{totalLb ? `${totalLb} lb` : ''}</td>
                        {canEdit && (
                          <td className="py-1 px-1 border-l border-gray-600 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                            <div className="flex items-center justify-center gap-0.5 min-w-0 max-w-full">
                              <button type="button" onClick={() => openStoreToVault(i)} title="存到团队仓库" className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0">
                                <Package size={14} />
                              </button>
                              <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1 rounded text-amber-400 hover:bg-amber-400/20 shrink-0">
                                <Pencil size={14} />
                              </button>
                              <button type="button" onClick={() => removeItem(i)} title="移除" className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {inv.length === 0 && <p className="text-gray-500 text-sm py-2 text-center">暂无物品</p>}
        </div>

        {/* 个人持有（紧凑：核心货币略大于零钱，整体省空间） */}
        <div className="rounded-xl border border-gray-600 bg-gray-800/30 overflow-hidden">
          <h3 className={subTitleClass + ' px-1.5 pt-0.5 pb-0.5 border-b border-gray-600/80'}>个人持有</h3>
          <div className="px-1 py-0.5 flex flex-wrap items-stretch gap-1 min-h-0">
            <div className="flex-1 min-w-[160px] min-h-0 flex flex-col">
              <CurrencyGrid balances={wallet} title={null} fillHeight extraClass="!border-0 !bg-transparent !rounded-none !shadow-none" />
            </div>
            {canEdit && (
              <div className="flex flex-col justify-center shrink-0 w-[7rem] gap-1">
                <button type="button" onClick={() => { setTransferDirection('toVault'); setTransferOpen(true); }} className="h-7 w-full inline-flex items-center justify-center gap-1 rounded-md bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-medium">
                  <ArrowDownToLine size={14} /> 存入金库
                </button>
                <button type="button" onClick={() => { setTransferDirection('fromVault'); setTransferOpen(true); }} className="h-7 w-full inline-flex items-center justify-center gap-1 rounded-md bg-dnd-red hover:bg-dnd-red-hover text-white text-xs font-medium">
                  <ArrowUpFromLine size={14} /> 从金库取出
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-1.5 pt-0.5 pb-1 border-t border-gray-600">
        <h3 className={subTitleClass + ' text-dnd-text-muted font-medium'}>负重（含物品与货币）</h3>
        <EncumbranceBar character={character} />
      </div>

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} direction={transferDirection} characterId={character?.id} characterName={character?.name} onSuccess={handleTransferSuccess} />

      {storeToVaultIndex != null && inv[storeToVaultIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setStoreToVaultIndex(null)}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-dnd-gold-light text-sm font-bold mb-2">存到团队仓库</p>
            <p className="text-dnd-text-muted text-xs mb-2">当前：{invDisplayName(inv[storeToVaultIndex])} × {inv[storeToVaultIndex].qty}</p>
            <div className="flex items-center gap-2 mb-4">
              <label className="text-dnd-text-muted text-xs shrink-0">数量</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, Number(inv[storeToVaultIndex].qty) ?? 1)}
                value={storeToVaultQty}
                onChange={(e) => {
                  const max = Math.max(1, Number(inv[storeToVaultIndex].qty) ?? 1)
                  const v = parseInt(e.target.value, 10)
                  setStoreToVaultQty(Number.isNaN(v) ? 1 : Math.max(1, Math.min(max, v)))
                }}
                className={inputClass + ' h-10 w-24'}
              />
              <span className="text-dnd-text-muted text-xs">/ {inv[storeToVaultIndex].qty}</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setStoreToVaultIndex(null)} className="h-10 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm">取消</button>
              <button type="button" onClick={confirmStoreToVault} className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">确认存入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
