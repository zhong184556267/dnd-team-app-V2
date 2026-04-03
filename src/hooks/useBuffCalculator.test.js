import { describe, it, expect } from 'vitest'
import {
  computeBuffStats,
  getCritDamageDiceMultiplierFromItemEntry,
  getCritThreatMinNaturalFromItemEntry,
  sumWeaponCategoryAttackDamageBonus,
} from './useBuffCalculator'

const baseChar = () => ({
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  level: 1,
  xp: 0,
  buffs: [],
  inventory: [],
  equipment: {},
})

describe('单件物品暴击附魔（与其它已装备武器互不串用）', () => {
  it('无 effects 时伤害骰倍数为规则默认 2', () => {
    expect(getCritDamageDiceMultiplierFromItemEntry(null)).toBe(2)
    expect(getCritDamageDiceMultiplierFromItemEntry({})).toBe(2)
  })

  it('仅读取该 entry 上的暴击×', () => {
    expect(getCritDamageDiceMultiplierFromItemEntry({ effects: [{ effectType: 'crit_extra_dice', value: 4 }] })).toBe(4)
  })

  it('同一件物品多条暴击×取最大', () => {
    expect(
      getCritDamageDiceMultiplierFromItemEntry({
        effects: [
          { effectType: 'crit_extra_dice', value: 3 },
          { effectType: 'crit_extra_dice', value: 4 },
        ],
      }),
    ).toBe(4)
  })

  it('暴击范围扩大仅解析该物品', () => {
    expect(getCritThreatMinNaturalFromItemEntry({ effects: [{ effectType: 'crit_range_expand', value: '18-20' }] })).toBe(18)
    expect(getCritThreatMinNaturalFromItemEntry(null)).toBe(20)
  })
})

describe('命中/伤害加值：全局与分武器', () => {
  it('全局仍计入近战/远程通用加值', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [{ effectType: 'attack_damage_bonus', value: { val: 4, advantage: '' } }],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.meleeAttackBonus).toBe(4)
    expect(s.rangedAttackBonus).toBe(4)
    expect(s.meleeDamageBonus).toBe(4)
    expect(s.rangedDamageBonus).toBe(4)
    expect(s.weaponCategoryAttackDamageBonuses).toEqual([])
  })

  it('武器类别：不计入全局合计，写入 weaponCategoryAttackDamageBonuses', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [
          {
            effectType: 'attack_damage_bonus',
            value: { val: 3, advantage: '', weaponScope: 'weapon_category', weaponCategories: ['枪械'] },
          },
        ],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.meleeAttackBonus).toBe(0)
    expect(s.rangedAttackBonus).toBe(0)
    expect(s.weaponCategoryAttackDamageBonuses).toEqual([
      { val: 3, weaponCategories: ['枪械'], advantage: '' },
    ])
  })

  it('sumWeaponCategoryAttackDamageBonus 按 proto.类型 匹配', () => {
    const entries = [{ val: 5, weaponCategories: ['枪械'], advantage: '' }]
    expect(sumWeaponCategoryAttackDamageBonus(entries, { 类型: '枪械' })).toBe(5)
    expect(sumWeaponCategoryAttackDamageBonus(entries, { 类型: '近战武器' })).toBe(0)
    expect(sumWeaponCategoryAttackDamageBonus(entries, null)).toBe(0)
  })

  it('sumWeaponCategoryAttackDamageBonus 按 proto.类别 匹配具体武器', () => {
    const entries = [{ val: 2, weaponCategories: ['长剑'], advantage: '' }]
    expect(sumWeaponCategoryAttackDamageBonus(entries, { 类型: '近战武器', 类别: '长剑' })).toBe(2)
    expect(sumWeaponCategoryAttackDamageBonus(entries, { 类型: '近战武器', 类别: '匕首' })).toBe(0)
  })

  it('分武器 categoryRows：每种武器单独加值并分别匹配', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [
          {
            effectType: 'attack_damage_bonus',
            value: {
              weaponScope: 'weapon_category',
              advantage: '',
              categoryRows: [
                { key: '长剑', val: 2 },
                { key: '手铳', val: 4 },
              ],
            },
          },
        ],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.weaponCategoryAttackDamageBonuses).toEqual([
      { categoryRows: [{ key: '长剑', val: 2 }, { key: '手铳', val: 4 }], advantage: '' },
    ])
    expect(sumWeaponCategoryAttackDamageBonus(s.weaponCategoryAttackDamageBonuses, { 类型: '近战武器', 类别: '长剑' })).toBe(2)
    expect(sumWeaponCategoryAttackDamageBonus(s.weaponCategoryAttackDamageBonuses, { 类型: '枪械', 类别: '手铳' })).toBe(4)
    expect(sumWeaponCategoryAttackDamageBonus(s.weaponCategoryAttackDamageBonuses, { 类型: '近战武器', 类别: '匕首' })).toBe(0)
  })

  it('全体加值与分武器行可同时存在', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [
          {
            effectType: 'attack_damage_bonus',
            value: { val: 3, advantage: '', categoryRows: [{ key: '长剑', val: 2 }] },
          },
        ],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.meleeAttackBonus).toBe(3)
    expect(s.rangedAttackBonus).toBe(3)
    expect(s.meleeDamageBonus).toBe(3)
    expect(s.weaponCategoryAttackDamageBonuses).toEqual([
      { categoryRows: [{ key: '长剑', val: 2 }], advantage: '' },
    ])
    expect(sumWeaponCategoryAttackDamageBonus(s.weaponCategoryAttackDamageBonuses, { 类型: '近战武器', 类别: '长剑' })).toBe(2)
    expect(sumWeaponCategoryAttackDamageBonus(s.weaponCategoryAttackDamageBonuses, { 类型: '近战武器', 类别: '匕首' })).toBe(0)
  })
})
