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

/** DataTransfer MIME：已领取、待入库的「已完成」制作行拖入仓库页「公家次元袋」 */
export const DND_CRAFT_COMPLETED_MIME = 'application/x-dnd-craft-completed+json'

/** @param {{ moduleId: string, projectId?: string, index?: number }} payload */
export function stringifyCraftCompletedDragPayload(payload) {
  try {
    const o = { moduleId: String(payload?.moduleId ?? '') }
    if (payload?.projectId != null && String(payload.projectId).trim()) o.projectId = String(payload.projectId).trim()
    if (typeof payload?.index === 'number' && Number.isFinite(payload.index)) o.index = Math.max(0, Math.floor(payload.index))
    return JSON.stringify(o)
  } catch {
    return ''
  }
}

/**
 * @param {string} raw dataTransfer.getData 结果
 * @returns {{ moduleId: string, projectId?: string, index?: number } | null}
 */
export function parseCraftCompletedDragPayload(raw) {
  if (raw == null || typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  try {
    const o = JSON.parse(s)
    if (!o || typeof o !== 'object') return null
    const moduleId = o.moduleId != null ? String(o.moduleId).trim() : ''
    if (!moduleId) return null
    const out = { moduleId }
    if (o.projectId != null && String(o.projectId).trim()) out.projectId = String(o.projectId).trim()
    if (typeof o.index === 'number' && Number.isFinite(o.index)) out.index = Math.max(0, Math.floor(o.index))
    return out
  } catch {
    return null
  }
}
