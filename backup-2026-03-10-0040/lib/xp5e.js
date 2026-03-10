/** 经验与等级：输入单次获得经验 → 累加总经验 → 本表换算当前等级（D&D 5e） */
const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]

export function levelFromXP(xp) {
  const n = Number(xp) || 0
  for (let level = XP_TABLE.length; level >= 1; level--) {
    if (n >= XP_TABLE[level - 1]) return level
  }
  return 1
}

export function xpForLevel(level) {
  const L = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)))
  return XP_TABLE[L - 1]
}
