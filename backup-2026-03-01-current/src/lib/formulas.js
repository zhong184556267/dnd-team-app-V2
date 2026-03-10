/**
 * 角色卡基本计算公式
 *
 * 属性调整值：Math.floor((属性值 - 10) / 2)
 * 经验与等级：输入单次获得经验 → 累加总经验 → 查表自动换算当前等级
 * AC = 10 + 护甲基础(类型) + 敏捷调整值(按护甲限制) + 盾牌值 + 其他装备 + Buff
 * 技能/豁免 = d20 + 属性调整值 + 熟练加值(等级查表) + 专精加成 + Buff
 * HP 当前 = 上限 + 临时 HP + Buff - 累计伤害
 */
import { CLASS_HIT_DICE, getHitDice } from '../data/classDatabase'
import { getLayerSlotData, useLayersForAC } from '../lib/equipmentLayers'

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
 * 从护甲附注字符串解析 AC 规则，用于自动计算 AC。
 * 支持格式：AC 14+敏捷(最大2)；AC 11+敏捷；AC 18；AC +2（盾牌）
 * @param {string} note - 附注（护甲等级 AC、力量、隐匿）
 * @returns {{ baseAC: number, addDex: boolean, dexCap: number | null } | { isShield: true, bonus: number } | null}
 */
export function parseArmorNote(note) {
  if (!note || typeof note !== 'string') return null
  const s = note.trim()
  if (!s) return null
  // 盾牌：AC +2
  const shieldMatch = s.match(/AC\s*\+\s*(\d+)/i)
  if (shieldMatch) {
    const bonus = parseInt(shieldMatch[1], 10)
    if (!Number.isNaN(bonus)) return { isShield: true, bonus }
  }
  // 护甲：AC 14+敏捷(最大2) 或 AC 14+敏捷（最大2）（全角括号）
  const armorDexCapMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷\s*[（(]\s*最大\s*(\d+)\s*[）)]/i)
  if (armorDexCapMatch) {
    const baseAC = parseInt(armorDexCapMatch[1], 10)
    const dexCap = parseInt(armorDexCapMatch[2], 10)
    if (!Number.isNaN(baseAC)) return { baseAC, addDex: true, dexCap: Number.isNaN(dexCap) ? null : dexCap }
  }
  // 护甲：AC 14+敏捷（无上限）
  const armorDexMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷/i)
  if (armorDexMatch) {
    const baseAC = parseInt(armorDexMatch[1], 10)
    if (!Number.isNaN(baseAC)) return { baseAC, addDex: true, dexCap: null }
  }
  // 护甲：仅 AC 14（重甲，不加敏捷）
  const armorFixedMatch = s.match(/AC\s*(\d+)(?:\s*[;；]|\s*$)/i)
  if (armorFixedMatch) {
    const baseAC = parseInt(armorFixedMatch[1], 10)
    if (!Number.isNaN(baseAC)) return { baseAC, addDex: false, dexCap: 0 }
  }
  return null
}

/**
 * 根据解析出的护甲规则与敏捷调整值计算护甲贡献的 AC
 */
export function computeACFromParsed(parsed, dexMod) {
  if (!parsed || parsed.isShield) return null
  const base = parsed.baseAC ?? 10
  const dexCap = parsed.dexCap
  const dexContrib = !parsed.addDex ? 0 : (dexCap === null ? dexMod : Math.min(dexMod, dexCap))
  return base + dexContrib
}

/**
 * 三层穿戴 AC 计算：Base(10) + Dex(受盔甲限制) + Max(内袍Base, 身体盔甲Base) 取代 10 + 外袍魔法加值 + 盾牌 + 其他 + Buff
 * 内袍/身体盔甲提供“基础防御”，取高者；敏捷上限由身体盔甲优先决定。
 */
function getACFromLayers(character, getLayerSlotData) {
  const abilities = character?.abilities ?? {}
  const equipment = character?.equipment ?? {}
  const dexMod = abilityModifier(abilities.dex ?? 10)

  const inner = getLayerSlotData(character, "innerRobe")
  const body = getLayerSlotData(character, "bodyArmor")
  const outer = getLayerSlotData(character, "outerRobe")
  const shieldData = getLayerSlotData(character, "shield")

  const innerParsed = inner.note ? parseArmorNote(inner.note) : null
  const bodyParsed = body.note ? parseArmorNote(body.note) : null
  const outerParsed = outer.note ? parseArmorNote(outer.note) : null
  const shieldParsed = shieldData.note ? parseArmorNote(shieldData.note) : null

  let innerBase = 10
  let innerDexCap = null
  if (innerParsed && !innerParsed.isShield) {
    innerBase = innerParsed.baseAC ?? 10
    innerDexCap = innerParsed.dexCap
  }

  let bodyBase = 0
  let bodyDexCap = 0
  if (bodyParsed && !bodyParsed.isShield) {
    bodyBase = bodyParsed.baseAC ?? 0
    bodyDexCap = bodyParsed.addDex ? (bodyParsed.dexCap != null ? bodyParsed.dexCap : 99) : 0
  }

  const effectiveBase = Math.max(innerBase, bodyBase) || 10
  const dexCap = bodyBase >= innerBase ? bodyDexCap : innerDexCap
  const dexContrib = dexCap === null ? dexMod : (dexCap >= 99 ? dexMod : Math.min(dexMod, dexCap))

  let outerMagic = Number(equipment.outerRobe?.magicACBonus) || 0
  if (!outerMagic && outerParsed && !outerParsed.isShield && outerParsed.baseAC != null && outerParsed.baseAC > 0) {
    outerMagic = outerParsed.baseAC
  }

  let shield = 0
  if (shieldParsed && shieldParsed.isShield) shield = shieldParsed.bonus || 2
  else if (equipment.useShield) shield = Number(equipment.shieldBonus) || 2

  const other = Number(equipment.otherAC) || 0
  const buffSum = (character?.buffs ?? []).reduce((s, b) => s + (Number(b.ac) || 0), 0)
  const total = effectiveBase + dexContrib + outerMagic + shield + other + buffSum
  return {
    total,
    base: effectiveBase,
    dexContrib,
    outerMagic,
    shield,
    other,
    buff: buffSum,
  }
}

/**
 * AC = 护甲基础 + 敏捷调整(按上限) + 盾牌 + 其他装备 + Buff
 * 若装备使用三层穿戴槽位则按 Max(内袍,身体盔甲)+外袍+盾牌 计算；否则用 armorNote / armorType
 */
export function getAC(character) {
  const abilities = character?.abilities ?? {}
  const equipment = character?.equipment ?? {}
  const dexMod = abilityModifier(abilities.dex ?? 10)

  if (useLayersForAC(equipment, character)) {
    const result = getACFromLayers(character, getLayerSlotData)
    return {
      ...result,
      base: result.base,
      dexContrib: result.dexContrib,
      shield: result.shield,
      other: result.other,
      buff: result.buff,
    }
  }

  const armorNote = equipment.armorNote != null ? String(equipment.armorNote).trim() : ''
  const parsed = armorNote ? parseArmorNote(armorNote) : null

  let base = 10
  let dexContrib = dexMod

  if (parsed && parsed.isShield) {
    base = 10
    dexContrib = dexMod
  } else if (parsed && !parsed.isShield) {
    base = parsed.baseAC ?? 10
    const dexCap = parsed.dexCap
    dexContrib = !parsed.addDex ? 0 : (dexCap === null ? dexMod : Math.min(dexMod, dexCap))
  } else {
    const armorKey = equipment.armorType || 'unarmored'
    const armor = getArmorInfo(armorKey)
    base = armor.base ?? 10
    const dexCap = armor.dexCap
    dexContrib = dexCap === null ? dexMod : dexCap === 0 ? 0 : Math.min(dexMod, dexCap)
  }

  let shield = equipment.useShield ? (Number(equipment.shieldBonus) || 2) : 0
  if (parsed && parsed.isShield) shield = parsed.bonus || 2
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

/** 职业生命骰由职业库统一提供，此处 re-export；calcMaxHP 使用 getHitDice 以支持别名 */
export { CLASS_HIT_DICE }

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

  const main = character?.['class']
  const mainLevel = Math.max(0, Math.min(20, Number(character?.classLevel) ?? 0))
  if (main && mainLevel > 0) {
    classes.push({ name: main, level: mainLevel })
  }

  const multiclass = character?.multiclass ?? []
  multiclass.forEach((m) => {
    const name = m?.['class']
    const level = Math.max(0, Math.min(20, Number(m?.level) ?? 0))
    if (name && level > 0) classes.push({ name, level })
  })

  const prestige = character?.prestige ?? []
  prestige.forEach((p) => {
    const name = p?.['class']
    const level = Math.max(0, Math.min(20, Number(p?.level) ?? 0))
    if (name && level > 0) classes.push({ name, level })
  })

  if (classes.length === 0) return 0

  let total = 0
  for (const { name, level } of classes) {
    const hd = getHitDice(name)
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
