/**
 * D&D 3R 魔法物品制作公式
 * 参考：奥法工坊规则
 */

/** 从消耗金额字符串解析数字（如 "500 GP" -> 500） */
export function parseCostFromString(str) {
  if (!str || typeof str !== 'string') return 0
  const m = str.trim().match(/[\d.]+/)
  return m ? parseFloat(m[0]) || 0 : 0
}

/** 制作天数公式：成本费用 / 1000，向上取整 */
export function calcCraftingDays(costStr) {
  const cost = parseCostFromString(costStr)
  return cost <= 0 ? 0 : Math.max(1, Math.ceil(cost / 1000))
}

/** 施法者等级 = 能使用该环位法术的最低等级（1环=1级，2环=3级... 即 (环级-1)*2+1，0环取1） */
export function calcMinCasterLevel(法术环级) {
  const lv = Math.max(0, Math.min(9, Number(法术环级) || 0))
  return lv === 0 ? 1 : (lv - 1) * 2 + 1
}

/** 角色等级 → 最高可制作法术环位（3R 全施法者：1级=1环，3级=2环，5级=3环...） */
export function levelToMaxSpellLevel(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1))
  return Math.min(9, Math.floor((L + 1) / 2))
}

// --- 药水 (Potion) 限 4 环 ---
export function calcPotionMarketPrice(法术环级) {
  const sl = Math.max(0, Math.min(4, Number(法术环级) || 0))
  const cl = calcMinCasterLevel(sl)
  return sl * cl * 50
}
export function calcPotionCraftCost(marketPrice) {
  return Math.floor(marketPrice / 2)
}
export function calcPotionXpCost(marketPrice) {
  return Math.floor(marketPrice / 25)
}

// --- 卷轴 (Scroll) ---
export function calcScrollMarketPrice(法术环级, 数量 = 1) {
  const sl = Math.max(0, Number(法术环级) || 0)
  const cl = calcMinCasterLevel(sl)
  return 25 * sl * cl * Math.max(1, Number(数量) || 1)
}

// --- 魔杖 (Wand) 限 4 环，375 * sl * cl，充能折扣 ---
const WAND_CHARGE_MAP = { 50: 1, 40: 0.8, 30: 0.6, 20: 0.4, 10: 0.2 }
export function calcWandMarketPrice(法术环级, 单次材料费 = 0, 充能次数 = 50) {
  const sl = Math.max(0, Math.min(4, Number(法术环级) || 0))
  const cl = calcMinCasterLevel(sl)
  const chargeMult = WAND_CHARGE_MAP[充能次数] ?? 1
  const basePrice = 375 * sl * cl * chargeMult
  return basePrice + (Number(单次材料费) || 0) * (充能次数 || 50)
}

// --- 法杖 (Staff) ---
export function calcStaffMarketPrice(法术环级, 法术数量 = 1, 单次材料费 = 0, 充能次数 = 50) {
  const sl = Math.max(0, Number(法术环级) || 0)
  const cl = calcMinCasterLevel(sl)
  const spellMult = ((Math.max(1, Number(法术数量) || 1) - 1) * 0.125) + 1
  const chargeMult = WAND_CHARGE_MAP[充能次数] ?? 1
  const basePrice = 375 * sl * cl * spellMult * chargeMult
  return basePrice + (Number(单次材料费) || 0) * (充能次数 || 50)
}
