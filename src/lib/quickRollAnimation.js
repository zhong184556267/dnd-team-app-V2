import { parseCombatDiceExpression } from '../data/weaponDatabase'

/**
 * 与底栏 parseFormula 对齐，供 dnd-external-roll 触发 ThreeDiceOverlay（点数须与已掷结果一致）。
 */
export function buildQuickRollAnimation(diceExpr, extraMod, rolls, isCrit, critDiceMultiplier = 2) {
  const p = parseCombatDiceExpression(diceExpr)
  if (!p || !Array.isArray(rolls)) return null
  const mult = isCrit ? Math.max(2, Number(critDiceMultiplier) || 2) : 1
  const effCount = p.count * mult
  if (rolls.length !== effCount) return null
  const mod = p.flatMod + (Number(extraMod) || 0)
  const body = `${effCount}d${p.sides}`
  const formula = mod !== 0 ? `${body}${mod >= 0 ? '+' : ''}${mod}` : body
  return { formula, diceValues: rolls.map((n) => Number(n)) }
}

/** 单元测试用：根据动画公式与骰点计算期望总和（须与 CombatStatus 投掷逻辑一致） */
export function expectedTotalFromQuickRollParts(diceExpr, extraMod, rolls, isCrit, critDiceMultiplier = 2) {
  const anim = buildQuickRollAnimation(diceExpr, extraMod, rolls, isCrit, critDiceMultiplier)
  if (!anim) return null
  const sumDice = anim.diceValues.reduce((s, n) => s + n, 0)
  const p = parseCombatDiceExpression(diceExpr)
  if (!p) return null
  const flatOnce = p.flatMod + (Number(extraMod) || 0)
  return sumDice + flatOnce
}
