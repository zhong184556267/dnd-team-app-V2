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
 * 背包表格行顺序：仅 i: 身上物品（钱币只在次元袋与个人持有中展示，不占背包行）
 * @param {string[]|undefined} saved
 * @param {object} _wallet 保留参数以兼容旧调用，已忽略
 * @param {object[]} inv
 */
export function normalizeBackpackLayoutOrder(saved, _wallet, inv) {
  const itemTokens = []
  inv.forEach((e, idx) => {
    if (!e?.inBagOfHolding) itemTokens.push(itemTokenForEntry(e, idx))
  })
  const defaultOrder = [...itemTokens]
  if (!Array.isArray(saved) || saved.length === 0) return defaultOrder

  const validSet = new Set(defaultOrder)
  const seen = new Set()
  const out = []
  for (const t of saved) {
    if (!t || typeof t !== 'string' || t.startsWith('c:')) continue
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
