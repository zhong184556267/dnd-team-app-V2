/**
 * 灵崩（psychic_collapse）：施法前 DC16 体质豁免；失败则法术失败仍耗环位；成功则记录「下回合回响」。
 */
import { abilityModifier, proficiencyBonus } from './formulas'

export const PSYCHIC_COLLAPSE_DC = 16
/** 与 buffTypes CONDITION_OPTIONS 中 value 一致 */
export const CONDITION_PSYCHIC_COLLAPSE = 'psychic_collapse'

function mergeSaveAndConcentrationAdvantage(saveAdv, concentrationAdv) {
  const s = saveAdv === 'advantage' ? 'advantage' : saveAdv === 'disadvantage' ? 'disadvantage' : 'normal'
  const c = concentrationAdv === 'advantage' ? 'advantage' : concentrationAdv === 'disadvantage' ? 'disadvantage' : 'normal'
  if (s === 'advantage' && c === 'disadvantage') return 'normal'
  if (s === 'disadvantage' && c === 'advantage') return 'normal'
  if (s === 'disadvantage' || c === 'disadvantage') return 'disadvantage'
  if (s === 'advantage' || c === 'advantage') return 'advantage'
  return 'normal'
}

function rollD20WithMode(mode) {
  const roll = () => Math.floor(Math.random() * 20) + 1
  if (mode === 'advantage') {
    const a = roll()
    const b = roll()
    return { result: Math.max(a, b), rolls: [a, b], mode: 'advantage' }
  }
  if (mode === 'disadvantage') {
    const a = roll()
    const b = roll()
    return { result: Math.min(a, b), rolls: [a, b], mode: 'disadvantage' }
  }
  const r = roll()
  return { result: r, rolls: [r], mode: 'normal' }
}

/**
 * 灵崩施法用体质豁免加值（含豁免熟练、BUFF 体质豁免、专注加值、力竭 D20 减值）
 */
export function getPsychicCollapseConSaveBonus(char, buffStats, level) {
  const L = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)))
  const profBonus = proficiencyBonus(L)
  const abilities = buffStats?.abilities ?? char?.abilities ?? {}
  const mod = abilityModifier(abilities.con ?? 10)
  const saves = char?.savingThrows ?? {}
  const profPart = saves.con ? profBonus : 0
  const buffPart = buffStats?.saveBonusPerAbility?.con ?? 0
  const conc = Number(buffStats?.concentrationBonus) || 0
  const exhaust = Number(buffStats?.d20ExhaustionPenalty) || 0
  return mod + profPart + buffPart + conc + exhaust
}

/**
 * 投掷灵崩施法前的体质豁免（DC16），与属性页「体质豁免」检定规则一致（全豁免优劣势 + 专注优劣势合并）
 */
export function rollPsychicCollapseCastSave(char, buffStats, level) {
  const modifier = getPsychicCollapseConSaveBonus(char, buffStats, level)
  const advMode = mergeSaveAndConcentrationAdvantage(
    buffStats?.advantage?.save === 'advantage'
      ? 'advantage'
      : buffStats?.advantage?.save === 'disadvantage'
        ? 'disadvantage'
        : 'normal',
    buffStats?.concentrationAdvantage === 'advantage'
      ? 'advantage'
      : buffStats?.concentrationAdvantage === 'disadvantage'
        ? 'disadvantage'
        : 'normal',
  )
  const { result: d20Result, rolls, mode: rollMode } = rollD20WithMode(advMode)
  const total = d20Result + modifier
  const success = total >= PSYCHIC_COLLAPSE_DC
  return {
    success,
    d20Result,
    rolls,
    rollMode,
    modifier,
    total,
    dc: PSYCHIC_COLLAPSE_DC,
  }
}

export function characterHasPsychicCollapse(char) {
  return Array.isArray(char?.conditions) && char.conditions.includes(CONDITION_PSYCHIC_COLLAPSE)
}
