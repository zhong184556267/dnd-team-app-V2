import { useMemo } from 'react'
import { abilityModifier, getAC, getHPBuffSum } from '../lib/formulas'
import { ABILITY_KEYS } from '../data/buffTypes'

/**
 * BUFF 计算引擎
 * 输入：character, activeBuffs (已过滤 enabled=true)
 * 输出：finalStats (AC、攻击加值、豁免、优势/劣势等)
 */
export function useBuffCalculator(character, activeBuffs) {
  return useMemo(() => {
    const buffs = (activeBuffs || []).filter((b) => b.enabled !== false)
    const baseAC = getAC(character)
    const baseAbilities = character?.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }

    // 1. 属性：override 优先，否则 base + ability_score
    let hasAbilityOverride = false
    const abilityOverride = {}
    const abilityBonus = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }

    for (const b of buffs) {
      if (b.effectType === 'ability_override' && b.value && typeof b.value === 'object') {
        hasAbilityOverride = true
        for (const k of ABILITY_KEYS) {
          const v = Number(b.value[k])
          if (!Number.isNaN(v)) abilityOverride[k] = v
        }
      }
      if (b.effectType === 'ability_score' && b.value && typeof b.value === 'object') {
        for (const k of ABILITY_KEYS) {
          const v = Number(b.value[k])
          if (!Number.isNaN(v)) abilityBonus[k] = (abilityBonus[k] || 0) + v
        }
      }
    }

    const finalAbilities = {}
    for (const k of ABILITY_KEYS) {
      if (hasAbilityOverride && abilityOverride[k] != null) {
        finalAbilities[k] = abilityOverride[k]
      } else {
        finalAbilities[k] = (baseAbilities[k] ?? 10) + (abilityBonus[k] || 0)
      }
    }

    // 2. 攻击加值：melee / ranged / all 分离累加
    let attackMelee = 0
    let attackRanged = 0
    let attackAll = 0
    let dmgMelee = 0
    let dmgRanged = 0
    let dmgAll = 0

    for (const b of buffs) {
      const v = Number(b.value)
      if (Number.isNaN(v)) continue
      if (b.effectType === 'attack_melee') attackMelee += v
      else if (b.effectType === 'attack_ranged') attackRanged += v
      else if (b.effectType === 'attack_all') attackAll += v
      else if (b.effectType === 'dmg_bonus_melee') dmgMelee += v
      else if (b.effectType === 'dmg_bonus_ranged') dmgRanged += v
      else if (b.effectType === 'dmg_bonus_all') dmgAll += v
    }

    const meleeAttackBonus = attackMelee + attackAll
    const rangedAttackBonus = attackRanged + attackAll
    const meleeDamageBonus = dmgMelee + dmgAll
    const rangedDamageBonus = dmgRanged + dmgAll

    // 3. 优势/劣势
    let advMelee = 0
    let advRanged = 0
    let advAllAttack = 0
    let advSave = 0
    let advSkill = 0
    let disadvAll = 0

    for (const b of buffs) {
      if (b.value !== true && b.value !== 'true' && b.value !== 1) continue
      if (b.effectType === 'adv_melee') advMelee++
      else if (b.effectType === 'adv_ranged') advRanged++
      else if (b.effectType === 'adv_all_attack') advAllAttack++
      else if (b.effectType === 'adv_save') advSave++
      else if (b.effectType === 'adv_skill') advSkill++
      else if (b.effectType === 'disadv_all') disadvAll++
    }

    let advantage = {
      melee: disadvAll > 0 ? 'disadvantage' : advMelee + advAllAttack > 0 ? 'advantage' : 'normal',
      ranged: disadvAll > 0 ? 'disadvantage' : advRanged + advAllAttack > 0 ? 'advantage' : 'normal',
      save: disadvAll > 0 ? 'disadvantage' : advSave > 0 ? 'advantage' : 'normal',
      skill: disadvAll > 0 ? 'disadvantage' : advSkill > 0 ? 'advantage' : 'normal',
    }

    // 7. 状态效果与力竭的减益（力竭规则参考 D&D 2024）
    const conditions = Array.isArray(character?.conditions) ? character.conditions : []
    const exhaustionLevel = Math.max(0, Math.min(6, Number(character?.exhaustionLevel) || 0))
    let speedMultiplier = 1
    let maxHpMultiplier = 1
    const disadvantageKeys = new Set()
    // D&D 2024 力竭：d20 检定 -2×等级，速度 -5尺×等级，6级死亡（不再用劣势/生命减半）
    const d20ExhaustionPenalty = exhaustionLevel >= 6 ? -12 : -2 * exhaustionLevel
    const speedExhaustionPenalty = exhaustionLevel >= 6 ? 999 : 5 * exhaustionLevel
    if (conditions.includes('poisoned')) { disadvantageKeys.add('melee'); disadvantageKeys.add('ranged'); disadvantageKeys.add('skill') }
    if (conditions.includes('blinded')) { disadvantageKeys.add('melee'); disadvantageKeys.add('ranged') }
    if (conditions.includes('frightened')) disadvantageKeys.add('skill')
    if (['stunned', 'paralyzed', 'unconscious'].some((c) => conditions.includes(c))) speedMultiplier = 0
    if (disadvantageKeys.size) {
      advantage = { ...advantage, ...Object.fromEntries([...disadvantageKeys].map((k) => [k, 'disadvantage'])) }
    }

    // 4. AC、速度、先攻、DC、熟练
    let acBonus = 0
    let speedBonus = 0
    let reachBonus = 0
    let initBonus = 0
    let saveDcBonus = 0
    let profOverride = null

    for (const b of buffs) {
      const v = Number(b.value)
      if (b.effectType === 'ac_bonus') acBonus += v
      else if (b.effectType === 'speed_bonus') speedBonus += v
      else if (b.effectType === 'reach_bonus') reachBonus += v
      else if (b.effectType === 'init_bonus') initBonus += v
      else if (b.effectType === 'save_dc_bonus') saveDcBonus += v
      else if (b.effectType === 'proficiency_override' && !Number.isNaN(v)) profOverride = v
    }

    // 5. 生命：temp_hp 取最大，max_hp_bonus 累加
    let tempHp = 0
    let maxHpBonus = 0
    let regeneration = 0

    for (const b of buffs) {
      const v = Number(b.value)
      if (b.effectType === 'temp_hp' && !Number.isNaN(v)) tempHp = Math.max(tempHp, v)
      else if (b.effectType === 'max_hp_bonus') maxHpBonus += v
      else if (b.effectType === 'regeneration') regeneration += v
    }

    // 6. 抗性/免疫/易伤（收集数组）
    const resistTypes = []
    const immuneTypes = []
    const vulnerableTypes = []
    const dmgTypeBonus = {} // { fire: 2, cold: -1, ... }

    for (const b of buffs) {
      const arr = Array.isArray(b.value) ? b.value : (b.value && b.value.types) ? b.value.types : []
      if (b.effectType === 'resist_type') resistTypes.push(...arr)
      else if (b.effectType === 'immune_type') immuneTypes.push(...arr)
      else if (b.effectType === 'vulnerable_type') vulnerableTypes.push(...arr)
      else if (b.effectType === 'dmg_type_specific' && b.value && typeof b.value === 'object' && b.value.type) {
        const t = String(b.value.type).toLowerCase()
        const v = Number(b.value.val)
        if (!Number.isNaN(v)) dmgTypeBonus[t] = (dmgTypeBonus[t] || 0) + v
      }
    }

    return {
      abilities: finalAbilities,
      meleeAttackBonus,
      rangedAttackBonus,
      meleeDamageBonus,
      rangedDamageBonus,
      advantage,
      ac: baseAC.total + acBonus,
      acBonus,
      speedBonus,
      reachBonus,
      initBonus,
      saveDcBonus,
      proficiencyOverride: profOverride,
      tempHp,
      maxHpBonus,
      regeneration,
      resistTypes,
      immuneTypes,
      vulnerableTypes,
      dmgTypeBonus,
      speedMultiplier,
      maxHpMultiplier,
      d20ExhaustionPenalty,
      speedExhaustionPenalty,
    }
  }, [character, activeBuffs])
}

/**
 * 伤害计算辅助：根据抗性/免疫/易伤修正
 */
export function calculateDamage(baseRoll, damageType, buffStats) {
  if (!buffStats) return baseRoll
  const { resistTypes, immuneTypes, vulnerableTypes, dmgTypeBonus = {} } = buffStats
  const type = String(damageType || '').toLowerCase()
  const typeBonus = dmgTypeBonus[type] || 0
  let result = baseRoll + typeBonus

  if (immuneTypes.includes(type)) return 0
  if (vulnerableTypes.includes(type)) result *= 2
  if (resistTypes.includes(type)) result = Math.floor(result / 2)
  return result
}
