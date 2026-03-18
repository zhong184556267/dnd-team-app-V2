/**
 * 启用 Supabase 后清除曾存在本地的团队数据键，避免与云端混淆。
 * 保留 starlight_user（登录名）
 */
const KEEP = new Set(['starlight_user'])

export function clearLegacyTeamLocalStorage() {
  try {
    const keys = Object.keys(localStorage)
    for (const k of keys) {
      if (KEEP.has(k)) continue
      if (
        k === 'dnd_modules' ||
        k === 'dnd_current_module_id' ||
        k.startsWith('dnd_warehouse_') ||
        k === 'dnd_warehouse' ||
        k.startsWith('dnd_team_vault_') ||
        k === 'dnd_team_vault' ||
        k.startsWith('dnd_magic_crafting_') ||
        k === 'dnd_custom_items' ||
        k === 'dnd_custom_spells' ||
        k.startsWith('starlight_default_character_') ||
        k === 'starlight_characters'
      ) {
        localStorage.removeItem(k)
      }
    }
  } catch (_) {}
}
