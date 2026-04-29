/**
 * 团队仓库 / 金库 / 角色背包与次元袋相关数据的一次性备份（迁移前调用）。
 * 写入 localStorage，并可下载 JSON 文件便于离线保存。
 */
import { getWarehouseSnapshot } from './warehouseStore'
import { getTeamVault } from './currencyStore'
import { getAllCharacters } from './characterStore'

const BACKUP_KEY_PREFIX = 'dnd_team_storage_backup_'
const SCHEMA_VERSION = 2

function backupStorageKey(moduleId, isoTs) {
  const mod = (moduleId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${BACKUP_KEY_PREFIX}${mod}_${isoTs}`
}

/**
 * @param {string} [moduleId]
 * @returns {{ schemaVersion: number, moduleId: string, exportedAt: string, warehouse: { items: unknown[], meta: object }, teamVault: Record<string, number>, characters: object[] }}
 */
export function buildTeamStorageBackupSnapshot(moduleId) {
  const mod = moduleId ?? 'default'
  const chars = getAllCharacters(mod)
  const wh = getWarehouseSnapshot(mod)
  return {
    schemaVersion: SCHEMA_VERSION,
    moduleId: mod,
    exportedAt: new Date().toISOString(),
    warehouse: { items: wh.items, meta: wh.meta },
    teamVault: getTeamVault(mod),
    characters: chars.map((c) => ({
      id: c.id,
      name: c.name,
      moduleId: c.moduleId,
      wallet: c.wallet ?? {},
      inventory: Array.isArray(c.inventory) ? c.inventory : [],
      bagOfHoldingModules: c.bagOfHoldingModules,
      bagOfHoldingSlots: c.bagOfHoldingSlots,
      bagOfHoldingCount: c.bagOfHoldingCount,
      bagOfHoldingVisibility: c.bagOfHoldingVisibility,
    })),
  }
}

/**
 * 将快照写入 localStorage（键名含时间戳）；返回写入用的 key。
 * @param {string} [moduleId]
 * @returns {string}
 */
export function saveTeamStorageBackupToLocalStorage(moduleId) {
  const iso = new Date().toISOString().replace(/[:.]/g, '-')
  const key = backupStorageKey(moduleId, iso)
  const snapshot = buildTeamStorageBackupSnapshot(moduleId)
  try {
    localStorage.setItem(key, JSON.stringify(snapshot))
  } catch (e) {
    console.error('[teamStorageBackup] localStorage 写入失败', e)
    throw e
  }
  return key
}

/**
 * 触发浏览器下载 JSON 备份文件。
 * @param {string} [moduleId]
 */
export function downloadTeamStorageBackupJson(moduleId) {
  const snapshot = buildTeamStorageBackupSnapshot(moduleId)
  const mod = snapshot.moduleId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeTs = snapshot.exportedAt.replace(/[:.]/g, '-')
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `dnd-team-storage-backup_${mod}_${safeTs}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** 列出本机 localStorage 中所有团队存储备份键（新到旧大致按字符串排序） */
export function listTeamStorageBackupKeys() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(BACKUP_KEY_PREFIX)) keys.push(k)
    }
    return keys.sort().reverse()
  } catch {
    return []
  }
}
