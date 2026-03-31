import { normalizeBuffSourceKindKey } from './buffSourceKind'

/**
 * 将「临时 BUFF 模板」深拷贝为可写入 char.buffs 的手动 Buff（新 id、默认启用）。
 */
export function cloneBuffTemplateToManual(template) {
  if (!template || typeof template !== 'object') return null
  const effects = Array.isArray(template.effects)
    ? template.effects.map((e) => ({
        category: e.category,
        effectType: e.effectType,
        value: e.value,
      }))
    : []
  return {
    source: String(template.source ?? '').trim() || '临时 Buff',
    duration: template.duration != null && String(template.duration).trim() !== '' ? String(template.duration).trim() : undefined,
    sourceKind: normalizeBuffSourceKindKey(template.sourceKind ?? 'temporary'),
    effects,
    enabled: true,
    id: `buff_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  }
}
