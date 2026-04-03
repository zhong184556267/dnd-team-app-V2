import { describe, it, expect } from 'vitest'
import { computeBuffStats, calculateDamage } from '../hooks/useBuffCalculator'
import { getMergedBuffsForCalculator, getEffectsFromItem } from './effects/effectMapping'
import { BUFF_EFFECT_KEY_RUNTIME, getAllVisibleBuffEffectKeys } from './buffEffectRegistry'

const baseChar = () => ({
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  level: 1,
  xp: 0,
  buffs: [],
  inventory: [],
  equipment: {},
})

describe('BUFF 效果类型登记：每个可见效果均有 calculator / metadata 分类', () => {
  it('登记完整', () => {
    const keys = getAllVisibleBuffEffectKeys()
    for (const key of keys) {
      expect(BUFF_EFFECT_KEY_RUNTIME[key], `未登记: ${key}`).toMatch(/^(calculator|metadata)$/)
    }
    for (const k of Object.keys(BUFF_EFFECT_KEY_RUNTIME)) {
      expect(keys.includes(k), `登记多余或隐藏键: ${k}`).toBe(true)
    }
  })
})

describe('computeBuffStats：代表性效果可改变输出', () => {
  it('BUFF 栏：AC +2', () => {
    const c = baseChar()
    const buffs = [{ id: '1', source: 't', effects: [{ effectType: 'ac_bonus', value: 2 }], enabled: true }]
    const s = computeBuffStats(c, buffs)
    expect(s.acBonus).toBe(2)
  })

  it('BUFF 栏：力量 +2（属性调整）', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [{ effectType: 'ability_score', value: { str: 2, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } }],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.abilities.str).toBe(12)
  })

  it('BUFF 栏：火焰抗性', () => {
    const c = baseChar()
    const buffs = [
      { id: '1', source: 't', effects: [{ effectType: 'resist_type', value: ['火焰'] }], enabled: true },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.resistTypes).toContain('fire')
  })

  it('合并装备附魔：已装备物品 effects → 计入 DC', () => {
    const ringId = 'inv-ring-e2e'
    const c = {
      ...baseChar(),
      inventory: [
        {
          id: ringId,
          name: '测试戒指',
          effects: [{ effectType: 'save_dc_bonus', value: 3 }],
        },
      ],
      equippedHeld: [{ inventoryId: ringId }, { inventoryId: null }],
      equippedWorn: [],
    }
    const merged = getMergedBuffsForCalculator(c)
    const s = computeBuffStats(c, merged)
    expect(s.saveDcBonus).toBe(3)
  })

  it('物品 legacy：magicBonus → 近战命中', () => {
    const fx = getEffectsFromItem({ id: 'x', name: 'legacy', magicBonus: 2 })
    expect(fx.some((e) => e.effectType === 'attack_melee' && e.value === 2)).toBe(true)
    const c = baseChar()
    const s = computeBuffStats(c, [{ id: 'i', source: 'x', effects: fx, enabled: true }])
    expect(s.meleeAttackBonus).toBe(2)
  })

  it('custom_condition 不参与数值', () => {
    const c = baseChar()
    const s = computeBuffStats(c, [
      { id: '1', source: 'x', effects: [{ effectType: 'custom_condition', value: '任意描述' }], enabled: true },
    ])
    expect(s.acBonus).toBe(0)
    expect(s.meleeAttackBonus).toBe(0)
  })
})

describe('calculateDamage：抗性 / 减免 / 穿透', () => {
  it('火焰抗性减半', () => {
    const buffStats = {
      resistTypes: ['fire'],
      immuneTypes: [],
      vulnerableTypes: [],
      dmgTypeBonus: {},
      ignoreResistanceTypes: [],
      damageReduction: 0,
    }
    expect(calculateDamage(10, '火焰', buffStats)).toBe(5)
  })

  it('伤害减免 3', () => {
    const buffStats = {
      resistTypes: [],
      immuneTypes: [],
      vulnerableTypes: [],
      dmgTypeBonus: {},
      ignoreResistanceTypes: [],
      damageReduction: 3,
    }
    expect(calculateDamage(10, '火焰', buffStats)).toBe(7)
  })
})
