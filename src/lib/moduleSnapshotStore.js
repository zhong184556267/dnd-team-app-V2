/**
 * 模组数据快照备份
 * - 手动备份：保留最新 30 条
 * - 自动备份（凌晨3点）：保留 30 天
 * - 存储于 IndexedDB，不显示在前端
 * - 恢复时由开发者工具/对话中调出选择
 */
import { getAllCharacters, updateCharacter, deleteCharacter } from './characterStore'
import { getTeamVault, setTeamVault, loadTeamVaultIntoCache } from './currencyStore'
import { getWarehouseSnapshot, setWarehouse, setArcaneChestCount, loadWarehouseIntoCache } from './warehouseStore'
import { isSupabaseEnabled } from './supabase'
import * as td from './teamDataSupabase'

const DB_NAME = 'dnd_module_snapshots'
const DB_VERSION = 1
const STORE_NAME = 'snapshots'

const MANUAL_MAX = 30
const AUTO_RETENTION_DAYS = 30

// ─── IndexedDB helpers ───

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('moduleId', 'moduleId', { unique: false })
        store.createIndex('moduleType', ['moduleId', 'type'], { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txGetAll(store) {
  return new Promise((resolve, reject) => {
    const r = store.getAll()
    r.onsuccess = () => resolve(r.result || [])
    r.onerror = () => reject(r.error)
  })
}

function txGet(store, id) {
  return new Promise((resolve, reject) => {
    const r = store.get(id)
    r.onsuccess = () => resolve(r.result || null)
    r.onerror = () => reject(r.error)
  })
}

function txPut(store, data) {
  return new Promise((resolve, reject) => {
    const r = store.put(data)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
}

function txDelete(store, id) {
  return new Promise((resolve, reject) => {
    const r = store.delete(id)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
}

// ─── Snapshot data collection ───

/**
 * 收集指定模组的当前完整数据快照
 */
async function collectModuleData(moduleId) {
  const characters = getAllCharacters(moduleId).map(c => JSON.parse(JSON.stringify(c)))
  const teamVault = { ...getTeamVault(moduleId) }
  const warehouse = getWarehouseSnapshot(moduleId)
  let craftingProjects = []
  if (isSupabaseEnabled()) {
    try {
      craftingProjects = await td.fetchCraftingRow(moduleId)
    } catch { /* ignore */ }
  }
  return { characters, teamVault, warehouse, craftingProjects }
}

// ─── Public API ───

/**
 * 保存手动快照
 * @param {string} moduleId
 * @param {string} [label] 可选标签
 * @returns {Promise<{id: string, timestamp: string}>}
 */
export async function saveManualSnapshot(moduleId, label) {
  const data = await collectModuleData(moduleId)
  const now = new Date()
  const snapshot = {
    id: `snap_manual_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    moduleId,
    type: 'manual',
    timestamp: now.toISOString(),
    label: label || `手动备份 ${now.toLocaleDateString('zh-CN')} ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
    data,
  }

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  await txPut(store, snapshot)

  // 清理：只保留最新 MANUAL_MAX 条手动快照
  const all = await txGetAll(store)
  const manualForModule = all
    .filter(s => s.moduleId === moduleId && s.type === 'manual')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  const toDelete = manualForModule.slice(MANUAL_MAX)
  for (const s of toDelete) {
    await txDelete(store, s.id)
  }

  db.close()
  return { id: snapshot.id, timestamp: snapshot.timestamp }
}

/**
 * 保存自动快照（凌晨3点调度用）
 * @param {string} moduleId
 * @returns {Promise<{id: string, timestamp: string} | null>}
 */
export async function saveAutoSnapshot(moduleId) {
  // 检查今天是否已经有自动快照
  const existing = await listSnapshots(moduleId, 'auto')
  const today = new Date().toLocaleDateString('zh-CN')
  const alreadyToday = existing.some(s => {
    const d = new Date(s.timestamp)
    return d.toLocaleDateString('zh-CN') === today
  })
  if (alreadyToday) return null

  const data = await collectModuleData(moduleId)
  const now = new Date()
  const snapshot = {
    id: `snap_auto_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    moduleId,
    type: 'auto',
    timestamp: now.toISOString(),
    label: `自动备份 ${now.toLocaleDateString('zh-CN')} ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
    data,
  }

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  await txPut(store, snapshot)

  // 清理：删除超过 AUTO_RETENTION_DAYS 天的自动快照
  const all = await txGetAll(store)
  const cutoff = new Date(now.getTime() - AUTO_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const toDelete = all.filter(s =>
    s.moduleId === moduleId &&
    s.type === 'auto' &&
    new Date(s.timestamp) < cutoff
  )
  for (const s of toDelete) {
    await txDelete(store, s.id)
  }

  db.close()
  return { id: snapshot.id, timestamp: snapshot.timestamp }
}

/**
 * 列出指定模组的快照
 * @param {string} moduleId
 * @param {'manual'|'auto'|'all'} [type='all']
 * @returns {Promise<Array<{id:string, moduleId:string, type:string, timestamp:string, label:string}>>}
 */
export async function listSnapshots(moduleId, type = 'all') {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const all = await txGetAll(store)
  db.close()

  return all
    .filter(s => s.moduleId === moduleId && (type === 'all' || s.type === type))
    .map(s => ({ id: s.id, moduleId: s.moduleId, type: s.type, timestamp: s.timestamp, label: s.label }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

/**
 * 获取快照详情（含完整数据）
 * @param {string} snapshotId
 * @returns {Promise<object|null>}
 */
export async function getSnapshot(snapshotId) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const result = await txGet(store, snapshotId)
  db.close()
  return result
}

/**
 * 删除单个快照
 * @param {string} snapshotId
 */
export async function deleteSnapshot(snapshotId) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  await txDelete(store, snapshotId)
  db.close()
}

/**
 * 从快照恢复数据到指定模组
 * 恢复前会先保存一个手动快照（"恢复前自动备份"）
 * @param {string} snapshotId
 * @returns {Promise<{success: boolean, preBackupId?: string, error?: string}>}
 */
export async function restoreFromSnapshot(snapshotId) {
  const snapshot = await getSnapshot(snapshotId)
  if (!snapshot || !snapshot.data) {
    return { success: false, error: '快照不存在或数据损坏' }
  }

  // 先保存恢复前的状态
  let preBackupId
  try {
    const pre = await saveManualSnapshot(snapshot.moduleId, '恢复前自动备份')
    preBackupId = pre.id
  } catch (e) {
    console.warn('恢复前自动备份失败，继续恢复', e)
  }

  const { characters, teamVault, warehouse, craftingProjects } = snapshot.data

  try {
    // 1. 恢复角色数据
    const currentChars = getAllCharacters(snapshot.moduleId)
    const snapshotCharIds = new Set(characters.map(c => c.id))

    // 删除当前存在但快照中不存在的角色
    for (const c of currentChars) {
      if (!snapshotCharIds.has(c.id)) {
        await Promise.resolve(deleteCharacter(c.id))
      }
    }

    // 更新或添加快照中的角色
    for (const charData of characters) {
      const existing = currentChars.find(c => c.id === charData.id)
      if (existing) {
        // 更新已有角色
        await Promise.resolve(updateCharacter(charData.id, charData))
      } else if (isSupabaseEnabled()) {
        // Supabase 模式：用 insertCharacter 插入（保留原始ID）
        try {
          const { insertCharacter } = await import('./characterStoreSupabase')
          const inserted = await insertCharacter(charData)
          if (inserted) {
            // 更新内存缓存
            const cs = await import('./characterStore')
            cs._pushToCache?.(inserted)
          }
        } catch (e) {
          console.warn('恢复角色失败:', charData?.name, e)
        }
      } else {
        // localStorage 模式：直接写入列表
        try {
          const raw = localStorage.getItem('starlight_characters')
          const list = raw ? JSON.parse(raw) : []
          list.push({ ...charData, updatedAt: new Date().toISOString() })
          localStorage.setItem('starlight_characters', JSON.stringify(list))
        } catch (e) {
          console.warn('localStorage 恢复角色失败:', e)
        }
      }
    }

    // 2. 恢复金库
    if (isSupabaseEnabled()) {
      await loadTeamVaultIntoCache(snapshot.moduleId)
    }
    await setTeamVault(snapshot.moduleId, teamVault)

    // 3. 恢复仓库
    if (isSupabaseEnabled()) {
      await loadWarehouseIntoCache(snapshot.moduleId)
    }
    const whItems = warehouse?.items || []
    const whChestCount = warehouse?.meta?.arcaneChestCount ?? 1
    await Promise.resolve(setWarehouse(snapshot.moduleId, whItems))
    setArcaneChestCount(snapshot.moduleId, whChestCount)

    // 4. 恢复制作项目
    if (isSupabaseEnabled() && Array.isArray(craftingProjects)) {
      try {
        await td.saveCraftingRow(snapshot.moduleId, craftingProjects)
      } catch (e) {
        console.warn('恢复制作项目失败', e)
      }
    }

    // 触发刷新事件
    window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
    window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
    window.dispatchEvent(new CustomEvent('dnd-realtime-warehouse'))

    return { success: true, preBackupId }
  } catch (e) {
    console.error('恢复快照失败', e)
    return { success: false, error: e?.message || String(e) }
  }
}

// ─── Auto-backup scheduler ───

let schedulerInterval = null
const LAST_AUTO_RUN_KEY = 'dnd_snapshot_last_auto_run'

/**
 * 计算距离下次凌晨3点的毫秒数
 */
function msUntilNext3AM() {
  const now = new Date()
  const target = new Date(now)
  target.setHours(3, 0, 0, 0)
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  return target.getTime() - now.getTime()
}

/**
 * 执行所有模组的自动备份
 */
async function runAutoBackupForAllModules() {
  // 防止同一天重复执行
  const today = new Date().toLocaleDateString('zh-CN')
  const lastRun = localStorage.getItem(LAST_AUTO_RUN_KEY)
  if (lastRun === today) return

  // 获取所有模组
  const { getModules } = await import('./moduleStore')
  const modules = getModules()

  for (const m of modules) {
    try {
      await saveAutoSnapshot(m.id)
    } catch (e) {
      console.warn(`自动备份模组 ${m.name || m.id} 失败:`, e)
    }
  }

  localStorage.setItem(LAST_AUTO_RUN_KEY, today)
}

/**
 * 启动自动备份调度器（应用加载时调用一次）
 */
export function startAutoBackupScheduler() {
  if (schedulerInterval) return

  // 启动时检查：如果今天还没执行过且已过3点，立即执行
  const now = new Date()
  const today = new Date().toLocaleDateString('zh-CN')
  const lastRun = localStorage.getItem(LAST_AUTO_RUN_KEY)
  if (lastRun !== today && now.getHours() >= 3) {
    runAutoBackupForAllModules()
  }

  // 每分钟检查一次是否到了凌晨3点
  schedulerInterval = setInterval(() => {
    const current = new Date()
    if (current.getHours() === 3 && current.getMinutes() === 0) {
      runAutoBackupForAllModules()
    }
  }, 60 * 1000)
}

/**
 * 停止自动备份调度器
 */
export function stopAutoBackupScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
}
