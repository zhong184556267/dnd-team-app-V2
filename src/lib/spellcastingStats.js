/**
 * 施法能力数值：与 CombatStatus「施法能力」行公式一致，供法术书等复用
 * - 法术攻击加值 = 熟练加值 + 施法属性调整值（含 Buff 后属性）+ Buff 法术攻击加值
 * - 法术豁免 DC = 8 + 同上熟练 + 同上调整值 + Buff DC 加值
 * level 为角色总等级（熟练加值查表，与战斗页一致）
 * @param {object|null} baseAbilitiesFallback - 无 Buff 属性覆盖时用，须与战斗页 `abilities` 参数一致（通常为 char.abilities）
 */
import { abilityModifier, proficiencyBonus } from './formulas'
import { getPrimarySpellcastingAbility, getSpellcastingLevel } from '../data/classDatabase'

export function getSpellcastingCombatStats(char, buffStats, level, baseAbilitiesFallback) {
  const L = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)))
  const prof =
    buffStats?.proficiencyOverride != null ? buffStats.proficiencyOverride : proficiencyBonus(L)
  const baseAbilities = baseAbilitiesFallback ?? char?.abilities ?? {}
  const effectiveAbilities = buffStats?.abilities ?? baseAbilities
  const spellAbility = getPrimarySpellcastingAbility(char)
  const spellcastingLevel = getSpellcastingLevel(char)
  if (spellAbility == null) {
    return {
      spellAbility: null,
      spellAttackBonus: null,
      spellDC: null,
      spellcastingLevel,
      prof,
    }
  }
  const mod = abilityModifier(effectiveAbilities?.[spellAbility] ?? 10)
  const spellAttackBonus = prof + mod + (Number(buffStats?.spellAttackBonus) || 0)
  const spellDC = 8 + prof + mod + (Number(buffStats?.saveDcBonus) || 0)
  return {
    spellAbility,
    spellAttackBonus,
    spellDC,
    spellcastingLevel,
    prof,
  }
}
