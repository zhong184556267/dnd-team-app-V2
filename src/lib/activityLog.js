import { isSupabaseEnabled } from './supabase'
import * as act from './activityLogSupabase'

/**
 * 记录一条团队动态（仅 Supabase 启用时写入）
 * @param {{ actor: string, moduleId?: string, summary: string }} p
 */
export function logTeamActivity({ actor, moduleId, summary }) {
  if (!isSupabaseEnabled() || !actor || !summary) return
  act
    .insertActivityRow({
      module_id: moduleId ?? 'default',
      actor: String(actor).trim(),
      summary: String(summary).trim(),
    })
    .then(() => {
      window.dispatchEvent(new CustomEvent('dnd-realtime-activity'))
    })
    .catch(() => {})
}

export async function loadTeamActivities(limit = 40) {
  if (!isSupabaseEnabled()) return []
  try {
    return await act.fetchActivities(limit)
  } catch {
    return []
  }
}
