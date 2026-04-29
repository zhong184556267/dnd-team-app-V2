/**
 * 规则收录 / 角色卡 共用的「名称与正文覆盖」：按战役 moduleId 存 localStorage，便于 DM 在网页上改职业/子职特性名称与正文、专长等而不立刻改代码。
 * 不替代代码库数据；仅在有覆盖键时替换展示文案。
 */
import { canonicalClassName } from '../data/classDatabase'

const STORAGE_PREFIX = 'dnd-rule-text-overrides-v1-'

export const RULE_TEXT_OVERRIDES_EVENT = 'dnd-rule-text-overrides-changed'

export function ruleTextOverridesStorageKey(moduleId) {
  const m = moduleId && String(moduleId).trim() ? String(moduleId).trim() : 'default'
  return `${STORAGE_PREFIX}${m}`
}

export function loadRuleTextOverrides(moduleId) {
  try {
    const raw = localStorage.getItem(ruleTextOverridesStorageKey(moduleId))
    if (!raw) return {}
    const j = JSON.parse(raw)
    if (j && typeof j.entries === 'object' && j.entries !== null) return { ...j.entries }
  } catch {
    /* ignore */
  }
  return {}
}

export function saveRuleTextOverrides(moduleId, entries) {
  try {
    localStorage.setItem(
      ruleTextOverridesStorageKey(moduleId),
      JSON.stringify({ entries, updatedAt: Date.now() }),
    )
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RULE_TEXT_OVERRIDES_EVENT, { detail: { moduleId } }))
  }
}

export function buildClassFeatureKey(className, featureId) {
  const c = canonicalClassName(className)
  return `cf|${c}|${featureId}|d`
}

/** 职业特性 · 显示名称（与 |d 正文独立） */
export function buildClassFeatureNameKey(className, featureId) {
  const c = canonicalClassName(className)
  return `cf|${c}|${featureId}|n`
}

export function buildSubclassFeatureKey(className, subclassName, featureId) {
  const c = canonicalClassName(className)
  const sub = encodeURIComponent(String(subclassName ?? '').trim() || '_')
  return `sf|${c}|${sub}|${featureId}|d`
}

/** 子职特性 · 显示名称 */
export function buildSubclassFeatureNameKey(className, subclassName, featureId) {
  const c = canonicalClassName(className)
  const sub = encodeURIComponent(String(subclassName ?? '').trim() || '_')
  return `sf|${c}|${sub}|${featureId}|n`
}

export function buildFeatDescriptionKey(featId) {
  return `feat|${featId}|d`
}

/** 专长 · 显示名称（与 |d 正文独立） */
export function buildFeatNameKey(featId) {
  return `feat|${featId}|n`
}

export function buildInvocationKey(id, field) {
  return `inv|${id}|${field === 'p' ? 'p' : 'd'}`
}

export function buildMartialKey(id) {
  return `mt|${id}|d`
}

export function buildFocusAbilityKey(className, rowId) {
  return `fa|${canonicalClassName(className)}|${rowId}|e`
}

/** @param {Record<string, string>} map */
export function resolveRuleText(map, key, fallback) {
  if (!map || !key) return fallback ?? ''
  const v = map[key]
  if (v != null && String(v).length > 0) return String(v)
  return fallback ?? ''
}

export function setRuleTextEntry(moduleId, key, value, originalText) {
  const map = { ...loadRuleTextOverrides(moduleId) }
  const next = String(value ?? '').trimEnd()
  const orig = String(originalText ?? '').trimEnd()
  if (next === '' || next === orig) {
    delete map[key]
  } else {
    map[key] = value
  }
  saveRuleTextOverrides(moduleId, map)
}

export function clearRuleTextEntry(moduleId, key) {
  const map = { ...loadRuleTextOverrides(moduleId) }
  delete map[key]
  saveRuleTextOverrides(moduleId, map)
}
