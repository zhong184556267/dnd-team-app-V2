/**
 * 统一被动效果模型入口
 * BUFF 与物品栏「附魔效果」共用同一套 Effect 结构，计算时由 effectMapping 展平
 */
export { EFFECT_SOURCE_KIND, EFFECT_CATEGORY, createEmptyEffect, isSameEffectType } from './effectModel'
export {
  getEffectsFromBuff,
  getEffectsFromItem,
  getFlatEffectEntries,
  buffToEffectSource,
  itemToEffectSource,
} from './effectMapping'
