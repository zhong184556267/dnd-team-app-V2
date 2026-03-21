/**
 * 装备与背包：合并身穿装备和背包
 * 上方：手持与身穿（左右分栏）
 * 下方：背包
 */
import { useState, useEffect, Fragment, useMemo } from 'react'
import { Plus, Trash2, ArrowDownToLine, ArrowUpFromLine, Pencil, Package, GripVertical } from 'lucide-react'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { getCharacterWallet } from '../lib/currencyStore'
import { addToWarehouse } from '../lib/warehouseStore'
import { CurrencyGrid } from './CurrencyDisplay'
import { getItemWeightLb, parseWeightString, getWalletCurrencyStackWeightLb } from '../lib/encumbrance'
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
import { appendContainedSpellsBrief } from '../lib/containedSpellBrief'
import BagOfHoldingPanel from './BagOfHoldingPanel'
import {
  getNormalizedBagModules,
  createInitialBagModule,
  removeBagModuleAt,
  updateModuleBagCount,
  mergeWalletDelta,
} from '../lib/bagOfHoldingModules'
import { buildCurrencyRowsForInventory } from '../lib/currencyInventoryRows'
import {
  normalizeBackpackLayoutOrder,
  resolveInvIndexFromItemToken,
  reorderLayoutTokens,
} from '../lib/backpackLayoutOrder'

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
    if (e?.inBagOfHolding) return false
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
      if (e?.inBagOfHolding) return false
      const proto = e.itemId ? getItemById(e.itemId) : null
      const t = proto?.类型 ?? ''
      const sub = proto?.子类型 ?? ''
      if (t === '衣服') return true
      if (t === '盔甲' && sub !== '盾牌') return true
      return false
    })
  }
  return inv.filter((e) => !e?.inBagOfHolding)
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
  const bagModules = useMemo(
    () => getNormalizedBagModules(character),
    [character?.id, character?.bagOfHoldingModules, character?.bagOfHoldingSlots, character?.bagOfHoldingCount, character?.bagOfHoldingVisibility],
  )
  const modulesBagCountTotal = (mods) =>
    (mods || []).reduce((s, m) => s + (Math.max(0, Number(m.bagCount) || 0)), 0)
  const personRows = useMemo(
    () => inv.map((entry, i) => ({ entry, i })).filter(({ entry }) => !entry?.inBagOfHolding),
    [inv],
  )
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
  const [isStoreToVaulting, setIsStoreToVaulting] = useState(false)
  const [transferHint, setTransferHint] = useState('')

  useEffect(() => {
    if (character?.id) setWallet(getCharacterWallet(character.id))
  }, [character?.id, character?.wallet])

  const currencyRows = useMemo(() => buildCurrencyRowsForInventory(wallet), [wallet])

  const layoutOrder = useMemo(
    () => normalizeBackpackLayoutOrder(character?.backpackLayoutOrder, wallet, inv),
    [character?.backpackLayoutOrder, wallet, inv],
  )

  useEffect(() => {
    if (!canEdit) return
    if (!inv.some((e) => !e?.inBagOfHolding && !e?.id)) return
    onSave({
      inventory: inv.map((e) =>
        !e?.inBagOfHolding && !e?.id ? { ...e, id: `inv_${crypto.randomUUID()}` } : e,
      ),
    })
  }, [canEdit, inv, onSave])

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
  const isSameItemForMerge = (a, b) => {
    if (!a || !b) return false
    if (a.walletCurrencyId || b.walletCurrencyId) return false
    if (a.inBagOfHolding || b.inBagOfHolding) return false
    return getInvMergeKey(a) === getInvMergeKey(b)
  }

  const moveEntryToBag = (fromIndex, moduleId) => {
    const entry = inv[fromIndex]
    if (!entry || entry.inBagOfHolding) return
    if (entry.walletCurrencyId) return
    if (entry.itemId === 'bag_of_holding') return
    if (!moduleId || !bagModules.some((m) => m.id === moduleId)) return
    const entryId = entry.id
    let nextHeld = heldSlots
    let nextWorn = wornSlots
    let eqChanged = false
    if (entryId) {
      if (nextHeld.some((s) => s.inventoryId === entryId)) {
        nextHeld = nextHeld.map((s) => (s.inventoryId === entryId ? { ...s, inventoryId: null } : s))
        eqChanged = true
      }
      if (nextWorn.some((s) => s.inventoryId === entryId)) {
        nextWorn = nextWorn.map((s) => (s.inventoryId === entryId ? { ...s, inventoryId: null } : s))
        eqChanged = true
      }
    }
    const nextInv = inv.map((e, idx) =>
      idx === fromIndex ? { ...e, inBagOfHolding: true, bagModuleId: moduleId, bagSlotId: undefined } : e,
    )
    setEditingIndex(null)
    if (eqChanged) saveWithEquipment({ inventory: nextInv, equippedHeld: nextHeld, equippedWorn: nextWorn })
    else onSave({ inventory: nextInv })
  }

  const handleAddBagModule = () => {
    if (bagModules.length >= 1) return
    const m = createInitialBagModule()
    onSave({ bagOfHoldingModules: [m], bagOfHoldingCount: m.bagCount })
  }

  const handleRemoveBagModule = () => {
    const { modules, inventory: nextInv, walletDelta } = removeBagModuleAt(bagModules, 0, inv)
    saveWithEquipment({
      bagOfHoldingModules: modules,
      bagOfHoldingCount: modulesBagCountTotal(modules),
      inventory: nextInv,
      wallet: mergeWalletDelta(wallet, walletDelta),
      ...(modules.length === 0 ? { bagOfHoldingSlots: [] } : {}),
    })
  }

  const handleSetModuleBagCount = (moduleId, n) => {
    const idx = bagModules.findIndex((m) => m.id === moduleId)
    if (idx < 0) return
    const { modules, inventory: nextInv, walletDelta } = updateModuleBagCount(bagModules, idx, n, inv)
    saveWithEquipment({
      bagOfHoldingModules: modules,
      bagOfHoldingCount: modulesBagCountTotal(modules),
      inventory: nextInv,
      wallet: mergeWalletDelta(wallet, walletDelta),
    })
  }

  const moveWalletCurrencyToBag = (currencyId, moduleId) => {
    if (!currencyId || !moduleId || !bagModules.some((m) => m.id === moduleId)) return
    const amt = Number(wallet[currencyId]) || 0
    if (amt <= 0) return
    const isGem = currencyId === 'gem_lb'
    const take = isGem ? amt : Math.floor(amt)
    if (take <= 0) return
    setEditingIndex(null)
    const mergeIdx = inv.findIndex(
      (e) =>
        e?.inBagOfHolding &&
        e?.walletCurrencyId === currencyId &&
        (e.bagModuleId === moduleId || e.bagSlotId === moduleId),
    )
    const nextWallet = { ...wallet }
    nextWallet[currencyId] = isGem ? Math.max(0, amt - take) : Math.max(0, Math.floor(amt) - take)
    let nextInv
    if (mergeIdx >= 0) {
      const row = inv[mergeIdx]
      const q = Number(row.qty) || 0
      nextInv = inv.map((e, idx) => (idx === mergeIdx ? { ...row, qty: q + take } : e))
    } else {
      const cfg = getCurrencyById(currencyId)
      const name = getCurrencyDisplayName(cfg) || currencyId
      nextInv = [
        ...inv,
        {
          id: `inv_${crypto.randomUUID()}`,
          name,
          walletCurrencyId: currencyId,
          qty: take,
          inBagOfHolding: true,
          bagModuleId: moduleId,
          bagSlotId: undefined,
        },
      ]
    }
    saveWithEquipment({ inventory: nextInv, wallet: nextWallet })
  }

  const handleSetModuleVisibility = (moduleId, visibility) => {
    onSave({
      bagOfHoldingModules: bagModules.map((m) => (m.id === moduleId ? { ...m, visibility } : m)),
    })
  }

  const patchWalletCurrency = (currencyId, qty) => {
    const n =
      currencyId === 'gem_lb'
        ? Math.max(0, Number(qty) || 0)
        : Math.max(0, Math.floor(Number(qty) || 0))
    onSave({ wallet: { ...wallet, [currencyId]: n } })
  }

  const handleBackpackRowDragStart = (e, layoutIdx) => {
    const tok = layoutOrder[layoutIdx]
    if (tok?.startsWith('c:')) {
      const cid = tok.slice(2)
      e.dataTransfer.setData('text/dnd-wallet-currency', cid)
      e.dataTransfer.setData('text/plain', `wc:${cid}`)
    } else if (tok?.startsWith('i:')) {
      const invIdx = resolveInvIndexFromItemToken(tok, inv)
      if (invIdx >= 0) {
        e.dataTransfer.setData('text/dnd-character-inv', String(invIdx))
        e.dataTransfer.setData('text/plain', `inv:${invIdx}`)
      }
    }
    e.dataTransfer.setData('text/dnd-backpack-layout', String(layoutIdx))
    e.dataTransfer.effectAllowed = 'copyMove'
    e.currentTarget.classList.add('opacity-50')
  }
  const handleDragEnd = (e) => e.currentTarget.classList.remove('opacity-50')
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copyMove' }
  const handleBackpackRowDrop = (e, toLayoutIdx) => {
    e.preventDefault()
    const fromBag = e.dataTransfer.getData('text/dnd-from-bag') === '1'
    const invFromBag = parseInt(e.dataTransfer.getData('text/dnd-character-inv'), 10)
    if (fromBag && !Number.isNaN(invFromBag)) {
      const entry = inv[invFromBag]
      if (!entry || !entry.inBagOfHolding) return
      setEditingIndex(null)
      if (entry.walletCurrencyId) {
        const cid = entry.walletCurrencyId
        const add = Number(entry.qty) || 0
        const nextWallet = mergeWalletDelta(wallet, { [cid]: add })
        const nextInv = inv.filter((_, i) => i !== invFromBag)
        saveWithEquipment({ inventory: nextInv, wallet: nextWallet })
        return
      }
      saveWithEquipment({
        inventory: inv.map((row, idx) =>
          idx === invFromBag ? { ...row, inBagOfHolding: false, bagModuleId: undefined, bagSlotId: undefined } : row,
        ),
      })
      return
    }

    let fromL = parseInt(e.dataTransfer.getData('text/dnd-backpack-layout'), 10)
    if (Number.isNaN(fromL)) {
      const plain = e.dataTransfer.getData('text/plain')
      const m = /^bl:(\d+)$/.exec(plain)
      if (m) fromL = parseInt(m[1], 10)
    }
    if (Number.isNaN(fromL) || fromL === toLayoutIdx) return
    const order = [...layoutOrder]
    if (fromL < 0 || fromL >= order.length || toLayoutIdx < 0 || toLayoutIdx >= order.length) return
    const fromTok = order[fromL]
    const toTok = order[toLayoutIdx]

    if (fromTok.startsWith('i:') && toTok.startsWith('i:')) {
      const fromInv = resolveInvIndexFromItemToken(fromTok, inv)
      const toInv = resolveInvIndexFromItemToken(toTok, inv)
      if (fromInv < 0 || toInv < 0) return
      const source = inv[fromInv]
      const target = inv[toInv]
      if (!source || !target) return
      if (source.inBagOfHolding && !target.inBagOfHolding) {
        setEditingIndex(null)
        if (source.walletCurrencyId) {
          const cid = source.walletCurrencyId
          const add = Number(source.qty) || 0
          const nextWallet = mergeWalletDelta(wallet, { [cid]: add })
          const nextInv = inv.filter((_, i) => i !== fromInv)
          saveWithEquipment({ inventory: nextInv, wallet: nextWallet })
          return
        }
        saveWithEquipment({
          inventory: inv.map((e, idx) =>
            idx === fromInv ? { ...e, inBagOfHolding: false, bagModuleId: undefined, bagSlotId: undefined } : e,
          ),
        })
        return
      }
      if (source.inBagOfHolding || target.inBagOfHolding) return
      if (isSameItemForMerge(source, target)) {
        setEditingIndex(null)
        const qtyT = Math.max(1, Number(target?.qty) ?? 1)
        const qtyS = Math.max(1, Number(source?.qty) ?? 1)
        const chargeT = Number(target?.charge) || 0
        const chargeS = Number(source?.charge) || 0
        const merged = { ...target, qty: qtyT + qtyS, charge: chargeT + chargeS }
        const nextInv = inv.filter((_, i) => i !== fromInv)
        const newToIndex = fromInv < toInv ? toInv - 1 : toInv
        nextInv[newToIndex] = merged
        const nextLayout = order.filter((_, i) => i !== fromL)
        saveWithEquipment({ inventory: nextInv, backpackLayoutOrder: nextLayout })
        return
      }
      setEditingIndex(null)
      const nextInv = [...inv]
      const [item] = nextInv.splice(fromInv, 1)
      nextInv.splice(toInv, 0, item)
      const nextLayout = reorderLayoutTokens(order, fromL, toLayoutIdx)
      saveWithEquipment({ inventory: nextInv, backpackLayoutOrder: nextLayout })
      return
    }

    const nextLayout = reorderLayoutTokens(order, fromL, toLayoutIdx)
    onSave({ backpackLayoutOrder: nextLayout })
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

  /** 次元袋面板行内编辑（下标为背包 inventory 全局下标） */
  const patchBagItem = (globalIndex, patch) => {
    const e = inv[globalIndex]
    if (!e?.inBagOfHolding) return
    const next = { ...e }
    if ('qty' in patch) next.qty = Math.max(1, Math.floor(Number(patch.qty)) || 1)
    if ('charge' in patch) next.charge = Math.max(0, Number(patch.charge) || 0)
    const nextInv = inv.map((row, i) => (i === globalIndex ? next : row))
    onSave({ inventory: nextInv })
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
    if (storeToVaultIndex == null || isStoreToVaulting) return
    const e = inv[storeToVaultIndex]
    if (!e) { setStoreToVaultIndex(null); return }
    const q = Math.max(1, Number(e.qty) ?? 1)
    const toStore = Math.min(Math.max(1, storeToVaultQty), q)
    const moduleId = character?.moduleId ?? 'default'
    const addPromise = e.itemId
      ? Promise.resolve(addToWarehouse(moduleId, {
        ...e,
        qty: toStore,
      }))
      : Promise.resolve(addToWarehouse(moduleId, { name: e.name || '—', qty: toStore }))
    setIsStoreToVaulting(true)
    setTransferHint('物品存入中，请耐心等待；若长时间未完成请尝试刷新页面。')
    if (toStore >= q) {
      onSave({ inventory: inv.filter((_, i) => i !== storeToVaultIndex) })
    } else {
      const next = inv.map((entry, i) => (i === storeToVaultIndex ? { ...entry, qty: q - toStore } : entry))
      onSave({ inventory: next })
    }
    addPromise
      .catch((err) => {
        console.error('[EquipmentAndInventory] 存到团队仓库失败', err)
        alert('存入失败，请重试或刷新页面')
      })
      .finally(() => {
        setIsStoreToVaulting(false)
        setTransferHint('')
      })
    setStoreToVaultIndex(null)
    setStoreToVaultQty(1)
  }

  const handleTransferSuccess = () => {
    setWallet(getCharacterWallet(character.id))
    onWalletSuccess?.()
  }

  const invDisplayName = (entry) => {
    if (entry?.walletCurrencyId) {
      const cfg = getCurrencyById(entry.walletCurrencyId)
      return getCurrencyDisplayName(cfg) || entry?.name || '—'
    }
    if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      const customName = entry.name && entry.name.trim()
      if (customName) return customName
      return getItemDisplayName(item) || '—'
    }
    return entry?.name ?? '—'
  }
  const getEntryWeight = (entry) => {
    if (entry?.walletCurrencyId) {
      const q = Math.max(1, Number(entry.qty) || 1)
      const tw = getWalletCurrencyStackWeightLb(entry.walletCurrencyId, q)
      return q > 0 ? tw / q : 0
    }
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
    let out = ''
    if (parts.length) out = parts.join('；')
    else if (entry?.附注?.trim()) out = entry.附注.trim()
    else out = getItemById(entry?.itemId)?.详细介绍 ?? ''
    return appendContainedSpellsBrief(entry?.effects, out)
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
                            <span className="text-dnd-gold-light/90 text-xs font-mono shrink-0" title="盾牌增强加值">+{shieldMagicBonus}</span>
                          )}
                        </>
                      )}
                    </div>
                    {i === 1 && entry && isShield && (() => {
                      const parsed = parseArmorNote(entry.附注 ?? proto?.附注 ?? '')
                      const baseAC = parsed?.isShield ? (parsed.bonus || 2) : 2
                      return (
                        <p className="text-dnd-gold-light/90 text-[10px]">
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
                        <span className="text-dnd-gold-light/90 text-xs font-mono shrink-0" title="瓦石层">{stoneValue}层</span>
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
                              <span className="text-dnd-gold-light/90 text-xs font-mono shrink-0">+{magicBonus}</span>
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
                <button type="button" onClick={() => setAddFormOpen(true)} className="h-7 px-2 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white text-xs font-medium transition-colors">
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
                  {canEdit && <th className="py-0 px-4 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }} title="拖拽排序" />}
                  <th className="py-0 px-4 font-semibold min-w-0 align-middle text-left whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>名称</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>充能</th>
                  <th className="py-0 px-4 font-semibold min-w-0 border-l border-gray-600 align-middle text-left whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>简要介绍</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>数量</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>总重</th>
                  {canEdit && <th className="py-0 px-4 border-l border-gray-600 align-middle text-center whitespace-nowrap" style={{ height: 48, maxHeight: 48 }} />}
                </tr>
              </thead>
              <tbody>
                {layoutOrder.length === 0 ? (
                  <tr className="border-t border-gray-700/80">
                    <td
                      colSpan={canEdit ? 8 : 5}
                      className={`py-6 px-4 text-dnd-text-muted text-xs text-center align-middle ${canEdit ? 'border-2 border-dashed border-dnd-gold/25 rounded-md bg-[#151c28]/25' : ''}`}
                      style={{ minHeight: 120 }}
                      onDragOver={canEdit ? handleDragOver : undefined}
                      onDrop={canEdit ? (e) => handleBackpackRowDrop(e, 0) : undefined}
                    >
                      {personRows.length === 0 && inv.length > 0 ? (
                        <span>背包表仅显示身上物品。当前全部在次元袋内，可将袋内物品拖放到此处。</span>
                      ) : canEdit ? (
                        <span>背包暂无物品行。可从次元袋拖入此处，或使用「添加物品」。</span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                ) : (
                  layoutOrder.map((token, layoutIdx) => {
                  if (token.startsWith('c:')) {
                    const currencyId = token.slice(2)
                    const cr = currencyRows.find((r) => r.currencyId === currencyId)
                    if (!cr) return null
                    return (
                      <tr
                        key={token}
                        className={`border-t border-gray-700/80 bg-[#1e2a3d]/50 hover:bg-gray-800/30 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                        draggable={!!canEdit}
                        onDragStart={canEdit ? (e) => handleBackpackRowDragStart(e, layoutIdx) : undefined}
                        onDragEnd={canEdit ? handleDragEnd : undefined}
                        onDragOver={canEdit ? handleDragOver : undefined}
                        onDrop={canEdit ? (e) => handleBackpackRowDrop(e, layoutIdx) : undefined}
                      >
                        {canEdit && (
                          <td className="py-1 px-4 align-middle text-center overflow-hidden" title="拖拽调整顺序" style={{ height: 48, maxHeight: 48 }}>
                            <span className="inline-flex justify-center"><GripVertical className="w-3.5 h-3.5 text-dnd-text-muted" /></span>
                          </td>
                        )}
                        <td className="py-1 px-4 text-dnd-gold-light/95 font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          <span className="block text-[10px] text-dnd-text-muted font-normal leading-tight">钱币</span>
                          <span className="truncate block max-w-full">{cr.label}</span>
                        </td>
                        <td className="py-1 px-2 border-l border-gray-600 align-middle text-center text-dnd-text-muted text-xs" style={{ height: 48, maxHeight: 48 }}>
                          —
                        </td>
                        <td className="inventory-table-cell-brief py-1 px-4 text-dnd-text-muted text-xs border-l border-gray-600 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>
                          个人钱包；与下方「个人持有」同步；数量请在下方修改；可拖入次元袋。
                        </td>
                        <td className="py-1 px-2 border-l border-gray-600 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          <span className="tabular-nums text-dnd-text-body text-xs" title="在下方「个人持有」中修改数量">
                            {cr.qty}
                          </span>
                        </td>
                        <td className="py-1 px-2 border-l border-gray-600 align-middle text-center text-dnd-text-muted text-xs" style={{ height: 48, maxHeight: 48 }}>
                          —
                        </td>
                        {canEdit && (
                          <td className="py-1 px-1 border-l border-gray-600 align-middle text-center text-dnd-text-muted text-[10px]" style={{ height: 48, maxHeight: 48 }}>
                            —
                          </td>
                        )}
                      </tr>
                    )
                  }
                  const i = resolveInvIndexFromItemToken(token, inv)
                  if (i < 0) return null
                  const entry = inv[i]
                  if (entry?.inBagOfHolding) return null
                  const qty = Math.max(1, Number(entry?.qty) ?? 1)
                  const unitLb = getEntryWeight(entry)
                  const totalLb = Math.round(unitLb * qty * 100) / 100
                  return (
                    <Fragment key={entry.id ?? `inv-${i}`}>
                      <tr
                        className={`border-t border-gray-700/80 hover:bg-gray-800/40 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                        draggable={canEdit}
                        onDragStart={canEdit ? (e) => handleBackpackRowDragStart(e, layoutIdx) : undefined}
                        onDragEnd={canEdit ? handleDragEnd : undefined}
                        onDragOver={canEdit ? handleDragOver : undefined}
                        onDrop={canEdit ? (e) => handleBackpackRowDrop(e, layoutIdx) : undefined}
                      >
                        {canEdit && (
                          <td className="py-1 px-4 align-middle text-center overflow-hidden" title="拖拽调整顺序" style={{ height: 48, maxHeight: 48 }}>
                            <span className="inline-flex justify-center"><GripVertical className="w-3.5 h-3.5" /></span>
                          </td>
                        )}
                        <td className="py-1 px-4 text-white font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          <span className="inline-flex items-center gap-0.5 truncate max-w-full">
                            {invDisplayName(entry)}
                            {(() => {
                              const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                              const stoneVal = stoneEffect != null && stoneEffect.value != null ? Number(stoneEffect.value) : null
                              if (stoneVal != null && !Number.isNaN(stoneVal) && stoneVal > 0) {
                                return <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">{stoneVal}层</span>
                              }
                              return (Number(entry.magicBonus) || 0) > 0
                                ? <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                                : null
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
                              <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0">
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
                })
                )}
              </tbody>
            </table>
          </div>
          {inv.length === 0 && currencyRows.length === 0 && (
            <p className="text-gray-500 text-sm py-2 text-center">暂无物品</p>
          )}
        </div>

        {/* 次元袋（在背包与个人持有之间） */}
        <BagOfHoldingPanel
          bagModules={bagModules}
          onAddModule={handleAddBagModule}
          onRemoveModule={handleRemoveBagModule}
          onSetModuleBagCount={handleSetModuleBagCount}
          onSetModuleVisibility={handleSetModuleVisibility}
          inventory={inv}
          onMoveToBag={moveEntryToBag}
          onMoveCurrencyToBag={moveWalletCurrencyToBag}
          canEdit={canEdit}
          invDisplayName={invDisplayName}
          getEntryWeight={getEntryWeight}
          getEntryBriefFull={getEntryBriefFull}
          onPatchBagItem={patchBagItem}
          characterId={character?.id}
        />

        {/* 个人持有（紧凑：核心货币略大于零钱，整体省空间） */}
        <div className="rounded-xl border border-gray-600 bg-gray-800/30 overflow-hidden">
          <h3 className={subTitleClass + ' px-1.5 pt-0.5 pb-0.5 border-b border-gray-600/80'}>个人持有</h3>
          <div className="px-1 py-0.5 flex flex-wrap items-stretch gap-1 min-h-0">
            <div className="flex-1 min-w-[160px] min-h-0 flex flex-col">
              <CurrencyGrid
                balances={wallet}
                title={null}
                fillHeight
                extraClass="!border-0 !bg-transparent !rounded-none !shadow-none"
                editable={!!canEdit}
                onCurrencyChange={(currencyId, value) => patchWalletCurrency(currencyId, value)}
              />
            </div>
            {canEdit && (
              <div className="flex flex-col justify-center shrink-0 w-[7rem] gap-1">
                <button type="button" onClick={() => { setTransferDirection('toVault'); setTransferOpen(true); }} className="h-7 w-full inline-flex items-center justify-center gap-1 rounded-md bg-dnd-gold/80 hover:bg-dnd-gold text-white text-xs font-medium">
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
        <h3 className={subTitleClass + ' text-dnd-text-muted font-medium'}>负重（背包物品、货币、次元袋自重；袋内不计）</h3>
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
              <button type="button" onClick={confirmStoreToVault} disabled={isStoreToVaulting} className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">{isStoreToVaulting ? '存入中...' : '确认存入'}</button>
            </div>
          </div>
        </div>
      )}
      {transferHint && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="pointer-events-auto rounded-lg border border-dnd-gold/40 bg-gray-900/95 px-4 py-3 shadow-xl max-w-sm mx-4">
            <p className="text-dnd-gold-light text-sm font-medium">{transferHint}</p>
          </div>
        </div>
      )}
    </div>
  )
}
