/**
 * Supabase 持久化层：团队仓库表 warehouse (module_id pk, data jsonb)
 * data 可为旧版「纯数组」或 { items, arcaneChestCount }（秘法箱数量与物品列表）
 */
import { supabase } from './supabase'
import { normalizeArcaneChestCount } from './arcaneChestCapacity'

const TABLE = 'warehouse'

export function normalizeWarehouseRowData(raw) {
  if (Array.isArray(raw)) {
    return { items: raw, arcaneChestCount: 1 }
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
    return {
      items: raw.items,
      arcaneChestCount: normalizeArcaneChestCount(raw.arcaneChestCount),
    }
  }
  return { items: [], arcaneChestCount: 1 }
}

function normalizeWarehouseRowDataForSave(payload) {
  if (Array.isArray(payload)) {
    return { items: payload, arcaneChestCount: 1 }
  }
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    arcaneChestCount: normalizeArcaneChestCount(payload?.arcaneChestCount),
  }
}

export async function fetchWarehouse(moduleId) {
  const mod = moduleId ?? 'default'
  const { data: row, error } = await supabase.from(TABLE).select('*').eq('module_id', mod).maybeSingle()
  if (error) throw error
  if (!row) return { items: [], arcaneChestCount: 1 }
  return normalizeWarehouseRowData(row.data)
}

export async function saveWarehouseRow(moduleId, payload) {
  const mod = moduleId ?? 'default'
  const data = normalizeWarehouseRowDataForSave(payload)
  const { error } = await supabase.from(TABLE).upsert(
    { module_id: mod, data, updated_at: new Date().toISOString() },
    { onConflict: 'module_id' },
  )
  if (error) throw error
}
