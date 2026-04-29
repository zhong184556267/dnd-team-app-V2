import { normalizeBagOfHoldingVisibility } from './bagOfHoldingVisibility'
import { CURRENCY_CONFIG } from '../data/currencyConfig'

/** 袋内列表展示：钱币类置顶，并按货币配置顺序排列 */
const CURRENCY_DISPLAY_ORDER = Object.fromEntries(CURRENCY_CONFIG.map((c, i) => [c.id, i]))

export function compareBagInventoryDisplayOrder(entryA, idxA, entryB, idxB) {
  const wa = !!entryA?.walletCurrencyId
  const wb = !!entryB?.walletCurrencyId
  if (wa && !wb) return -1
  if (!wa && wb) return 1
  if (wa && wb) {
    const oa = CURRENCY_DISPLAY_ORDER[entryA.walletCurrencyId] ?? 999
    const ob = CURRENCY_DISPLAY_ORDER[entryB.walletCurrencyId] ?? 999
    if (oa !== ob) return oa - ob
  }
  return idxA - idxB
}

/**
 * 袋内行补丁：非钱币数量至少 1；钱币可为 0（由调用方决定是否移除条目）。充能仅作用于非钱币。
 */
export function applyBagItemPatch(entry, patch) {
  if (!entry) return entry
  const next = { ...entry }
  if ('charge' in patch && !entry.walletCurrencyId) {
    next.charge = Math.max(0, Number(patch.charge) || 0)
  }
  if ('qty' in patch) {
    if (entry.walletCurrencyId) {
      const cid = entry.walletCurrencyId
      if (cid === 'gem_lb') {
        next.qty = Math.max(0, Number(patch.qty) || 0)
      } else {
        next.qty = Math.max(0, Math.floor(Number(patch.qty)) || 0)
      }
    } else {
      next.qty = Math.max(1, Math.floor(Number(patch.qty)) || 1)
    }
  }
  return next
}

/** 在完整 inventory 上应用袋内补丁（下标为全局 inventory 下标）；钱币数量为 0 时移除该行 */
export function inventoryWithBagPatch(inventory, globalIndex, patch) {
  const inv = Array.isArray(inventory) ? inventory : []
  const entry = inv[globalIndex]
  if (!entry?.inBagOfHolding) return inv
  const next = applyBagItemPatch(entry, patch)
  if (next.walletCurrencyId && Number(next.qty) <= 0) {
    return inv.filter((_, i) => i !== globalIndex)
  }
  return inv.map((e, i) => (i === globalIndex ? next : e))
}

export const MAX_BAG_OF_HOLDING_TOTAL = 99
/** 同一角色可创建的次元袋模块数上限（用于区分公用袋 / 私人袋等） */
export const MAX_BAG_OF_HOLDING_MODULES = 12

/**
 * 背包表「次元袋实体行」与 bagOfHoldingModules 中某一模块绑定；自重由模块个数统一计入负重，此行在 getCarriedInventoryWeightLb 中排除，避免与 getBagOfHoldingSelfWeightLb 重复。
 */
export const BAG_MODULE_ANCHOR_ID = 'bagModuleAnchorId'

export function isBagModuleAnchorEntry(entry) {
  return !!entry?.[BAG_MODULE_ANCHOR_ID] && entry?.itemId === 'bag_of_holding' && !entry?.inBagOfHolding
}

/**
 * 保证每个 bagCount>0 的模块有一条锚点 inventory 行，且 qty 与 bagCount 同步；去除无效/重复锚点。
 * @returns {{ inventory: object[], changed: boolean }}
 */
export function reconcileBagModuleAnchors(character) {
  const rawInv = character?.inventory ?? []
  const modules = getNormalizedBagModules(character)
  const B = BAG_MODULE_ANCHOR_ID
  const modIdSet = new Set(modules.map((m) => m.id))

  const isAnchor = (e) => e?.itemId === 'bag_of_holding' && e?.[B] && !e?.inBagOfHolding

  const nextInv = []
  const seenAnchorMods = new Set()
  let changed = false

  for (const e of rawInv) {
    if (!isAnchor(e)) {
      nextInv.push(e)
      continue
    }
    const mid = e[B]
    if (!modIdSet.has(mid)) {
      changed = true
      continue
    }
    if (seenAnchorMods.has(mid)) {
      changed = true
      continue
    }
    seenAnchorMods.add(mid)
    const mod = modules.find((m) => m.id === mid)
    const bc = mod?.bagCount ?? 0
    if (bc <= 0) {
      changed = true
      continue
    }
    const q = Math.max(1, Math.floor(Number(e.qty) || 1))
    if (q !== bc) {
      nextInv.push({ ...e, qty: bc })
      changed = true
    } else {
      nextInv.push(e)
    }
  }

  for (const mod of modules) {
    if (mod.bagCount <= 0) continue
    if (seenAnchorMods.has(mod.id)) continue
    nextInv.push({
      id: `inv_${crypto.randomUUID()}`,
      itemId: 'bag_of_holding',
      qty: mod.bagCount,
      name: '',
      [B]: mod.id,
    })
    seenAnchorMods.add(mod.id)
    changed = true
  }

  if (!changed) {
    return { inventory: rawInv, changed: false }
  }
  return { inventory: nextInv, changed: true }
}

/**
 * 次元袋模块：一个模块内可包含多个次元袋（只计数量），一个拖放区、统一私人/公家。
 * @typedef {{ id: string, bagCount: number, visibility: 'private'|'public' }} BagOfHoldingModule
 */

/**
 * @param {object} character
 * @returns {BagOfHoldingModule[]}
 */
export function getNormalizedBagModules(character) {
  const raw = character?.bagOfHoldingModules
  if (Array.isArray(raw) && raw.length > 0) {
    const cid = character?.id || 'char'
    return raw.map((m, i) => ({
      id: typeof m?.id === 'string' && m.id ? m.id : `mod-${cid}-${i}`,
      bagCount: Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(m?.bagCount) || 0))),
      visibility: normalizeBagOfHoldingVisibility(m?.visibility),
    }))
  }

  // 从旧版「多栏」合并为单一模块
  const slots = character?.bagOfHoldingSlots
  if (Array.isArray(slots) && slots.length > 0) {
    const cid = character?.id || 'legacy'
    const firstId = typeof slots[0]?.id === 'string' && slots[0].id ? slots[0].id : `merged-${cid}`
    const vis = normalizeBagOfHoldingVisibility(slots[0]?.visibility)
    return [
      {
        id: firstId,
        bagCount: Math.min(MAX_BAG_OF_HOLDING_TOTAL, slots.length),
        visibility: vis,
      },
    ]
  }

  const n = Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(character?.bagOfHoldingCount) || 0)))
  if (n === 0) return []
  const vis = normalizeBagOfHoldingVisibility(character?.bagOfHoldingVisibility)
  const cid = character?.id || 'legacy'
  return [{ id: `migrated-${cid}`, bagCount: n, visibility: vis }]
}

/** 负重/上限：所有模块 bagCount 之和 */
export function getTotalBagCountForCharacter(character) {
  return Math.min(
    MAX_BAG_OF_HOLDING_TOTAL,
    getNormalizedBagModules(character).reduce((s, m) => s + (m.bagCount || 0), 0),
  )
}

/**
 * @param {object} entry
 * @param {BagOfHoldingModule} mod
 * @param {BagOfHoldingModule[]} allMods
 */
export function entryBelongsToBagModule(entry, mod, allMods) {
  if (!entry?.inBagOfHolding) return false
  if (entry.bagModuleId && entry.bagModuleId === mod.id) return true
  if (entry.bagSlotId && entry.bagSlotId === mod.id) return true
  if (allMods.length === 1 && !entry.bagModuleId && !entry.bagSlotId) return true
  // 旧多栏：任意 bagSlotId 且仅存一模块时归入该模块
  if (allMods.length === 1 && entry.bagSlotId) return true
  return false
}

/**
 * 将袋内「钱包货币」条目还原为钱包增量（与 mergeWalletDelta 配合）
 * @param {Record<string, number>} walletDelta
 */
export function mergeWalletDelta(wallet, walletDelta) {
  const w = { ...(wallet || {}) }
  for (const [cid, add] of Object.entries(walletDelta || {})) {
    const cur = Number(w[cid]) || 0
    const delta = Number(add) || 0
    w[cid] = cid === 'gem_lb' ? cur + delta : cur + Math.floor(delta)
  }
  return w
}

/**
 * 移除模块，袋内物品回背包；袋内「钱币堆」条目合并回 wallet
 */
export function removeBagModuleAt(modules, moduleIndex, inventory) {
  if (moduleIndex < 0 || moduleIndex >= modules.length) {
    return { modules, inventory, walletDelta: {} }
  }
  const removed = modules[moduleIndex]
  const nextMods = modules.filter((_, i) => i !== moduleIndex)
  const rid = removed.id
  const walletDelta = {}
  const nextInv = inventory.flatMap((e) => {
    if (isBagModuleAnchorEntry(e) && e[BAG_MODULE_ANCHOR_ID] === rid) return []
    if (!e?.inBagOfHolding) return [e]
    const belongs =
      e.bagModuleId === rid ||
      e.bagSlotId === rid ||
      (modules.length === 1 && !e.bagModuleId && !e.bagSlotId)
    if (!belongs) return [e]
    if (e.walletCurrencyId) {
      const cid = e.walletCurrencyId
      walletDelta[cid] = (walletDelta[cid] || 0) + (Number(e.qty) || 0)
      return []
    }
    return [{ ...e, inBagOfHolding: false, bagModuleId: undefined, bagSlotId: undefined }]
  })
  return { modules: nextMods, inventory: nextInv, walletDelta }
}

/**
 * 设置模块数量；bagCount 为 0 时移除该模块并清空其内物品
 */
export function updateModuleBagCount(modules, moduleIndex, bagCount, inventory) {
  const n = Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(bagCount) || 0)))
  const mod = modules[moduleIndex]
  if (!mod) return { modules, inventory, walletDelta: {} }
  if (n === 0) {
    const rid = mod.id
    const nextMods = modules.filter((_, i) => i !== moduleIndex)
    const walletDelta = {}
    const nextInv = inventory.flatMap((e) => {
      if (isBagModuleAnchorEntry(e) && e[BAG_MODULE_ANCHOR_ID] === rid) return []
      if (!e?.inBagOfHolding) return [e]
      if (e.bagModuleId === rid || e.bagSlotId === rid || (modules.length === 1 && !e.bagModuleId && !e.bagSlotId)) {
        if (e.walletCurrencyId) {
          const cid = e.walletCurrencyId
          walletDelta[cid] = (walletDelta[cid] || 0) + (Number(e.qty) || 0)
          return []
        }
        return [{ ...e, inBagOfHolding: false, bagModuleId: undefined, bagSlotId: undefined }]
      }
      return [e]
    })
    return { modules: nextMods, inventory: nextInv, walletDelta }
  }
  const nextMods = modules.map((m, i) => (i === moduleIndex ? { ...m, bagCount: n } : m))
  return { modules: nextMods, inventory, walletDelta: {} }
}

export function createInitialBagModule() {
  return {
    id: crypto.randomUUID(),
    bagCount: 1,
    /** 默认公家：团队仓库页对所有玩家列出袋内，便于队伍共享 */
    visibility: 'public',
  }
}
