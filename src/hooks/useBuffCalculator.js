import { useMemo } from 'react'
import { abilityModifier, getAC, getHPBuffSum } from '../lib/formulas'
import { ABILITY_KEYS, getDamageTypeValue } from '../data/buffTypes'
import { getFlatEffectEntries } from '../lib/effects/effectMapping'

/**
 * BUFF 计算引擎
 * 输入：character, activeBuffs (已过滤 enabled=true)
 * 输出：finalStats (AC、攻击加值、豁免、优势/劣势等)
 * 支持单条 buff 与多效果 buff（buff.effects 数组）
 */
/** 自由填写类效果仅作展示，不参与 AC/攻击/豁免等数值计算 */
const DISPLAY_ONLY_EFFECT_TYPES = ['custom_condition']

export function useBuffCalculator(character, activeBuffs) {
  return useMemo(() => {
    const buffs = (activeBuffs || []).filter((b) => b.enabled !== false)
    const rawEntries = getFlatEffectEntries(buffs)
    const entries = rawEntries.filter((e) => !DISPLAY_ONLY_EFFECT_TYPES.includes(e.effectType))
    const baseAbilities = character?.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }

    // 1. 属性：override 优先，否则 base + ability_score
    let hasAbilityOverride = false
    const abilityOverride = {}
    const abilityBonus = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }

    for (const b of entries) {
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

    for (const b of entries) {
      const raw = b.value
      const v = Number(typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw)
      if (!Number.isNaN(v)) {
        if (b.effectType === 'attack_melee') attackMelee += v
        else if (b.effectType === 'attack_ranged') attackRanged += v
        else if (b.effectType === 'attack_all' || b.effectType === 'attack_bonus') attackAll += v
        else if (b.effectType === 'dmg_bonus_melee') dmgMelee += v
        else if (b.effectType === 'dmg_bonus_ranged') dmgRanged += v
        else if (b.effectType === 'dmg_bonus_all') dmgAll += v
        // 新表：命中/伤害加值（数字输入），数值同时加到命中与伤害
        else if (b.effectType === 'attack_damage_bonus') {
          attackAll += v
          dmgAll += v
        }
      }
      // 兼容旧数据：攻击/伤害数值加值（文本解析，如「攻击+2 / 伤害+3」）
      if (b.effectType === 'attack_damage_bonus' && typeof raw === 'string') {
        const attackMatch = raw.match(/攻击\s*[+＋]?\s*(\d+)/i)
        const dmgMatch = raw.match(/伤害\s*[+＋]?\s*(\d+)/i)
        if (attackMatch) attackAll += (parseInt(attackMatch[1], 10) || 0)
        if (dmgMatch) dmgAll += (parseInt(dmgMatch[1], 10) || 0)
      }
    }

    const meleeAttackBonus = attackMelee + attackAll
    const rangedAttackBonus = attackRanged + attackAll
    const meleeDamageBonus = dmgMelee + dmgAll
    const rangedDamageBonus = dmgRanged + dmgAll

    // 3. 优势/劣势（含 numberAndAdvantage 等对象中的 advantage）
    let advMelee = 0
    let advRanged = 0
    let advAllAttack = 0
    let advSave = 0
    let advSkill = 0
    let disadvAll = 0
    let disadvSave = 0
    let disadvSkill = 0

    for (const b of entries) {
      const objAdv = typeof b.value === 'object' && b.value && b.value.advantage
      if (b.effectType === 'save_bonus') {
        if (objAdv === 'advantage') advSave++
        else if (objAdv === 'disadvantage') disadvSave++
      } else if (b.effectType === 'skill_bonus') {
        if (objAdv === 'advantage') advSkill++
        else if (objAdv === 'disadvantage') disadvSkill++
      }
      // 命中/伤害加值上的优势/劣势：视为所有攻击的优势/劣势来源
      if (b.effectType === 'attack_damage_bonus') {
        if (objAdv === 'advantage') advAllAttack++
        else if (objAdv === 'disadvantage') disadvAll++
      }
      if (b.value !== true && b.value !== 'true' && b.value !== 1 && !objAdv) continue
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
      save: disadvAll > 0 || disadvSave > 0 ? 'disadvantage' : advSave > 0 ? 'advantage' : 'normal',
      skill: disadvAll > 0 || disadvSkill > 0 ? 'disadvantage' : advSkill > 0 ? 'advantage' : 'normal',
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

    // 4. AC（使用增益后的属性，使敏捷等加成正确）、速度、先攻、DC、熟练
    // Base AC should be computed from equipment + buffed abilities only.
    // Do not re-read character.buffs here, otherwise legacy buff fields can be double-counted.
    const charWithBuffedAbilities = character
      ? { ...character, abilities: finalAbilities, buffs: [] }
      : { abilities: finalAbilities, buffs: [] }
    const baseAC = getAC(charWithBuffedAbilities)

    let acBonus = 0
    const acCapStoneLayerValues = []
    let speedBonus = 0
    let reachBonus = 0
    let initBonus = 0
    let saveDcBonus = 0
    let profOverride = null
    let spellAttackBonus = 0
    let flightSpeed = 0
    let flightHover = false
    const saveBonusPerAbility = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
    const skillBonusPerSkill = {}
    let concentrationBonus = 0
    let concentrationAdvantage = null
    let ignoreDifficultTerrain = false
    let spellRangeMultiplier = 1
    let spellRangeBonus = 0
    const ignoreResistanceTypes = []

    for (const b of entries) {
      const raw = b.value
      const v = Number(typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw)
      if (b.effectType === 'ac_bonus') acBonus += Number(raw) || 0
      else if (b.effectType === 'ac_cap_stone_layer') {
        const y = Number(raw)
        if (!Number.isNaN(y)) acCapStoneLayerValues.push(y)
      }
      else if (b.effectType === 'speed_bonus') speedBonus += Number(raw) || 0
      else if (b.effectType === 'reach_bonus') reachBonus += v
      else if (b.effectType === 'init_bonus') initBonus += v
      else if (b.effectType === 'save_dc_bonus') saveDcBonus += (typeof raw === 'object' && raw && 'val' in raw ? Number(raw.val) : Number(raw)) || 0
      else if (b.effectType === 'spell_attack_bonus') spellAttackBonus += (typeof raw === 'object' && raw && 'val' in raw ? Number(raw.val) : Number(raw)) || 0
      else if (b.effectType === 'proficiency_override' && !Number.isNaN(v)) profOverride = v
      else if (b.effectType === 'flight_speed' && raw && typeof raw === 'object') {
        const sp = Number(raw.speed)
        if (!Number.isNaN(sp) && sp > flightSpeed) flightSpeed = sp
        if (raw.hover) flightHover = true
      } else if (b.effectType === 'concentration' && raw && typeof raw === 'object') {
        const cb = Number(raw.val)
        if (!Number.isNaN(cb)) concentrationBonus += cb
        if (raw.advantage === 'advantage') concentrationAdvantage = 'advantage'
        else if (raw.advantage === 'disadvantage') concentrationAdvantage = 'disadvantage'
      } else if (b.effectType === 'save_bonus' && raw && typeof raw === 'object') {
        for (const k of ABILITY_KEYS) {
          const n = Number(raw[k])
          if (!Number.isNaN(n)) saveBonusPerAbility[k] = (saveBonusPerAbility[k] || 0) + n
        }
      } else if (b.effectType === 'skill_bonus' && raw && typeof raw === 'object') {
        for (const [k, val] of Object.entries(raw)) {
          if (k === 'advantage') continue
          const n = Number(val)
          if (!Number.isNaN(n)) skillBonusPerSkill[k] = (skillBonusPerSkill[k] || 0) + n
        }
      }
      // 新表：无视伤害抗性（防御与生存）
      else if (b.effectType === 'ignore_resistance' && Array.isArray(raw)) {
        ignoreResistanceTypes.push(...raw.map((t) => getDamageTypeValue(t) || String(t).toLowerCase()).filter(Boolean))
      }
      // 新表：伤害穿透特性 → 忽略伤害抗性（元素+光/暗 合并为 pierce 数组）
      else if (b.effectType === 'damage_piercing_traits') {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const pierce = Array.isArray(raw.pierce)
            ? raw.pierce
            : [...(Array.isArray(raw.element) ? raw.element : []), ...(Array.isArray(raw.alignment) ? raw.alignment : [])]
          ignoreResistanceTypes.push(...pierce.map((t) => getDamageTypeValue(t) || String(t).toLowerCase()))
        } else if (Array.isArray(raw)) {
          if (raw.includes('element')) ignoreResistanceTypes.push('fire', 'cold', 'lightning', 'acid', 'poison')
          if (raw.includes('alignment')) ignoreResistanceTypes.push('radiant', 'necrotic')
        }
      }
      // 新表：地形无视（移动与施法）
      else if (b.effectType === 'terrain_ignore' && (raw === true || raw === 'true' || raw === 1)) {
        ignoreDifficultTerrain = true
      }
      // 新表：专注增强（对象：val + advantage；兼容旧文本）
      else if (b.effectType === 'concentration_save_enhance') {
        if (raw && typeof raw === 'object') {
          const cb = Number(raw.val)
          if (!Number.isNaN(cb)) concentrationBonus += cb
          if (raw.advantage === 'advantage') concentrationAdvantage = 'advantage'
          else if (raw.advantage === 'disadvantage') concentrationAdvantage = 'disadvantage'
        } else if (typeof raw === 'string') {
          if (/优势/i.test(raw)) concentrationAdvantage = 'advantage'
          const plusMatch = raw.match(/[+＋](\d+)/)
          if (plusMatch) concentrationBonus += (parseInt(plusMatch[1], 10) || 0)
        }
      }
      // 新表：施法距离延伸（x2 或 +N）
      else if (b.effectType === 'spell_range_extension' && typeof raw === 'string') {
        if (/x\s*2|2\s*倍|×\s*2/i.test(raw)) spellRangeMultiplier = Math.max(spellRangeMultiplier, 2)
        const plusMatch = raw.match(/[+＋](\d+)/)
        if (plusMatch) spellRangeBonus += (parseInt(plusMatch[1], 10) || 0)
      }
      // 新表：速度增加（统一数值，默认为地面速度 +X）
      else if (b.effectType === 'base_speed_increment') {
        if (typeof raw === 'number') {
          speedBonus += raw
        } else if (typeof raw === 'string') {
          const walkMatch = raw.match(/行走\s*[+＋]?\s*(\d+)/i)
          const flyMatch = raw.match(/飞行\s*[+＋]?\s*(\d+)/i)
          if (walkMatch) speedBonus += (parseInt(walkMatch[1], 10) || 0)
          if (flyMatch) {
            const n = parseInt(flyMatch[1], 10) || 0
            if (n > flightSpeed) flightSpeed = n
          }
          const swimMatch = raw.match(/游泳\s*[+＋]?\s*(\d+)/i)
          const climbMatch = raw.match(/攀爬\s*[+＋]?\s*(\d+)/i)
          if (swimMatch) speedBonus += (parseInt(swimMatch[1], 10) || 0)
          if (climbMatch) speedBonus += (parseInt(climbMatch[1], 10) || 0)
        }
      }
    }

    // 5. 生命：temp_hp 取最大，max_hp_bonus 累加
    let tempHp = 0
    let maxHpBonus = 0
    let regeneration = 0

    for (const b of entries) {
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

    for (const b of entries) {
      const arr = Array.isArray(b.value) ? b.value : (b.value && b.value.types) ? b.value.types : []
      const toValue = (t) => getDamageTypeValue(t) || String(t).toLowerCase()
      if (b.effectType === 'resist_type') resistTypes.push(...arr.map(toValue).filter(Boolean))
      else if (b.effectType === 'immune_type') immuneTypes.push(...arr.map(toValue).filter(Boolean))
      else if (b.effectType === 'vulnerable_type') vulnerableTypes.push(...arr.map(toValue).filter(Boolean))
      else if (b.effectType === 'dmg_type_specific' && b.value && typeof b.value === 'object' && b.value.type) {
        const t = toValue(b.value.type)
        const v = Number(b.value.val)
        if (!Number.isNaN(v) && t) dmgTypeBonus[t] = (dmgTypeBonus[t] || 0) + v
      }
    }

    const baseACTotal = baseAC?.total ?? 10
    let ac = baseACTotal + acBonus
    if (acCapStoneLayerValues.length > 0) {
      const cap = baseACTotal + Math.min(...acCapStoneLayerValues)
      ac = Math.min(ac, cap)
    }
    return {
      abilities: finalAbilities,
      meleeAttackBonus,
      rangedAttackBonus,
      meleeDamageBonus,
      rangedDamageBonus,
      advantage,
      ac,
      acBonus,
      speedBonus,
      reachBonus,
      initBonus,
      saveDcBonus,
      spellAttackBonus,
      proficiencyOverride: profOverride,
      flightSpeed,
      flightHover,
      saveBonusPerAbility,
      skillBonusPerSkill,
      concentrationBonus,
      concentrationAdvantage,
      ignoreDifficultTerrain,
      spellRangeMultiplier,
      spellRangeBonus,
      ignoreResistanceTypes,
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
  const { resistTypes = [], immuneTypes = [], vulnerableTypes = [], dmgTypeBonus = {}, ignoreResistanceTypes = [] } = buffStats
  const type = getDamageTypeValue(damageType) || String(damageType || '').toLowerCase()
  const typeBonus = dmgTypeBonus[type] || 0
  let result = baseRoll + typeBonus

  if (immuneTypes.includes(type)) return 0
  if (vulnerableTypes.includes(type)) result *= 2
  if (resistTypes.includes(type) && !ignoreResistanceTypes.includes(type)) result = Math.floor(result / 2)
  return result
}
