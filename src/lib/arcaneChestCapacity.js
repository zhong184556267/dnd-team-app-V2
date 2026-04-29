/**
 * 团队秘法箱：容积与重量换算（房规）
 * 单箱容积上限 12 立方尺；重量→容积采用与次元袋经典比值一致：500 磅 ≈ 64 立方尺。
 */

/** 单个秘法箱最大容积（立方尺） */
export const ARCANE_CHEST_VOLUME_CU_FT_PER_BOX = 12

/** 500 lb / 64 cu ft — 用于「仅有总重时」估算所占立方尺 */
export const ARCANE_CHEST_LB_PER_CU_FT_EQUIV = 500 / 64

export function normalizeArcaneChestCount(raw) {
  const n = Math.floor(Number(raw) || 1)
  return Math.max(1, Math.min(99, n))
}

/** 由总重（磅）估算占用立方尺 */
export function estimateArcaneChestVolumeCuFtFromWeightLb(lb) {
  const w = Number(lb)
  if (!Number.isFinite(w) || w <= 0) return 0
  return Math.round((w / ARCANE_CHEST_LB_PER_CU_FT_EQUIV) * 100) / 100
}

/** 由立方尺换算等效重量（磅），与上式互逆 */
export function estimateArcaneChestWeightLbFromVolumeCuFt(cuFt) {
  const v = Number(cuFt)
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.round(v * ARCANE_CHEST_LB_PER_CU_FT_EQUIV * 10) / 10
}

/** N 个秘法箱总容积上限（立方尺） */
export function getArcaneChestTotalCapacityCuFt(chestCount) {
  return normalizeArcaneChestCount(chestCount) * ARCANE_CHEST_VOLUME_CU_FT_PER_BOX
}
