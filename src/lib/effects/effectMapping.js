/**
 * BUFF / 物品条目 与统一 Effect 互转
 * 保证 BuffForm、ItemAddForm 与 useBuffCalculator 使用同一套效果结构
 */

import { EFFECT_SOURCE_KIND } from './effectModel'
import { normalizeEffectCategory } from '../../data/buffTypes'
import { getItemById, getItemDisplayName } from '../../data/itemDatabase'

/**
 * 从 BUFF 对象取出 Effect 数组（兼容旧单条与新 effects 数组）
 * @param {Object} buff - 单条 BUFF { effects?, category?, effectType?, value? }
 * @returns {{ effectType: string, value: any }[]} 扁平列表，供计算器使用
 */
export function getEffectsFromBuff(buff) {
  if (!buff) return []
  if (Array.isArray(buff.effects) && buff.effects.length) {
    return buff.effects.map((e) => ({
      effectType: e.effectType ?? '',
      value: e.value,
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
    }))
  }
  if (buff.effectType != null || buff.category != null) {
    return [{ effectType: buff.effectType ?? '', value: buff.value, category: normalizeEffectCategory(buff.effectType ?? '', buff.category) }]
  }
  return []
}

/**
 * 从物品条目取出 Effect 数组（用于统一计算时合并装备效果）
 * @param {Object} entry - 背包条目 { effects?, magicBonus?, charge?, 附注?, ... }
 * @returns {Array<{ category: string, effectType: string, value: any }>}
 */
export function getEffectsFromItem(entry) {
  if (!entry) return []
  if (Array.isArray(entry.effects) && entry.effects.length) {
    return entry.effects.map((e) => ({
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
      effectType: e.effectType ?? '',
      value: e.value ?? 0,
      customText: e.customText ?? '',
    }))
  }
  const out = []
  const magicVal = entry.magicBonus != null && entry.magicBonus !== '' ? Number(entry.magicBonus) : 0
  if (magicVal !== 0) {
    out.push({ category: 'offense', effectType: 'attack_melee', value: magicVal })
  }
  if (entry.charge != null && entry.charge !== '') {
    out.push({ category: 'mobility_casting', effectType: 'charge', value: Number(entry.charge) || 0 })
  }
  const 附注 = (entry.附注 ?? '').trim()
  const acMatch = 附注.match(/AC\s*\+\s*(\d+)/i)
  if (acMatch) {
    out.push({ category: 'defense', effectType: 'ac_bonus', value: parseInt(acMatch[1], 10) || 0 })
  }
  if (entry.spellDC != null && entry.spellDC !== '') {
    out.push({
      category: 'mobility_casting',
      effectType: 'save_dc_bonus',
      value: { val: Number(entry.spellDC) || 0, advantage: '' },
    })
  }
  const 攻击距离 = (entry.攻击距离 ?? '').trim()
  const reachNum = 攻击距离.match(/(\d+)/)?.[1]
  if (reachNum) {
    out.push({ category: 'offense', effectType: 'reach_bonus', value: parseInt(reachNum, 10) || 0 })
  }
  if ((entry.攻击范围 ?? '').trim()) {
    out.push({ category: 'offense', effectType: 'attack_range', value: 0, customText: String(entry.攻击范围).trim() })
  }
  return out
}

/**
 * 将 BUFF 列表展平为计算器用的 { effectType, value } 列表（兼容旧格式）
 * 与 useBuffCalculator 原 getFlatEffectEntries 行为一致，统一入口
 */
export function getFlatEffectEntries(buffs) {
  const out = []
  const list = Array.isArray(buffs) ? buffs : []
  for (const b of list) {
    const effects = getEffectsFromBuff(b)
    effects.forEach((e) => out.push({ effectType: e.effectType, value: e.value }))
  }
  return out
}

/**
 * 将 BUFF 转为 EffectSource（用于统一模型展示/计算）
 */
export function buffToEffectSource(buff) {
  const effects = getEffectsFromBuff(buff).map((e) => ({
    category: e.category ?? 'ability',
    effectType: e.effectType ?? '',
    value: e.value ?? 0,
    customText: typeof e.value === 'string' ? e.value : '',
  }))
  return {
    id: buff.id ?? '',
    kind: EFFECT_SOURCE_KIND.BUFF,
    label: buff.source ?? '',
    enabled: buff.enabled !== false,
    effects,
    duration: buff.duration,
  }
}

/**
 * 将物品条目转为 EffectSource（用于统一模型）
 */
export function itemToEffectSource(entry, label = '') {
  const effects = getEffectsFromItem(entry)
  return {
    id: entry.id ?? '',
    kind: EFFECT_SOURCE_KIND.ITEM,
    label: label || entry.name || '',
    enabled: true,
    effects,
  }
}

/**
 * 从角色「已装备」物品（手持 + 身穿槽位）中收集带附魔的条目，生成虚拟 BUFF 列表（用于 BUFF 栏展示与计算）
 * 仅统计装备在身上的，背包中未装备的不显示。
 * @param {Object} character - 角色 { inventory?, equippedHeld?, equippedWorn? }
 * @returns {Array<{ id: string, source: string, effects: Array, enabled: boolean, fromItem: true }>}
 */
export function getBuffsFromEquipmentAndInventory(character) {
  const inv = character?.inventory ?? []
  const held = character?.equippedHeld ?? []
  const worn = character?.equippedWorn ?? []
  const equippedIds = new Set()
  for (const slot of held) {
    if (slot?.inventoryId) equippedIds.add(slot.inventoryId)
  }
  for (const slot of worn) {
    if (slot?.inventoryId) equippedIds.add(slot.inventoryId)
  }

  const out = []
  for (const entry of inv) {
    if (!equippedIds.has(entry?.id)) continue
    const effects = getEffectsFromItem(entry)
    if (effects.length === 0) continue
    const proto = entry?.itemId ? getItemById(entry.itemId) : null
    const displayName = (entry.name && String(entry.name).trim()) ? String(entry.name).trim() : (getItemDisplayName(proto) || '未命名物品')
    out.push({
      id: 'item_' + (entry.id || 'inv_' + Math.random().toString(36).slice(2)),
      source: displayName,
      effects: effects.map((e) => ({ effectType: e.effectType, value: e.value, category: e.category })),
      enabled: true,
      fromItem: true,
    })
  }
  return out
}
