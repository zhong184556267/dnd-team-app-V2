/**
 * 制作项目规范化与领取状态（魔法物品工厂）
 */

/** 规范化项目（兼容旧数据） */
export function normalizeProject(p) {
  const days = Math.max(0, Number(p.制作天数) || 0)
  let completed = p.已制作天数
  completed = Number(completed)
  if (!Number.isFinite(completed)) completed = 0
  completed = Math.max(0, completed)
  if (completed === 0 && p.完成度 != null) {
    completed = Math.round((Number(p.完成度) / 100) * days)
  }
  const capped = days > 0 ? Math.min(completed, days) : completed
  const status = p.状态 ?? (completed >= days && days > 0 ? 'COMPLETED' : 'IN_PROGRESS')
  return { ...p, 制作天数: days, 已制作天数: capped, 状态: status }
}

export function isCraftFeeClaimed(p) {
  if (p.已领取 === true || p.已领取 === 1 || p.已领取 === '1') return true
  // 旧版按日扣费：无「完成时间」的已完成项视为费用已结清
  if (p.状态 === 'COMPLETED' && !p.完成时间) return true
  return false
}

/** 已领取结算且物品已写入仓库/角色背包/公家次元袋（列表保留为灰色记录） */
export function isCraftDeposited(p) {
  if (p.已入库 === true || p.已入库 === 1 || p.已入库 === '1') return true
  return false
}

const DEPOSIT_DEST_LABEL = {
  warehouse: '团队仓库',
  character: '角色背包',
  public_bag: '公家次元袋',
}

export function getCraftDepositDestLabel(p) {
  const k = p.入库去向
  if (k && DEPOSIT_DEST_LABEL[k]) return DEPOSIT_DEST_LABEL[k]
  return '已入库'
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
