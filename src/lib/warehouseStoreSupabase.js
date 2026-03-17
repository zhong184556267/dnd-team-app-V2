/**
 * Supabase 持久化层：团队仓库表 warehouse (module_id pk, data jsonb 物品数组)
 */
import { supabase } from './supabase'

const TABLE = 'warehouse'

export async function fetchWarehouse(moduleId) {
  const mod = moduleId ?? 'default'
  const { data: row, error } = await supabase.from(TABLE).select('*').eq('module_id', mod).maybeSingle()
  if (error) throw error
  if (!row || !Array.isArray(row.data)) return []
  return row.data
}

export async function saveWarehouseRow(moduleId, list) {
  const mod = moduleId ?? 'default'
  const { error } = await supabase.from(TABLE).upsert(
    { module_id: mod, data: Array.isArray(list) ? list : [], updated_at: new Date().toISOString() },
    { onConflict: 'module_id' }
  )
  if (error) throw error
}
