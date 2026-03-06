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

/** 往仓库添加：{ itemId, qty } 或 { name, qty } */
export function addToWarehouse(entry) {
  const list = getWarehouse()
  const { itemId, name, qty = 1 } = entry
  if (itemId) {
    const existing = list.find((x) => x.itemId === itemId && !x.name)
    if (existing) {
      existing.qty = (existing.qty || 0) + (qty || 1)
    } else {
      list.push({ itemId, qty: qty || 1 })
    }
  } else if (name && name.trim()) {
    list.push({ name: name.trim(), qty: qty || 1 })
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
