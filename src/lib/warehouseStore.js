import { isSupabaseEnabled } from './supabase'
import * as whSupabase from './warehouseStoreSupabase'

const WAREHOUSE_KEY_PREFIX = 'dnd_warehouse_'
const WAREHOUSE_KEY_LEGACY = 'dnd_warehouse'

/** Supabase 启用时按模组缓存仓库列表 */
const warehouseCache = {}

function warehouseKey(moduleId) {
  return WAREHOUSE_KEY_PREFIX + (moduleId || 'default')
}

/** 从 Supabase 拉取仓库并写入缓存（启用 Supabase 时由仓库页在 useEffect 中调用） */
export async function loadWarehouseIntoCache(moduleId) {
  if (!isSupabaseEnabled()) return
  const list = await whSupabase.fetchWarehouse(moduleId)
  warehouseCache[moduleId ?? 'default'] = list
}

/** 迁移：默认模组首次读取时从旧 key 迁入 */
function migrateWarehouseIfNeeded(moduleId) {
  if (moduleId !== 'default') return
  try {
    const legacy = localStorage.getItem(WAREHOUSE_KEY_LEGACY)
    if (!legacy) return
    const list = JSON.parse(legacy)
    if (Array.isArray(list) && list.length > 0) {
      localStorage.setItem(warehouseKey('default'), JSON.stringify(list))
      localStorage.removeItem(WAREHOUSE_KEY_LEGACY)
    }
  } catch (_) {}
}

export function getWarehouse(moduleId) {
  if (isSupabaseEnabled()) {
    const mod = moduleId ?? 'default'
    return Array.isArray(warehouseCache[mod]) ? warehouseCache[mod] : []
  }
  migrateWarehouseIfNeeded(moduleId)
  try {
    const raw = localStorage.getItem(warehouseKey(moduleId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveWarehouse(moduleId, list) {
  if (isSupabaseEnabled()) {
    const mod = moduleId ?? 'default'
    warehouseCache[mod] = Array.isArray(list) ? list : []
    return whSupabase.saveWarehouseRow(moduleId, list)
  }
  try {
    localStorage.setItem(warehouseKey(moduleId), JSON.stringify(Array.isArray(list) ? list : []))
  } catch (_) {}
}

/** 往仓库添加：完整条目（含 详细介绍、附注、属性上限、效果等）或简写 { name, qty }。同质无自定义时合并数量。 */
export function addToWarehouse(moduleId, entry) {
  const list = getWarehouse(moduleId)
  const itemId = entry?.itemId
  const nameTrim = entry?.name != null ? String(entry.name).trim() : ''
  const qty = Math.max(1, Number(entry?.qty) ?? 1)
  const hasOverrides = entry && (
    (entry.攻击 != null && String(entry.攻击).trim() !== '') ||
    (entry.伤害 != null && String(entry.伤害).trim() !== '') ||
    (entry.攻击距离 != null && String(entry.攻击距离).trim() !== '') ||
    (entry.详细介绍 != null && String(entry.详细介绍).trim() !== '') ||
    (entry.附注 != null && String(entry.附注).trim() !== '') ||
    (entry.magicBonus != null && Number(entry.magicBonus) !== 0) ||
    (entry.charge != null && Number(entry.charge) !== 0) ||
    (Array.isArray(entry.effects) && entry.effects.length > 0)
  )
  if (itemId) {
    const existing = list.find((x) => x.itemId === itemId && (x.name || '').trim() === nameTrim)
    const existingHasOverrides = existing && (
      (existing.攻击 != null && String(existing.攻击).trim() !== '') ||
      (existing.伤害 != null && String(existing.伤害).trim() !== '') ||
      (existing.攻击距离 != null && String(existing.攻击距离).trim() !== '') ||
      (existing.详细介绍 != null && String(existing.详细介绍).trim() !== '') ||
      (existing.附注 != null && String(existing.附注).trim() !== '') ||
      (existing.magicBonus != null && Number(existing.magicBonus) !== 0) ||
      (existing.charge != null && Number(existing.charge) !== 0) ||
      (Array.isArray(existing.effects) && existing.effects.length > 0)
    )
    if (existing && !hasOverrides && !existingHasOverrides) {
      existing.qty = (existing.qty || 0) + qty
    } else {
      const newEntry = {
        id: entry.id ?? 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        itemId,
        name: nameTrim || (entry.name ?? ''),
        qty,
        详细介绍: entry.详细介绍 != null ? String(entry.详细介绍) : '',
        附注: entry.附注 != null ? String(entry.附注) : '',
        攻击: entry.攻击 ?? undefined,
        伤害: entry.伤害 ?? undefined,
        攻击距离: entry.攻击距离 ?? undefined,
        攻击范围: entry.攻击范围 ?? undefined,
        精通: entry.精通 ?? undefined,
        重量: entry.重量 ?? undefined,
        rarity: entry.rarity ?? undefined,
        magicBonus: entry.magicBonus != null ? Number(entry.magicBonus) : 0,
        charge: entry.charge != null ? Number(entry.charge) : 0,
        spellDC: entry.spellDC != null ? Number(entry.spellDC) : undefined,
        isAttuned: !!entry.isAttuned,
        effects: Array.isArray(entry.effects) ? entry.effects : undefined,
        爆炸半径: entry.爆炸半径 != null ? Number(entry.爆炸半径) : undefined,
      }
      list.push(newEntry)
    }
  } else if (nameTrim) {
    list.push({ name: nameTrim, qty })
  } else {
    return Promise.resolve(list)
  }
  const saved = saveWarehouse(moduleId, list)
  return saved && typeof saved.then === 'function' ? saved.then(() => list) : Promise.resolve(list)
}

/** 更新仓库中某条物品 */
export function updateWarehouseItem(moduleId, index, updates) {
  const list = getWarehouse(moduleId)
  if (index < 0 || index >= list.length) return Promise.resolve(list)
  const next = [...list]
  next[index] = { ...next[index], ...updates }
  const saved = saveWarehouse(moduleId, next)
  return saved && typeof saved.then === 'function' ? saved.then(() => next) : Promise.resolve(next)
}

/** 从仓库移除或减少数量 */
export function removeFromWarehouse(moduleId, index, amount = null) {
  const list = getWarehouse(moduleId)
  if (index < 0 || index >= list.length) return Promise.resolve(list)
  const item = list[index]
  if (amount != null && item.qty > amount) {
    item.qty -= amount
  } else {
    list.splice(index, 1)
  }
  const saved = saveWarehouse(moduleId, list)
  return saved && typeof saved.then === 'function' ? saved.then(() => list) : Promise.resolve(list)
}

export function setWarehouse(moduleId, list) {
  const next = Array.isArray(list) ? list : []
  const saved = saveWarehouse(moduleId, next)
  return saved && typeof saved.then === 'function' ? saved.then(() => next) : Promise.resolve(next)
}

/** 重排仓库物品顺序 */
export function reorderWarehouse(moduleId, fromIndex, toIndex) {
  const list = getWarehouse(moduleId)
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return Promise.resolve(list)
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  const saved = saveWarehouse(moduleId, next)
  return saved && typeof saved.then === 'function' ? saved.then(() => next) : Promise.resolve(next)
}
