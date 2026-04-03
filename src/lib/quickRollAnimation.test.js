import { describe, it, expect } from 'vitest'
import { buildQuickRollAnimation, expectedTotalFromQuickRollParts } from './quickRollAnimation'

describe('buildQuickRollAnimation（与底栏 parseFormula / 伤害投掷一致）', () => {
  it('普通武器伤害 1d8+5', () => {
    const r = buildQuickRollAnimation('1d8+5', 0, [6], false)
    expect(r).toEqual({ formula: '1d8+5', diceValues: [6] })
    expect(expectedTotalFromQuickRollParts('1d8+5', 0, [6], false)).toBe(11)
  })

  it('重击：骰子加倍、表达式 flat 只加一次', () => {
    const r = buildQuickRollAnimation('2d8+2', 0, [3, 4, 5, 6], true)
    expect(r?.formula).toBe('4d8+2')
    expect(expectedTotalFromQuickRollParts('2d8+2', 0, [3, 4, 5, 6], true)).toBe(20)
  })

  it('重击倍率 4：骰点数量与公式为 ×4', () => {
    const rolls = [2, 3, 4, 5, 6, 7, 1, 2]
    const r = buildQuickRollAnimation('2d6', 0, rolls, true, 4)
    expect(r?.formula).toBe('8d6')
    expect(expectedTotalFromQuickRollParts('2d6', 0, rolls, true, 4)).toBe(30)
  })

  it('法术伤害串 + 额外调整值', () => {
    const r = buildQuickRollAnimation('3d6', 4, [2, 3, 4], false)
    expect(r?.formula).toBe('3d6+4')
    expect(expectedTotalFromQuickRollParts('3d6', 4, [2, 3, 4], false)).toBe(13)
  })

  it('骰点数量不符时返回 null', () => {
    expect(buildQuickRollAnimation('1d20', 0, [1, 2], false)).toBeNull()
  })
})
