import { normalizeBagOfHoldingVisibility } from './bagOfHoldingVisibility'

export const MAX_BAG_OF_HOLDING_TOTAL = 99

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
    visibility: 'private',
  }
}
