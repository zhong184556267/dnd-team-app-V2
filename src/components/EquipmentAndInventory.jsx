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
import ItemPicker from './ItemPicker'
import EncumbranceBar from './EncumbranceBar'
import TransferModal from './TransferModal'
import { parseArmorNote } from '../lib/formulas'
import { inputClass, textareaClass, labelClass } from '../lib/inputStyles'

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

/** 从护甲附注解析 */
function parseArmorNoteToFields(note) {
  const empty = { isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' }
  if (!note || typeof note !== 'string') return empty
  const s = note.trim()
  if (!s) return empty
  const shieldMatch = s.match(/AC\s*\+\s*(\d+)/i)
  if (shieldMatch) return { ...empty, isShield: true, shieldBonus: shieldMatch[1] }
  let baseAC = '', dexMode = 'none', dexCap = 2
  const armorDexCapMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷\s*[（(]\s*最大\s*(\d+)\s*[）)]/i)
  if (armorDexCapMatch) {
    baseAC = armorDexCapMatch[1]
    dexMode = 'cap2'
    dexCap = parseInt(armorDexCapMatch[2], 10) || 2
  } else {
    const armorDexMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷/i)
    if (armorDexMatch) {
      baseAC = armorDexMatch[1]
      dexMode = 'full'
    } else {
      const armorFixedMatch = s.match(/AC\s*(\d+)/i)
      if (armorFixedMatch) {
        baseAC = armorFixedMatch[1]
        dexMode = 'none'
      }
    }
  }
  let strReq = ''
  const strMatch = s.match(/力量\s*(\d+)/i)
  if (strMatch) strReq = strMatch[1]
  const stealth = /隐匿\s*劣势/i.test(s) ? '劣势' : '—'
  return { ...empty, isShield: false, baseAC, dexMode, dexCap, strReq, stealth }
}

function buildArmorNoteFromFields(fields) {
  if (!fields) return ''
  if (fields.isShield) {
    const n = fields.shieldBonus === '' ? '0' : String(fields.shieldBonus)
    return `AC +${n}；力量—；隐匿—`
  }
  const base = fields.baseAC === '' ? '0' : String(fields.baseAC)
  let acPart = `AC ${base}`
  if (fields.dexMode === 'full') acPart += '+敏捷'
  else if (fields.dexMode === 'cap2') acPart += `+敏捷（最大${fields.dexCap ?? 2}）`
  const strPart = fields.strReq === '' ? '—' : fields.strReq
  const stealthPart = fields.stealth === '劣势' ? '劣势' : '—'
  return `${acPart}；力量${strPart}；隐匿${stealthPart}`
}

/** 手持：主手 武器+法器+枪械, 副手 盾牌+武器+枪械, 备用 法器+武器 */
function getHeldOptions(inv, slotIndex) {
  return inv.filter((e) => {
    const proto = e.itemId ? getItemById(e.itemId) : null
    const t = proto?.类型 ?? ''
    const sub = proto?.子类型 ?? ''
    if (slotIndex === 0) return t === '武器' || t === '枪械' || t === '法器'
    if (slotIndex === 1) return (t === '盔甲' && sub === '盾牌') || t === '武器' || t === '枪械'
    return t === '法器' || t === '武器'
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

/** 构建 equipment 以支持 AC 计算 */
function buildEquipmentForAC(heldSlots, wornSlots, inv) {
  const eq = {}
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

export default function EquipmentAndInventory({ character, canEdit, onSave, onWalletSuccess }) {
  const inv = character?.inventory ?? []
  const migrated = migrateSlots(character)
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
  const [selectedItemId, setSelectedItemId] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [instance攻击, setInstance攻击] = useState('')
  const [instance伤害, setInstance伤害] = useState('')
  const [instance攻击距离, setInstance攻击距离] = useState('')
  const [instance详细介绍, setInstance详细介绍] = useState('')
  const [instance附注, setInstance附注] = useState('')
  const [instanceArmorFields, setInstanceArmorFields] = useState(() => parseArmorNoteToFields(''))
  const [instanceQty, setInstanceQty] = useState(1)
  const [instanceMagicBonus, setInstanceMagicBonus] = useState(0)
  const [instanceCharge, setInstanceCharge] = useState(0)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editName, setEditName] = useState('')
  const [edit攻击, setEdit攻击] = useState('')
  const [edit伤害, setEdit伤害] = useState('')
  const [edit攻击距离, setEdit攻击距离] = useState('')
  const [edit详细介绍, setEdit详细介绍] = useState('')
  const [edit附注, setEdit附注] = useState('')
  const [editArmorFields, setEditArmorFields] = useState(() => parseArmorNoteToFields(''))
  const [editQty, setEditQty] = useState(1)
  const [editMagicBonus, setEditMagicBonus] = useState(0)
  const [editCharge, setEditCharge] = useState(0)
  const [storeToVaultIndex, setStoreToVaultIndex] = useState(null)
  const [storeToVaultQty, setStoreToVaultQty] = useState(1)

  const selectedPrototype = selectedItemId ? getItemById(selectedItemId) : null
  const showAttackDamage = selectedPrototype && (selectedPrototype.类型 === '武器' || selectedPrototype.类型 === '枪械')
  const showArmorNote = selectedPrototype && selectedPrototype.类型 === '盔甲'

  useEffect(() => {
    if (character?.id) setWallet(getCharacterWallet(character.id))
  }, [character?.id, character?.wallet])

  useEffect(() => {
    if (!selectedItemId) return
    const proto = getItemById(selectedItemId)
    setInstanceName('')
    setInstance攻击(proto?.攻击 ?? '')
    setInstance伤害(proto?.伤害 ?? '')
    setInstance攻击距离(proto?.攻击距离 ?? '')
    setInstance详细介绍(proto?.详细介绍 ?? '')
    setInstance附注(proto?.附注 ?? '')
    if (proto?.类型 === '盔甲') setInstanceArmorFields(parseArmorNoteToFields(proto?.附注 ?? ''))
    setInstanceQty(1)
    setInstanceMagicBonus(0)
    setInstanceCharge(0)
  }, [selectedItemId])

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

  const handleAddFromPicker = () => {
    if (!selectedItemId) return
    const proto = getItemById(selectedItemId)
    const 附注Value = showArmorNote ? buildArmorNoteFromFields(instanceArmorFields) : (instance附注?.trim() || '')
    const entry = {
      id: 'inv_' + Date.now(),
      itemId: selectedItemId,
      name: (instanceName && instanceName.trim()) || proto?.类别 || getItemDisplayName(proto) || '—',
      攻击: (instance攻击 && instance攻击.trim()) || (proto?.攻击 ?? ''),
      伤害: (instance伤害 && instance伤害.trim()) || (proto?.伤害 ?? ''),
      攻击距离: (instance攻击距离 && instance攻击距离.trim()) || (proto?.攻击距离 ?? ''),
      详细介绍: instance详细介绍?.trim() ?? '',
      ...(附注Value ? { 附注: 附注Value } : {}),
      重量: proto?.重量,
      qty: Math.max(1, instanceQty),
      isAttuned: false,
      magicBonus: Number(instanceMagicBonus) || 0,
      charge: Number(instanceCharge) || 0,
    }
    onSave({ inventory: [...inv, entry] })
    setSelectedItemId('')
    setInstanceName('')
    setInstance攻击距离('')
    setInstanceQty(1)
    setInstanceMagicBonus(0)
    setInstanceCharge(0)
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
    reorderInventory(fromIndex, toIndex)
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
    const e = inv[index]
    if (!e) return
    const proto = e.itemId ? getItemById(e.itemId) : null
    setEditingIndex(index)
    setEditName((e.name && e.name.trim()) || (proto ? getItemDisplayName(proto) : '') || '')
    setEdit攻击((e.攻击 != null && e.攻击 !== '') ? String(e.攻击) : '')
    setEdit伤害((e.伤害 != null && e.伤害 !== '') ? String(e.伤害) : '')
    setEdit攻击距离((e.攻击距离 != null && e.攻击距离 !== '') ? String(e.攻击距离) : '')
    setEdit详细介绍((e.详细介绍 != null && e.详细介绍 !== '') ? String(e.详细介绍) : '')
    setEdit附注((e.附注 != null && e.附注 !== '') ? String(e.附注) : '')
    if (proto?.类型 === '盔甲') setEditArmorFields(parseArmorNoteToFields(e.附注 ?? ''))
    setEditQty(Math.max(1, Number(e.qty) ?? 1))
    setEditMagicBonus(Number(e.magicBonus) || 0)
    setEditCharge(Number(e.charge) || 0)
  }
  const saveEdit = () => {
    if (editingIndex == null) return
    const e = inv[editingIndex]
    const proto = e.itemId ? getItemById(e.itemId) : null
    const 附注Value = proto?.类型 === '盔甲' ? buildArmorNoteFromFields(editArmorFields) : (edit附注 != null && String(edit附注).trim() !== '' ? String(edit附注).trim() : (e.附注 ?? ''))
    const next = [...inv]
    next[editingIndex] = {
      ...e,
      name: (editName && editName.trim()) || (proto ? getItemDisplayName(proto) : null) || e.name || '—',
      攻击: (edit攻击 && edit攻击.trim()) ?? e.攻击,
      伤害: (edit伤害 && edit伤害.trim()) ?? e.伤害,
      攻击距离: (edit攻击距离 && edit攻击距离.trim()) ?? e.攻击距离 ?? '',
      详细介绍: edit详细介绍?.trim() ?? e.详细介绍 ?? '',
      附注: 附注Value,
      qty: Math.max(1, editQty),
      magicBonus: Number(editMagicBonus) || 0,
      charge: Number(editCharge) || 0,
    }
    onSave({ inventory: next })
    setEditingIndex(null)
  }
  const cancelEdit = () => setEditingIndex(null)

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
  const slotBaseClass = 'flex flex-col gap-0.5 rounded border border-gray-600 bg-gray-800/80 px-2 py-1.5 min-w-[10rem]'
  const subTitleClass = 'text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1'

  return (
    <div className="rounded-xl border border-gray-600 bg-gray-800/30 overflow-hidden pb-28">
      {/* 上方：手持与身穿 */}
      <div className="p-3 border-b border-gray-600">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 左：手持 */}
          <div className="space-y-1.5">
            <h4 className={subTitleClass}>手持</h4>
            {/* 主手、副手 */}
            <div className="flex flex-col gap-1.5">
              {heldSlots.slice(0, HELD_FIXED).map((slot, i) => {
                const entry = slot.inventoryId ? inv.find((e) => e.id === slot.inventoryId) ?? null : null
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
            </div>
            {/* 备用栏 */}
            <div className="flex flex-col gap-1.5">
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
                <div className="flex items-center justify-between mt-2">
                  <span className="text-gray-500 text-xs">可增加备用栏</span>
                  <button
                    type="button"
                    onClick={addHeldSlot}
                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 border border-gray-600 hover:border-amber-500/50 rounded px-2 py-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加备用
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 右：身穿 */}
          <div className="space-y-1.5">
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
                      const proto = entry?.itemId ? getItemById(entry.itemId) : null
                      const isArmor = proto?.类型 === '盔甲'
                      const mb = Number(entry?.magicBonus) || 0
                      return isArmor && entry ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-gray-500 text-[10px]">增强</span>
                          <div className="flex items-center rounded border border-gray-600 bg-gray-800 overflow-hidden h-7">
                            <button type="button" onClick={() => setWornMagicBonus(entry.id, String(Math.max(0, mb - 1)))} className="px-1.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-r border-gray-600 font-medium text-sm shrink-0">−</button>
                            <input type="number" min={0} value={mb || ''} onChange={(e) => setWornMagicBonus(entry.id, e.target.value)} className="w-10 h-full bg-transparent border-0 text-center text-white text-xs tabular-nums px-0.5 focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                            <button type="button" onClick={() => setWornMagicBonus(entry.id, String(mb + 1))} className="px-1.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-l border-gray-600 font-medium text-sm shrink-0">+</button>
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
                      const proto = entry?.itemId ? getItemById(entry.itemId) : null
                      return proto?.类型 === '盔甲' && entry?.magicBonus > 0 ? (
                        <span className="text-amber-200/90 text-xs font-mono shrink-0">+{entry.magicBonus}</span>
                      ) : null
                    })()}
                  </>
                )}
              </div>
              {bodySlot.inventoryId && (() => {
                const entry = inv.find((e) => e.id === bodySlot.inventoryId)
                const proto = entry?.itemId ? getItemById(entry.itemId) : null
                const parsed = entry ? parseArmorNote(entry.附注 ?? proto?.附注 ?? '') : null
                const magicBonus = Number(entry?.magicBonus) || 0
                return parsed && !parsed.isShield ? (
                  <p className="text-amber-200/90 text-[10px]">
                    AC {parsed.baseAC ?? 10}{parsed.addDex ? (parsed.dexCap != null ? `+敏调(最大${parsed.dexCap})` : '+敏调') : ''}
                    {magicBonus > 0 && <span className="ml-1">+{magicBonus}</span>}
                  </p>
                ) : null
              })()}
            </div>
            {/* 可添加部位 */}
            <div className="flex flex-col gap-1.5">
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
                      {entry && parsed && !parsed.isShield && (
                        <p className="text-amber-200/90 text-[10px]">
                          AC {parsed.baseAC ?? 10}{parsed.addDex ? (parsed.dexCap != null ? `+敏调(最大${parsed.dexCap})` : '+敏调') : ''}
                          {magicBonus > 0 && <span className="ml-1">+{magicBonus}</span>}
                        </p>
                      )}
                    </div>
                  )
                })}
              {canEdit && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-gray-500 text-xs">可添加部位</span>
                  <button
                    type="button"
                    onClick={addWornSlot}
                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 border border-gray-600 hover:border-amber-500/50 rounded px-2 py-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 下方：背包 */}
      <div className="p-3 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
        <div className="min-w-0">
          <h3 className={subTitleClass + ' mb-1.5'}>背包</h3>
          {canEdit && (
            <div className="space-y-2 mb-2">
              <div className="flex-1 min-w-[18rem]">
                <ItemPicker
                  value={selectedItemId}
                  onChange={setSelectedItemId}
                  placeholder="通过下拉菜单选择类似物品再修改属性加入"
                />
              </div>
              {selectedItemId && selectedPrototype && (
                <div className="rounded border border-gray-600 bg-gray-800/60 p-2 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-dnd-text-muted text-xs mb-1">名称</label>
                      <input
                        type="text"
                        value={instanceName}
                        onChange={(e) => setInstanceName(e.target.value)}
                        placeholder={`不填则用「${getItemDisplayName(selectedPrototype)}」`}
                        className={inputClass + ' h-10'}
                      />
                    </div>
                    {showArmorNote && (
                      <div className="sm:col-span-2 space-y-2">
                        <p className="text-dnd-text-muted text-xs">附注（护甲等级 AC、力量、隐匿）</p>
                        {instanceArmorFields.isShield ? (
                          <div>
                            <label className="block text-dnd-text-muted text-[10px] mb-0.5">AC 加值</label>
                            <input
                              type="number"
                              min={0}
                              value={instanceArmorFields.shieldBonus}
                              onChange={(e) => setInstanceArmorFields((f) => ({ ...f, shieldBonus: e.target.value }))}
                              className={inputClass + ' h-9 w-20'}
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">基础 AC</label>
                              <input type="number" min={0} value={instanceArmorFields.baseAC} onChange={(e) => setInstanceArmorFields((f) => ({ ...f, baseAC: e.target.value }))} placeholder="12" className={inputClass + ' h-9'} />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">敏调</label>
                              <select
                                value={instanceArmorFields.dexMode}
                                onChange={(e) => setInstanceArmorFields((f) => ({ ...f, dexMode: e.target.value }))}
                                className="h-9 w-full rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                              >
                                <option value="none">不加</option>
                                <option value="full">加敏捷</option>
                                <option value="cap2">加敏捷（最大）</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">力量要求</label>
                              <input type="text" value={instanceArmorFields.strReq} onChange={(e) => setInstanceArmorFields((f) => ({ ...f, strReq: e.target.value }))} placeholder="— 或 13" className={inputClass + ' h-9'} />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">隐匿</label>
                              <select
                                value={instanceArmorFields.stealth}
                                onChange={(e) => setInstanceArmorFields((f) => ({ ...f, stealth: e.target.value }))}
                                className="h-9 w-full rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                              >
                                <option value="—">—</option>
                                <option value="劣势">劣势</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {showAttackDamage && (
                      <>
                        <div>
                          <label className="block text-dnd-text-muted text-xs mb-1">攻击</label>
                          <input type="text" value={instance攻击} onChange={(e) => setInstance攻击(e.target.value)} placeholder="如：1d8 挥砍" className={inputClass + ' h-10'} />
                        </div>
                        <div>
                          <label className="block text-dnd-text-muted text-xs mb-1">伤害类型</label>
                          <input type="text" value={instance伤害} onChange={(e) => setInstance伤害(e.target.value)} placeholder="如：挥砍、穿刺、贯穿" className={inputClass + ' h-10'} />
                        </div>
                        <div>
                          <label className="block text-dnd-text-muted text-xs mb-1">攻击距离</label>
                          <input type="text" value={instance攻击距离} onChange={(e) => setInstance攻击距离(e.target.value)} placeholder="如：20/40、30/60" className={inputClass + ' h-10'} />
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <label className="block text-dnd-text-muted text-xs mb-1">详细描述</label>
                      <textarea value={instance详细介绍} onChange={(e) => setInstance详细介绍(e.target.value)} placeholder="附魔、说明等" rows={2} className={textareaClass} />
                    </div>
                    <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                      <div className="w-20">
                        <label className="block text-dnd-text-muted text-xs mb-1">数量</label>
                        <input type="number" min={1} value={instanceQty} onChange={(e) => setInstanceQty(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-10'} />
                      </div>
                      <div className="w-28">
                        <label className="block text-dnd-text-muted text-xs mb-1">增强加值</label>
                        <div className="flex items-center rounded-lg border border-gray-600 bg-gray-800 overflow-hidden h-10">
                          <button type="button" onClick={() => setInstanceMagicBonus(Math.max(0, (instanceMagicBonus || 0) - 1))} className="px-2.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-r border-gray-600 font-medium text-lg shrink-0">−</button>
                          <input type="number" min={0} value={instanceMagicBonus || ''} onChange={(e) => setInstanceMagicBonus(parseInt(e.target.value, 10) || 0)} className="w-12 h-full bg-transparent border-0 text-center text-white text-sm tabular-nums px-1 focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                          <button type="button" onClick={() => setInstanceMagicBonus((instanceMagicBonus || 0) + 1)} className="px-2.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-l border-gray-600 font-medium text-lg shrink-0">+</button>
                        </div>
                      </div>
                      <div className="w-20">
                        <label className="block text-dnd-text-muted text-xs mb-1">充能</label>
                        <input type="number" min={0} value={instanceCharge || ''} onChange={(e) => setInstanceCharge(parseInt(e.target.value, 10) || 0)} placeholder="0" className={inputClass + ' h-10'} />
                      </div>
                      <button type="button" onClick={handleAddFromPicker} className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm">放入背包</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="rounded border border-gray-600 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800/80 text-dnd-text-muted text-[10px] uppercase tracking-wider">
                  {canEdit && <th className="py-1.5 px-1 w-8" title="拖拽排序" />}
                  {canEdit && <th className="text-center py-1.5 px-1.5 w-10" title="同调">同调</th>}
                  <th className="text-left py-1.5 px-2 font-semibold">名称</th>
                  <th className="text-left py-1.5 px-2 font-semibold min-w-[14rem] max-w-[24rem]">简要介绍</th>
                  <th className="text-right py-1.5 px-1.5 w-12">充能</th>
                  <th className="text-right py-1.5 px-1.5 w-12">数量</th>
                  <th className="text-right py-1.5 px-1.5 w-14">总重</th>
                  {canEdit && <th className="w-12" />}
                </tr>
              </thead>
              <tbody>
                {inv.map((entry, i) => {
                  const qty = Math.max(1, Number(entry?.qty) ?? 1)
                  const unitLb = getEntryWeight(entry)
                  const totalLb = Math.round(unitLb * qty * 100) / 100
                  const canAttune = entry.isAttuned || attunedCount < maxAttunementSlots
                  const isEditing = canEdit && editingIndex === i
                  return (
                    <Fragment key={entry.id ?? `inv-${i}`}>
                      <tr
                        className={`border-t border-gray-700/80 hover:bg-gray-800/40 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        draggable={canEdit}
                        onDragStart={canEdit ? (e) => handleDragStart(e, i) : undefined}
                        onDragEnd={canEdit ? handleDragEnd : undefined}
                        onDragOver={canEdit ? handleDragOver : undefined}
                        onDrop={canEdit ? (e) => handleDrop(e, i) : undefined}
                      >
                        {canEdit && (
                          <td className="py-1.5 px-1 text-gray-500" title="拖拽调整顺序">
                            <GripVertical className="w-4 h-4" />
                          </td>
                        )}
                        {canEdit && (
                          <td className="py-1.5 px-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={!!entry.isAttuned}
                              disabled={!canAttune && !entry.isAttuned}
                              onChange={(e) => setAttuned(i, e.target.checked)}
                              className="rounded border-gray-500"
                            />
                          </td>
                        )}
                        <td className="py-1.5 px-2 text-white font-medium align-middle">
                          <span className="inline-flex items-center gap-0.5">
                            {invDisplayName(entry)}
                            {(Number(entry.magicBonus) || 0) > 0 ? (
                              <span className="text-amber-200/90 text-xs font-mono tabular-nums">+{entry.magicBonus}</span>
                            ) : null}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-dnd-text-body max-w-[24rem] min-w-[14rem]">
                          <span className="line-clamp-2" title={getEntryBriefFull(entry)}>{getEntryBriefFull(entry) || '—'}</span>
                        </td>
                        <td className="py-1.5 px-1.5 text-right">
                          {canEdit ? (
                            <input
                              type="number"
                              min={0}
                              value={Number(entry.charge) || ''}
                              onChange={(e) => setCharge(i, e.target.value)}
                              placeholder="0"
                              className="w-12 h-7 rounded bg-gray-700 border border-gray-600 text-white text-right text-xs tabular-nums px-1 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500"
                            />
                          ) : (Number(entry.charge) || 0) > 0 ? (
                            <span className="tabular-nums text-dnd-text-body">{entry.charge}</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 px-1.5 text-right">
                          {canEdit ? (
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => setQty(i, e.target.value)}
                              className="w-12 h-7 rounded bg-gray-700 border border-gray-600 text-white text-right text-xs tabular-nums px-1 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                            />
                          ) : (
                            <span className="tabular-nums text-dnd-text-body">{qty}</span>
                          )}
                        </td>
                        <td className="text-right py-1.5 px-1.5 tabular-nums text-dnd-text-body">{totalLb ? `${totalLb} lb` : ''}</td>
                        {canEdit && (
                          <td className="py-1.5 px-1.5">
                            <div className="flex items-center gap-0.5">
                              <button type="button" onClick={() => openStoreToVault(i)} title="存到团队仓库" className="p-1.5 rounded text-emerald-400 hover:bg-emerald-400/20">
                                <Package size={16} />
                              </button>
                              <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1.5 rounded text-amber-400 hover:bg-amber-400/20">
                                <Pencil size={16} />
                              </button>
                              <button type="button" onClick={() => removeItem(i)} title="移除" className="p-1.5 rounded text-dnd-red hover:text-dnd-red/20">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {isEditing && (
                        <tr className="border-t-0 bg-gray-800/80">
                          <td colSpan={canEdit ? 9 : 6} className="py-3 px-3">
                            <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="sm:col-span-2">
                                  <label className="block text-dnd-text-muted text-xs mb-1">名称</label>
                                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="名称" className={inputClass + ' h-10'} />
                                </div>
                                {(() => {
                                  const editingProto = inv[editingIndex]?.itemId ? getItemById(inv[editingIndex].itemId) : null
                                  const showEditAttackDamage = editingProto && (editingProto.类型 === '武器' || editingProto.类型 === '枪械')
                                  return showEditAttackDamage ? (
                                    <>
                                      <div>
                                        <label className="block text-dnd-text-muted text-xs mb-1">攻击（伤害骰与类型）</label>
                                        <input type="text" value={edit攻击} onChange={(e) => setEdit攻击(e.target.value)} placeholder="如：1d8 挥砍" className={inputClass + ' h-10'} />
                                      </div>
                                      <div>
                                        <label className="block text-dnd-text-muted text-xs mb-1">伤害类型</label>
                                        <input type="text" value={edit伤害} onChange={(e) => setEdit伤害(e.target.value)} placeholder="如：挥砍、穿刺、贯穿" className={inputClass + ' h-10'} />
                                      </div>
                                      <div>
                                        <label className="block text-dnd-text-muted text-xs mb-1">攻击距离</label>
                                        <input type="text" value={edit攻击距离} onChange={(e) => setEdit攻击距离(e.target.value)} placeholder="如：20/40、30/60" className={inputClass + ' h-10'} />
                                      </div>
                                    </>
                                  ) : null
                                })()}
                                {inv[editingIndex]?.itemId && getItemById(inv[editingIndex].itemId)?.类型 === '盔甲' && (
                                  <div className="sm:col-span-2 space-y-2">
                                    <p className="text-dnd-text-muted text-xs">附注（护甲 AC、力量、隐匿）</p>
                                    {editArmorFields.isShield ? (
                                      <div>
                                        <label className="block text-dnd-text-muted text-[10px] mb-0.5">AC 加值</label>
                                        <input type="number" min={0} value={editArmorFields.shieldBonus} onChange={(e) => setEditArmorFields((f) => ({ ...f, shieldBonus: e.target.value }))} className={inputClass + ' h-9 w-20'} />
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <div>
                                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">基础 AC</label>
                                          <input type="number" min={0} value={editArmorFields.baseAC} onChange={(e) => setEditArmorFields((f) => ({ ...f, baseAC: e.target.value }))} className={inputClass + ' h-9'} />
                                        </div>
                                        <div>
                                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">敏调</label>
                                          <select value={editArmorFields.dexMode} onChange={(e) => setEditArmorFields((f) => ({ ...f, dexMode: e.target.value }))} className="h-9 w-full rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red">
                                            <option value="none">不加</option>
                                            <option value="full">加敏捷</option>
                                            <option value="cap2">加敏捷（最大）</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">力量要求</label>
                                          <input type="text" value={editArmorFields.strReq} onChange={(e) => setEditArmorFields((f) => ({ ...f, strReq: e.target.value }))} className={inputClass + ' h-9'} />
                                        </div>
                                        <div>
                                          <label className="block text-dnd-text-muted text-[10px] mb-0.5">隐匿</label>
                                          <select value={editArmorFields.stealth} onChange={(e) => setEditArmorFields((f) => ({ ...f, stealth: e.target.value }))} className="h-9 w-full rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red">
                                            <option value="—">—</option>
                                            <option value="劣势">劣势</option>
                                          </select>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="sm:col-span-2">
                                  <label className="block text-dnd-text-muted text-xs mb-1">详细描述</label>
                                  <textarea value={edit详细介绍} onChange={(e) => setEdit详细介绍(e.target.value)} placeholder="附魔、说明等" rows={2} className={textareaClass} />
                                </div>
                                <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                                  <div className="w-20">
                                    <label className="block text-dnd-text-muted text-xs mb-1">数量</label>
                                    <input type="number" min={1} value={editQty} onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-10'} />
                                  </div>
                                  <div className="w-28">
                                    <label className="block text-dnd-text-muted text-xs mb-1">增强加值</label>
                                    <div className="flex items-center rounded-lg border border-gray-600 bg-gray-800 overflow-hidden h-10">
                                      <button type="button" onClick={() => setEditMagicBonus(Math.max(0, (editMagicBonus || 0) - 1))} className="px-2.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-r border-gray-600 font-medium text-lg shrink-0">−</button>
                                      <input type="number" min={0} value={editMagicBonus || ''} onChange={(e) => setEditMagicBonus(parseInt(e.target.value, 10) || 0)} className="w-12 h-full bg-transparent border-0 text-center text-white text-sm tabular-nums px-1 focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                                      <button type="button" onClick={() => setEditMagicBonus((editMagicBonus || 0) + 1)} className="px-2.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-l border-gray-600 font-medium text-lg shrink-0">+</button>
                                    </div>
                                  </div>
                                  <div className="w-16">
                                    <label className="block text-dnd-text-muted text-xs mb-1">充能</label>
                                    <input type="number" min={0} value={editCharge || ''} onChange={(e) => setEditCharge(parseInt(e.target.value, 10) || 0)} className={inputClass + ' h-10'} />
                                  </div>
                                  <button type="button" onClick={saveEdit} className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm">保存</button>
                                  <button type="button" onClick={cancelEdit} className="h-10 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm">取消</button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {canEdit && inv.length > 0 && <p className="text-dnd-text-muted text-[10px] mt-0.5">同调位：{attunedCount}/{maxAttunementSlots}</p>}
          {inv.length === 0 && <p className="text-gray-500 text-sm py-3 text-center">暂无物品</p>}
        </div>

        <div className="lg:border-l lg:border-white/10 lg:pl-4">
          <CurrencyGrid balances={wallet} title="个人持有" titleClass={subTitleClass + ' px-0 pt-0'} />
          {canEdit && (
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => { setTransferDirection('toVault'); setTransferOpen(true); }} className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white text-sm font-medium">
                <ArrowDownToLine size={16} /> 存入金库
              </button>
              <button type="button" onClick={() => { setTransferDirection('fromVault'); setTransferOpen(true); }} className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium">
                <ArrowUpFromLine size={16} /> 从金库取出
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pt-2 pb-3 border-t border-gray-600">
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
