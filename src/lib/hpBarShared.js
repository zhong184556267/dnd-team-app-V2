/**
 * 顶栏与战斗状态「生命值」条共用：按 current/max 比例上色（不含临时生命）。
 * ≥80% 绿，≥50% 黄，>0 红，0 深红；max≤0 视为 0% → 深红。
 */
export function hpBarMainFillClassFromPct(pct) {
  const p = Number(pct) || 0
  if (p >= 80) return 'bg-green-600'
  if (p >= 50) return 'bg-yellow-600'
  if (p > 0) return 'bg-red-600'
  return 'bg-red-900'
}

export function hpBarMainFillClass(cur, max) {
  const m = Math.max(0, Number(max) || 0)
  const c = Math.max(0, Number(cur) || 0)
  if (m <= 0) return 'bg-red-900'
  return hpBarMainFillClassFromPct((c / m) * 100)
}

/** 有临时生命时战斗条整段、顶栏临时段共用 */
export const HP_BAR_TEMP_FILL_CLASS = 'bg-blue-600'
