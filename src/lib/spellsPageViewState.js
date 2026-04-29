/** 法术大全页：折叠与滚动位置（localStorage）。登录/登出时由 AuthContext 清除。 */

const STORAGE_KEY = 'dnd_spells_page_view_v1'

/**
 * @returns {{ expandedLevels: number[], expandedSpellIds: string[], scrollY: number } | null}
 */
export function readSpellsPageViewState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    const expandedLevels = Array.isArray(o.expandedLevels)
      ? o.expandedLevels.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 9)
      : []
    const expandedSpellIds = Array.isArray(o.expandedSpellIds)
      ? o.expandedSpellIds.filter((id) => typeof id === 'string' && id.length > 0)
      : []
    const scrollY = typeof o.scrollY === 'number' && Number.isFinite(o.scrollY) ? Math.max(0, o.scrollY) : 0
    return { expandedLevels, expandedSpellIds, scrollY }
  } catch {
    return null
  }
}

/**
 * @param {{ expandedLevels: Iterable<number>, expandedSpellIds?: Iterable<string>, scrollY: number }} payload
 * expandedSpellIds 保留字段以兼容旧存档，新 UI 不再使用单条展开状态。
 */
export function writeSpellsPageViewState(payload) {
  try {
    const spellIds = payload.expandedSpellIds != null ? [...payload.expandedSpellIds] : []
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        expandedLevels: [...payload.expandedLevels],
        expandedSpellIds: spellIds,
        scrollY: payload.scrollY,
      })
    )
  } catch {
    /* ignore quota */
  }
}

export function clearSpellsPageViewState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
