/**
 * 角色卡基本计算公式
 *
 * 属性调整值：Math.floor((属性值 - 10) / 2)
 * 经验与等级：输入单次获得经验 → 累加总经验 → 查表自动换算当前等级
 * AC = 10 + 护甲基础(类型) + 敏捷调整值(按护甲限制) + 盾牌值 + 其他装备 + Buff
 * 技能/豁免 = d20 + 属性调整值 + 熟练加值(等级查表) + 专精加成 + Buff
 * HP 当前 = 上限 + 临时 HP + Buff - 累计伤害
 */

/** 属性调整值：(属性值 - 10) / 2 向下取整 */
export function abilityModifier(value) {
  const v = Number(value)
  if (Number.isNaN(v)) return 0
  return Math.floor((v - 10) / 2)
}

/** D&D 5e 熟练加值：按等级查表 */
const PROFICIENCY_BY_LEVEL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]
export function proficiencyBonus(level) {
  const L = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)))
  return PROFICIENCY_BY_LEVEL[L - 1] ?? 2
}

/**
 * 护甲类型：base = 该护甲的 AC 基础（无甲 10，轻甲 11~12，中甲 12~15，重甲 14~18）；dexCap：敏捷调整值上限，null=不限制，0=不加敏捷。
 */
export const ARMOR_TYPES = {
  unarmored: { label: '无甲', base: 10, dexCap: null },
  padded: { label: '布甲', base: 11, dexCap: null },
  leather: { label: '皮甲', base: 11, dexCap: null },
  studded: { label: '镶钉皮甲', base: 12, dexCap: null },
  hide: { label: '兽皮甲', base: 12, dexCap: 2 },
  chainShirt: { label: '链甲衫', base: 13, dexCap: 2 },
  scale: { label: '鳞甲', base: 14, dexCap: 2 },
  breastplate: { label: '胸甲', base: 14, dexCap: 2 },
  halfPlate: { label: '半身板甲', base: 15, dexCap: 2 },
  ringMail: { label: '环甲', base: 14, dexCap: 0 },
  chainMail: { label: '链甲', base: 16, dexCap: 0 },
  splint: { label: '板条甲', base: 17, dexCap: 0 },
  plate: { label: '板甲', base: 18, dexCap: 0 },
}

export function getArmorInfo(armorTypeKey) {
  return ARMOR_TYPES[armorTypeKey] ?? ARMOR_TYPES.unarmored
}

/**
 * AC = 护甲基础 + 敏捷调整(按上限) + 盾牌 + 其他装备 + Buff
 */
export function getAC(character) {
  const abilities = character?.abilities ?? {}
  const equipment = character?.equipment ?? {}
  const dexMod = abilityModifier(abilities.dex ?? 10)
  const armorKey = equipment.armorType || 'unarmored'
  const armor = getArmorInfo(armorKey)
  const base = armor.base ?? 10
  const dexCap = armor.dexCap
  const dexContrib = dexCap === null ? dexMod : dexCap === 0 ? 0 : Math.min(dexMod, dexCap)
  const shield = equipment.useShield ? (Number(equipment.shieldBonus) || 2) : 0
  const other = Number(equipment.otherAC) || 0
  const buffSum = (character?.buffs ?? []).reduce((s, b) => s + (Number(b.ac) || 0), 0)
  const total = base + dexContrib + shield + other + buffSum
  return {
    total,
    base,
    dexContrib,
    shield,
    other,
    buff: buffSum,
  }
}

/**
 * D&D 5e 职业生命骰：职业名 -> 骰面 (d6=6, d8=8, d10=10, d12=12)
 */
export const CLASS_HIT_DICE = {
  野蛮人: 12,
  吟游诗人: 8,
  牧师: 8,
  德鲁伊: 8,
  战士: 10,
  武僧: 8,
  圣武士: 10,
  游侠: 10,
  游荡者: 8,
  术士: 6,
  邪术师: 8,
  法师: 6,
  // 繁星进阶职业
  圣魂之刃: 10,
  蓝御法师: 6,
}

/** 骰面对应的「每级平均」：(HD+1)/2 向上取整，PHB 标准 */
function hitDieAverage(hd) {
  return Math.ceil((hd + 1) / 2)
}

/**
 * D&D 5e 规则：根据职业与等级自动计算最大 HP
 * 1 级：该职业 HD 满值 + CON 调整
 * 2 级起：每级 (HD 平均 + CON 调整)
 * 兼职：每个职业的首级取满值，后续取平均
 */
export function calcMaxHP(character) {
  const conMod = abilityModifier(character?.abilities?.con ?? 10)
  const classes = []

  const main = character?.class
  const mainLevel = Math.max(0, Math.min(20, Number(character?.classLevel) ?? 0))
  if (main && mainLevel > 0) {
    classes.push({ name: main, level: mainLevel })
  }

  const multiclass = character?.multiclass ?? []
  multiclass.forEach((m) => {
    const name = m?.class
    const level = Math.max(0, Math.min(20, Number(m?.level) ?? 0))
    if (name && level > 0) classes.push({ name, level })
  })

  const prestige = character?.prestige ?? []
  prestige.forEach((p) => {
    const name = p?.class
    const level = Math.max(0, Math.min(20, Number(p?.level) ?? 0))
    if (name && level > 0) classes.push({ name, level })
  })

  if (classes.length === 0) return 0

  let total = 0
  for (const { name, level } of classes) {
    const hd = CLASS_HIT_DICE[name] ?? 8
    const avg = hitDieAverage(hd)
    total += hd + conMod
    total += (level - 1) * (avg + conMod)
  }
  return Math.max(1, total)
}

/**
 * HP 当前 = 上限 + 临时 + Buff - 累计伤害。
 * Buff 对 HP 的加成可在 buffs[].hp 中记录。
 */
export function getHPBuffSum(character) {
  return (character?.buffs ?? []).reduce((s, b) => s + (Number(b.hp) || 0), 0)
}
