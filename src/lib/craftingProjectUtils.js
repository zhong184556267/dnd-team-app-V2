/**
 * 制作项目规范化与领取状态（魔法物品工厂）
 */

/** 规范化项目（兼容旧数据） */
export function normalizeProject(p) {
  const days = Math.max(0, Number(p.制作天数) || 0)
  let completed = Number(p.已制作天数) ?? 0
  if (completed === 0 && p.完成度 != null) {
    completed = Math.round((Number(p.完成度) / 100) * days)
  }
  const status = p.状态 ?? (completed >= days && days > 0 ? 'COMPLETED' : 'IN_PROGRESS')
  return { ...p, 制作天数: days, 已制作天数: Math.min(completed, days), 状态: status }
}

export function isCraftFeeClaimed(p) {
  if (p.已领取 === true || p.已领取 === 1 || p.已领取 === '1') return true
  // 旧版按日扣费：无「完成时间」的已完成项视为费用已结清
  if (p.状态 === 'COMPLETED' && !p.完成时间) return true
  return false
}

/** 拖拽 MIME：JSON { moduleId, projectId?, index? } */
export const DND_CRAFT_COMPLETED_MIME = 'text/dnd-craft-completed'

export function parseCraftCompletedDragPayload(raw) {
  if (raw == null || raw === '') return null
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o.moduleId !== 'string') return null
    return o
  } catch {
    return null
  }
}
