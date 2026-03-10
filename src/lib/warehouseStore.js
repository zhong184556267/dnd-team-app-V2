const WAREHOUSE_KEY_PREFIX = 'dnd_warehouse_'
const WAREHOUSE_KEY_LEGACY = 'dnd_warehouse'

function warehouseKey(moduleId) {
  return WAREHOUSE_KEY_PREFIX + (moduleId || 'default')
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
  try {
    localStorage.setItem(warehouseKey(moduleId), JSON.stringify(Array.isArray(list) ? list : []))
  } catch (_) {}
}

/** 往仓库添加：{ itemId, name?, 攻击?, 伤害?, 详细介绍?, 附注?, qty?, magicBonus?, charge? } 或 { name, qty }。带 攻击/伤害/详细介绍/附注 时视为不同实例不合并。 */
export function addToWarehouse(moduleId, entry) {
  const list = getWarehouse(moduleId)
  const { itemId, name, 攻击, 伤害, 攻击距离, 详细介绍, 附注, qty = 1, magicBonus, charge } = entry
  const nameTrim = name != null ? String(name).trim() : ''
  const hasOverrides = 攻击 != null || 伤害 != null || 攻击距离 != null || 详细介绍 != null || 附注 != null || magicBonus != null || charge != null
  if (itemId) {
    const existing = list.find((x) => x.itemId === itemId && (x.name || '').trim() === nameTrim)
    const existingHasOverrides = existing && (existing.攻击 != null || existing.伤害 != null || existing.攻击距离 != null || existing.详细介绍 != null || existing.附注 != null || existing.magicBonus != null || existing.charge != null)
    if (existing && !hasOverrides && !existingHasOverrides) {
      existing.qty = (existing.qty || 0) + (qty || 1)
    } else {
      const newEntry = { itemId, qty: qty || 1 }
      if (nameTrim) newEntry.name = nameTrim
      if (攻击 != null && String(攻击).trim() !== '') newEntry.攻击 = String(攻击).trim()
      if (伤害 != null && String(伤害).trim() !== '') newEntry.伤害 = String(伤害).trim()
      if (攻击距离 != null && String(攻击距离).trim() !== '') newEntry.攻击距离 = String(攻击距离).trim()
      if (详细介绍 != null && String(详细介绍).trim() !== '') newEntry.详细介绍 = String(详细介绍).trim()
      if (附注 != null && String(附注).trim() !== '') newEntry.附注 = String(附注).trim()
      if (magicBonus != null && Number(magicBonus) !== 0) newEntry.magicBonus = Number(magicBonus) || 0
      if (charge != null && Number(charge) !== 0) newEntry.charge = Number(charge) || 0
      list.push(newEntry)
    }
  } else if (nameTrim) {
    list.push({ name: nameTrim, qty: qty || 1 })
  } else return
  saveWarehouse(moduleId, list)
  return list
}

/** 更新仓库中某条物品 */
export function updateWarehouseItem(moduleId, index, updates) {
  const list = getWarehouse(moduleId)
  if (index < 0 || index >= list.length) return list
  const next = [...list]
  next[index] = { ...next[index], ...updates }
  saveWarehouse(moduleId, next)
  return next
}

/** 从仓库移除或减少数量 */
export function removeFromWarehouse(moduleId, index, amount = null) {
  const list = getWarehouse(moduleId)
  if (index < 0 || index >= list.length) return list
  const item = list[index]
  if (amount != null && item.qty > amount) {
    item.qty -= amount
    saveWarehouse(moduleId, list)
  } else {
    list.splice(index, 1)
    saveWarehouse(moduleId, list)
  }
  return list
}

export function setWarehouse(moduleId, list) {
  saveWarehouse(moduleId, Array.isArray(list) ? list : [])
}

/** 重排仓库物品顺序 */
export function reorderWarehouse(moduleId, fromIndex, toIndex) {
  const list = getWarehouse(moduleId)
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return list
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  saveWarehouse(moduleId, next)
  return next
}
