const WAREHOUSE_KEY = 'dnd_warehouse'

export function getWarehouse() {
  try {
    const raw = localStorage.getItem(WAREHOUSE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveWarehouse(list) {
  try {
    localStorage.setItem(WAREHOUSE_KEY, JSON.stringify(list))
  } catch (_) {}
}

/** 往仓库添加：{ itemId, name?, 攻击?, 伤害?, 详细介绍?, 附注?, qty } 或 { name, qty }。带 攻击/伤害/详细介绍/附注 时视为不同实例不合并。 */
export function addToWarehouse(entry) {
  const list = getWarehouse()
  const { itemId, name, 攻击, 伤害, 详细介绍, 附注, qty = 1 } = entry
  const nameTrim = name != null ? String(name).trim() : ''
  const hasOverrides = 攻击 != null || 伤害 != null || 详细介绍 != null || 附注 != null
  if (itemId) {
    const existing = list.find((x) => x.itemId === itemId && (x.name || '').trim() === nameTrim)
    const existingHasOverrides = existing && (existing.攻击 != null || existing.伤害 != null || existing.详细介绍 != null || existing.附注 != null)
    if (existing && !hasOverrides && !existingHasOverrides) {
      existing.qty = (existing.qty || 0) + (qty || 1)
    } else {
      const newEntry = { itemId, qty: qty || 1 }
      if (nameTrim) newEntry.name = nameTrim
      if (攻击 != null && String(攻击).trim() !== '') newEntry.攻击 = String(攻击).trim()
      if (伤害 != null && String(伤害).trim() !== '') newEntry.伤害 = String(伤害).trim()
      if (详细介绍 != null && String(详细介绍).trim() !== '') newEntry.详细介绍 = String(详细介绍).trim()
      if (附注 != null && String(附注).trim() !== '') newEntry.附注 = String(附注).trim()
      list.push(newEntry)
    }
  } else if (nameTrim) {
    list.push({ name: nameTrim, qty: qty || 1 })
  } else return
  saveWarehouse(list)
  return list
}

/** 从仓库移除或减少数量 */
export function removeFromWarehouse(index, amount = null) {
  const list = getWarehouse()
  if (index < 0 || index >= list.length) return list
  const item = list[index]
  if (amount != null && item.qty > amount) {
    item.qty -= amount
    saveWarehouse(list)
  } else {
    list.splice(index, 1)
    saveWarehouse(list)
  }
  return list
}

export function setWarehouse(list) {
  saveWarehouse(Array.isArray(list) ? list : [])
}
