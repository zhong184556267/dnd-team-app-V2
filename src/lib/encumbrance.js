/**
 * D&D 2024 负重规则：最大负重 = 力量 × 系数；物品重 + 货币重 = 当前总重
 * 50 枚硬币 = 1 磅；奥拉 50 = 1 磅；晶石(磅) 直接计入
 */

import { getItemById } from '../data/itemDatabase'

/** 负重系数：力量 × 此值 = 最大负重(磅)。强壮等特性可改为 30 */
export const ENCUMBRANCE_MULTIPLIER = 15

/**
 * 力量等业务数值：空串、非法字符串、NaN 时回落为 fallback（避免 max/percent 变成 NaN 导致负重条不显示）
 */
export function normalizeStrength(value, fallback = 10) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(99, n))
}

function normalizePositiveNumber(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

/** 解析物品重量字符串为磅数，如 "2磅" -> 2, "1/4磅" -> 0.25, "半磅" -> 0.5, "—" -> 0 */
export function parseWeightString(str) {
  if (str == null || String(str).trim() === '' || String(str).trim() === '—') return 0
  const raw = String(str).trim()
  if (raw === '半磅' || raw.endsWith('半磅')) return 0.5
  const s = raw.replace(/磅/g, '').trim()
  if (!s) return 0
  if (s === '半') return 0.5
  if (s.includes('/')) {
    const [a, b] = s.split('/').map((n) => parseFloat(n.trim()))
    if (Number.isNaN(a) || Number.isNaN(b) || b === 0) return 0
    return a / b
  }
  const n = parseFloat(s)
  return Number.isNaN(n) ? 0 : Math.max(0, n)
}

/** 单件物品重量(磅)：从 item 对象取 重量 字段 */
export function getItemWeightLb(item) {
  if (!item) return 0
  const w = item.重量 ?? item.weight ?? ''
  return parseWeightString(w)
}

/** 背包物品总重(磅)：inventory = [{ itemId?, name?, qty }]（含袋内物品） */
export function getInventoryWeightLb(inventory) {
  if (!Array.isArray(inventory)) return 0
  let total = 0
  for (const entry of inventory) {
    const qty = Math.max(0, Number(entry?.qty) ?? 1)
    if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      total += getItemWeightLb(item) * qty
    } else {
      total += 0
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * 身上背负的物品重量（不含已置入次元袋的条目；袋内物品由 extradimensional 承载）
 */
export function getCarriedInventoryWeightLb(inventory) {
  if (!Array.isArray(inventory)) return 0
  let total = 0
  for (const entry of inventory) {
    if (entry?.inBagOfHolding) continue
    const qty = Math.max(0, Number(entry?.qty) ?? 1)
    if (entry?.walletCurrencyId) {
      total += getWalletCurrencyStackWeightLb(entry.walletCurrencyId, qty)
    } else if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      total += getItemWeightLb(item) * qty
    }
  }
  return Math.round(total * 100) / 100
}

/** 所持次元袋的自重总和（按「持有数量」× 数据库次元袋单件重量） */
export function getBagOfHoldingSelfWeightLb(bagOfHoldingCount) {
  const n = Math.max(0, Math.min(99, Math.floor(Number(bagOfHoldingCount) || 0)))
  if (n <= 0) return 0
  const proto = getItemById('bag_of_holding')
  const unit = getItemWeightLb(proto)
  return Math.round(n * unit * 100) / 100
}

/** 货币总重(磅)：50 枚标准硬币 = 1 磅；奥拉 50 = 1 磅；晶石(磅) 直接加 */
export function getCoinWeightLb(wallet) {
  if (!wallet || typeof wallet !== 'object') return 0
  const cp = Math.max(0, Number(wallet.cp) || 0)
  const sp = Math.max(0, Number(wallet.sp) || 0)
  const gp = Math.max(0, Number(wallet.gp) || 0)
  const pp = Math.max(0, Number(wallet.pp) || 0)
  const kr = Math.max(0, Number(wallet.kr) || 0)
  const au = Math.max(0, Number(wallet.au) || 0)
  const gemLb = Math.max(0, Number(wallet.gem_lb) || 0)
  const standardCoins = cp + sp + gp + pp + kr
  const standardLb = standardCoins / 50
  const aurumLb = au / 50
  return Math.round((standardLb + aurumLb + gemLb) * 100) / 100
}

/**
 * 单一货币堆叠在袋内/展示用：50 枚 = 1 磅（晶石按磅计）
 * @param {string} currencyId
 * @param {number} qty
 */
export function getWalletCurrencyStackWeightLb(currencyId, qty) {
  const n = Math.max(0, Number(qty) || 0)
  if (n <= 0) return 0
  if (currencyId === 'gem_lb') return Math.round(n * 100) / 100
  if (['cp', 'sp', 'gp', 'pp', 'au', 'kr'].includes(currencyId)) {
    return Math.round((n / 50) * 100) / 100
  }
  return 0
}

/**
 * 当前背负总重(磅)：背包内物品（不含袋内）+ 货币 + 次元袋自重（模块「次元袋个数」× 数据库次元袋单重）
 */
export function getTotalWeightLb(inventory, wallet, bagOfHoldingCount = 0) {
  const hasCurrencyStacks = Array.isArray(inventory)
    ? inventory.some((e) => e?.walletCurrencyId && !e?.inBagOfHolding)
    : false
  return (
    getCarriedInventoryWeightLb(inventory) +
    (hasCurrencyStacks ? 0 : getCoinWeightLb(wallet)) +
    getBagOfHoldingSelfWeightLb(bagOfHoldingCount)
  )
}

/** 最大负重(磅)：仅 力量 × 系数；次元袋不提高上限，只计袋子自重（见 getTotalWeightLb） */
export function getMaxCapacityLb(strength, multiplier = ENCUMBRANCE_MULTIPLIER) {
  const str = normalizeStrength(strength, 10)
  const mult = normalizePositiveNumber(multiplier, ENCUMBRANCE_MULTIPLIER)
  return Math.round(str * mult * 100) / 100
}

/**
 * 负重状态（D&D 规则）：
 * - 正常：≤ 5×力量
 * - 重载 encumbered：> 5×力量 且 ≤ 10×力量（速度-10尺）
 * - 超载 heavily encumbered：> 10×力量（速度-20尺，相关检定劣势）
 * @param {number} totalLb - 当前总重
 * @param {number} maxLb - 最大负重（力量 × 系数）
 * @param {number} [multiplier=15] - 负重系数
 * @param {number} [strength=10] - 力量值（用于重载/超载阈值，与负重条「最大」同为力量×系数体系）
 * @returns {{ status: string, label: string, color: string, percent: number }}
 */
export function getEncumbranceState(totalLb, maxLb, multiplier = ENCUMBRANCE_MULTIPLIER, strength = 10) {
  const str = normalizeStrength(strength, 10)
  const mult = normalizePositiveNumber(multiplier, ENCUMBRANCE_MULTIPLIER)
  const capRaw = Number(maxLb)
  const max =
    Number.isFinite(capRaw) && capRaw > 0
      ? capRaw
      : Math.max(0.01, str * mult)
  const total = Number.isFinite(Number(totalLb)) ? Number(totalLb) : 0
  const percent = max > 0 ? Math.round((total / max) * 100) : 0
  const encumberedThreshold = 5 * str
  const heavilyEncumberedThreshold = 10 * str
  if (total > heavilyEncumberedThreshold) {
    return { status: 'heavily_encumbered', label: '超载', color: 'red', percent }
  }
  if (total > encumberedThreshold) {
    return { status: 'encumbered', label: '重载', color: 'yellow', percent }
  }
  return { status: 'normal', label: '正常', color: 'green', percent }
}
