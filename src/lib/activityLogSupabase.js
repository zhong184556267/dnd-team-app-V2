import { supabase } from './supabase'

const TABLE = 'activity_log'

export async function insertActivityRow({ module_id, actor, summary }) {
  const { error } = await supabase.from(TABLE).insert({
    module_id: module_id ?? 'default',
    actor: actor ?? '',
    summary: String(summary ?? '').slice(0, 500),
  })
  if (error) throw error
}

export async function fetchActivities(limit = 50) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)))
  if (error) throw error
  return data || []
}
