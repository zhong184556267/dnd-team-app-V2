import { buildCurrencyRowsForInventory } from './currencyInventoryRows'

/** @param {object} entry @param {number} invIndex */
export function itemTokenForEntry(entry, invIndex) {
  if (entry?.id) return `i:${entry.id}`
  return `i:_idx_${invIndex}`
}

/** @param {string} token @param {object[]} inv */
export function resolveInvIndexFromItemToken(token, inv) {
  if (!token || !token.startsWith('i:')) return -1
  const rest = token.slice(2)
  const byId = inv.findIndex((e) => e?.id === rest)
  if (byId >= 0) return byId
  const m = /^_idx_(\d+)$/.exec(rest)
  if (m) {
    const idx = parseInt(m[1], 10)
    if (idx >= 0 && idx < inv.length && !inv[idx]?.inBagOfHolding) return idx
  }
  return -1
}

/**
 * 背包表格行顺序：c:货币id、i:物品条目标识（优先 entry.id，否则 _idx_inv脚标）
 * @param {string[]|undefined} saved
 * @param {object} wallet
 * @param {object[]} inv
 */
export function normalizeBackpackLayoutOrder(saved, wallet, inv) {
  const currencyIds = buildCurrencyRowsForInventory(wallet).map((r) => r.currencyId)
  const curTokens = currencyIds.map((id) => `c:${id}`)
  const itemTokens = []
  inv.forEach((e, idx) => {
    if (!e?.inBagOfHolding) itemTokens.push(itemTokenForEntry(e, idx))
  })
  const defaultOrder = [...curTokens, ...itemTokens]
  if (!Array.isArray(saved) || saved.length === 0) return defaultOrder

  const validSet = new Set(defaultOrder)
  const seen = new Set()
  const out = []
  for (const t of saved) {
    if (validSet.has(t) && !seen.has(t)) {
      out.push(t)
      seen.add(t)
    }
  }
  for (const t of defaultOrder) {
    if (!seen.has(t)) out.push(t)
  }
  return out
}

export function reorderLayoutTokens(order, fromIdx, toIdx) {
  if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= order.length || toIdx >= order.length) {
    return order
  }
  const next = [...order]
  const [t] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, t)
  return next
}
