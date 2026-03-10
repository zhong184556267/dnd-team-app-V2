/**
 * D&D 2024 负重规则：最大负重 = 力量 × 系数；物品重 + 货币重 = 当前总重
 * 50 枚硬币 = 1 磅；奥拉 50 = 1 磅；晶石(磅) 直接计入
 */

import { getItemById } from '../data/itemDatabase'

/** 负重系数：力量 × 此值 = 最大负重(磅)。强壮等特性可改为 30 */
export const ENCUMBRANCE_MULTIPLIER = 15

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

/** 背包物品总重(磅)：inventory = [{ itemId?, name?, qty }] */
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

/** 货币总重(磅)：50 枚标准硬币 = 1 磅；奥拉 50 = 1 磅；晶石(磅) 直接加 */
export function getCoinWeightLb(wallet) {
  if (!wallet || typeof wallet !== 'object') return 0
  const cp = Math.max(0, Number(wallet.cp) || 0)
  const sp = Math.max(0, Number(wallet.sp) || 0)
  const gp = Math.max(0, Number(wallet.gp) || 0)
  const pp = Math.max(0, Number(wallet.pp) || 0)
  const au = Math.max(0, Number(wallet.au) || 0)
  const gemLb = Math.max(0, Number(wallet.gem_lb) || 0)
  const standardCoins = cp + sp + gp + pp
  const standardLb = standardCoins / 50
  const aurumLb = au / 50
  return Math.round((standardLb + aurumLb + gemLb) * 100) / 100
}

/** 当前总重(磅) */
export function getTotalWeightLb(inventory, wallet) {
  return getInventoryWeightLb(inventory) + getCoinWeightLb(wallet)
}

/** 最大负重(磅)：力量 × 系数，可传入自定义系数 */
export function getMaxCapacityLb(strength, multiplier = ENCUMBRANCE_MULTIPLIER) {
  const str = Math.max(0, Number(strength) ?? 10)
  return str * multiplier
}

/**
 * 负重状态（D&D 规则）：
 * - 正常：≤ 5×力量
 * - 重载 encumbered：> 5×力量 且 ≤ 10×力量（速度-10尺）
 * - 超载 heavily encumbered：> 10×力量（速度-20尺，相关检定劣势）
 * @param {number} totalLb - 当前总重
 * @param {number} maxLb - 最大负重 = 力量×系数
 * @param {number} [multiplier=15] - 负重系数
 * @returns {{ status: string, label: string, color: string, percent: number }}
 */
export function getEncumbranceState(totalLb, maxLb, multiplier = ENCUMBRANCE_MULTIPLIER) {
  const max = Math.max(0.01, maxLb)
  const percent = Math.round((totalLb / max) * 100)
  const str = max / multiplier
  const encumberedThreshold = 5 * str
  const heavilyEncumberedThreshold = 10 * str
  if (totalLb > heavilyEncumberedThreshold) {
    return { status: 'heavily_encumbered', label: '超载', color: 'red', percent }
  }
  if (totalLb > encumberedThreshold) {
    return { status: 'encumbered', label: '重载', color: 'yellow', percent }
  }
  return { status: 'normal', label: '正常', color: 'green', percent }
}
