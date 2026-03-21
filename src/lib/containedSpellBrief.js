/**
 * 附魔「内含法术」在外显简述中的文案，如：5环火球术、戏法光亮术
 */
import { getSpellById } from '../data/spellDatabase'

export function formatContainedSpellBrief(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const level = typeof value.level === 'number' ? value.level : (parseInt(value.level, 10) || 0)
  let name = (value.spellName || '').trim()
  if (!name && value.spellId) {
    const sp = getSpellById(value.spellId)
    name = (sp?.name || '').trim()
  }
  if (!name) return ''
  if (level <= 0) return `戏法${name}`
  const lv = Math.max(0, Math.min(9, level))
  return `${lv}环${name}`
}

/**
 * 将多条内含法术拼到简述末尾（与原有介绍用分号分隔）
 * @param {Array<{ effectType?: string, value?: unknown }>|undefined} effects
 * @param {string} existingText 已有简述（可为空）
 */
export function appendContainedSpellsBrief(effects, existingText) {
  const base = (existingText && String(existingText).trim()) || ''
  if (!Array.isArray(effects) || effects.length === 0) return base
  const spells = effects
    .filter((e) => e.effectType === 'contained_spell')
    .map((e) => formatContainedSpellBrief(e.value))
    .filter(Boolean)
  if (spells.length === 0) return base
  const spellStr = spells.join('；')
  return base ? `${base}；${spellStr}` : spellStr
}
