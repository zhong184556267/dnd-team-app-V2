/**
 * 角色卡基本计算公式
 *
 * 属性调整值：Math.floor((属性值 - 10) / 2)
 * 经验与等级：输入单次获得经验 → 累加总经验 → 查表自动换算当前等级
 * AC = 基础AC + 敏调 + 盾AC + 盾牌增强加值 + 盔甲增强加值 + BUFF
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
  // 先匹配护甲基础 AC（避免附注中「AC 11+敏捷；…；AC+2」被误判为盾牌）
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
  // 盾牌：AC +2（仅当未匹配到护甲基础时）
  const shieldMatch = s.match(/AC\s*\+\s*(\d+)/i)
  if (shieldMatch) {
    const bonus = parseInt(shieldMatch[1], 10)
    if (!Number.isNaN(bonus)) return { isShield: true, bonus }
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
 * 三层穿戴 AC 计算：AC = 基础AC + 敏调 + 盾AC + 盾牌增强加值 + 盔甲增强加值 + BUFF（+ 可选外袍/其他）
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
  const bodyType = String(body.entry?.类型 ?? '').trim()
  if (bodyParsed && !bodyParsed.isShield) {
    // Project rule: clothing itself provides no base AC and no dex mode changes.
    // Any AC from clothing should come from enchantment (magicBonus/effects) only.
    if (bodyType !== '衣服') {
      bodyBase = bodyParsed.baseAC ?? 0
      bodyDexCap = bodyParsed.addDex ? (bodyParsed.dexCap != null ? bodyParsed.dexCap : 99) : 0
    }
  }

  const effectiveBase = Math.max(innerBase, bodyBase) || 10
  const dexCap = bodyBase >= innerBase ? bodyDexCap : innerDexCap
  const dexContrib = dexCap === null ? dexMod : (dexCap >= 99 ? dexMod : Math.min(dexMod, dexCap))

  const armorMagic = Number(body.entry?.magicBonus) || 0
  const shieldEnabled = equipment.useShield !== false
  let shieldBase = 0
  if (shieldEnabled) {
    if (shieldParsed && shieldParsed.isShield) shieldBase = shieldParsed.bonus || 2
    else if (equipment.useShield) shieldBase = Number(equipment.shieldBonus) || 2
  }
  const shieldMagic = shieldEnabled ? (Number(shieldData.entry?.magicBonus) || 0) : 0

  let outerMagic = Number(equipment.outerRobe?.magicACBonus) || 0
  if (!outerMagic && outerParsed && !outerParsed.isShield && outerParsed.baseAC != null && outerParsed.baseAC > 0) {
    outerMagic = outerParsed.baseAC
  }
  const other = Number(equipment.otherAC) || 0
  const buffSum = (character?.buffs ?? [])
    .filter((b) => b?.enabled !== false)
    .reduce((s, b) => s + (Number(b?.ac) || 0), 0)

  const total = effectiveBase + dexContrib + shieldBase + shieldMagic + armorMagic + outerMagic + other + buffSum
  return {
    total,
    base: effectiveBase,
    dexContrib,
    shieldBase,
    shieldMagic,
    armorMagic,
    outerMagic,
    other,
    buff: buffSum,
  }
}

/** 职业 AC 计算方式（角色字段 acCalculationMode） */
export const AC_CALCULATION_MODES = {
  equipment: { label: '按装备计算' },
  druid_wild: { label: '荒野变形', requiresClass: '德鲁伊', formula: '13+感知调整值' },
  monk_unarmored: { label: '武僧无甲', requiresClass: '武僧', formula: '10+感知调整值+敏捷调整值' },
  sorcerer_draconic: { label: '龙族体魄', requiresClass: '术士', formula: '10+魅力调整值+敏捷调整值' },
  barbarian_unarmored: { label: '蛮人无甲', requiresClass: '野蛮人', formula: '10+体质调整值+敏捷调整值' },
}

const CLASS_FEATURE_AC_MODE_KEYS = ['druid_wild', 'monk_unarmored', 'sorcerer_draconic', 'barbarian_unarmored']

/** 起始职业、兼职、进阶职业中是否包含该职业名 */
export function characterHasClassName(char, className) {
  if (!className || !char) return false
  if (char['class'] === className) return true
  if (Array.isArray(char.multiclass) && char.multiclass.some((m) => m && m['class'] === className)) return true
  if (Array.isArray(char.prestige) && char.prestige.some((p) => p && p['class'] === className)) return true
  return false
}

/** 当前实际生效的 AC 模式（职业不符或未知时回退按装备） */
export function getEffectiveACCalculationMode(char) {
  const raw = char?.acCalculationMode
  if (raw == null || raw === '' || raw === 'equipment') return 'equipment'
  const def = AC_CALCULATION_MODES[raw]
  if (!def || !def.requiresClass) return 'equipment'
  return characterHasClassName(char, def.requiresClass) ? raw : 'equipment'
}

/** 战斗面板下拉：按装备 + 当前角色可用的职业公式 */
export function getACModeOptionsForCharacter(char) {
  const opts = [{ value: 'equipment', label: '按装备计算' }]
  for (const key of CLASS_FEATURE_AC_MODE_KEYS) {
    const def = AC_CALCULATION_MODES[key]
    if (def?.requiresClass && characterHasClassName(char, def.requiresClass)) {
      opts.push({ value: key, label: def.label })
    }
  }
  return opts
}

/** 职业特性基准 AC（不含盾/其它加值）；mode 须为 CLASS_FEATURE_AC_MODE_KEYS 之一 */
export function getClassFeatureAC(character, mode) {
  const abilities = character?.abilities ?? {}
  const dex = abilityModifier(abilities.dex ?? 10)
  const wis = abilityModifier(abilities.wis ?? 10)
  const con = abilityModifier(abilities.con ?? 10)
  const cha = abilityModifier(abilities.cha ?? 10)
  switch (mode) {
    case 'druid_wild':
      return 13 + wis
    case 'monk_unarmored':
      return 10 + wis + dex
    case 'sorcerer_draconic':
      return 10 + cha + dex
    case 'barbarian_unarmored':
      return 10 + con + dex
    default:
      return null
  }
}

/**
 * 用职业特性替换「护甲+敏调」部分，保留盾牌、外袍、其它与旧版 buff.ac
 * @param {boolean} includeBodyArmorMagic - 非三层槽位时保留装备上的盔甲增强（如护腕）；三层槽位时身体护甲增强不计入无甲特性
 */
function applyClassFeatureACOverlay(character, mode, components, includeBodyArmorMagic) {
  if (mode === 'equipment') {
    return {
      ...components,
      acCalculationMode: 'equipment',
      acFormulaNote: '',
    }
  }
  const featureBase = getClassFeatureAC(character, mode)
  if (featureBase == null) {
    return { ...components, acCalculationMode: 'equipment', acFormulaNote: '' }
  }
  const am = includeBodyArmorMagic ? (Number(components.armorMagic) || 0) : 0
  const total =
    featureBase +
    (Number(components.shieldBase) || 0) +
    (Number(components.shieldMagic) || 0) +
    am +
    (Number(components.outerMagic) || 0) +
    (Number(components.other) || 0) +
    (Number(components.buff) || 0)
  const def = AC_CALCULATION_MODES[mode]
  return {
    ...components,
    total,
    base: featureBase,
    dexContrib: 0,
    armorMagic: includeBodyArmorMagic ? components.armorMagic : 0,
    acCalculationMode: mode,
    acFormulaNote: def?.formula ?? '',
  }
}

/**
 * AC = 基础AC + 敏调 + 盾AC + 盾牌增强加值 + 盔甲增强加值 + BUFF
 * 若装备使用三层穿戴槽位则按上述公式从槽位与背包条目取数；否则用 armorNote / armorType
 * 可选 acCalculationMode：德鲁伊荒野变形 / 武僧无甲 / 术士龙族体魄 / 野蛮人无甲（替换护甲基准，盾与其它加值仍累加）
 */
export function getAC(character) {
  const abilities = character?.abilities ?? {}
  const equipment = character?.equipment ?? {}
  const dexMod = abilityModifier(abilities.dex ?? 10)
  const effectiveMode = getEffectiveACCalculationMode(character)

  if (useLayersForAC(equipment, character)) {
    const result = getACFromLayers(character, getLayerSlotData)
    const normalized = {
      ...result,
      shield: result.shieldBase,
      shieldBase: result.shieldBase,
      shieldMagic: result.shieldMagic,
      armorMagic: result.armorMagic,
      other: result.other,
      buff: result.buff,
    }
    return applyClassFeatureACOverlay(character, effectiveMode, normalized, false)
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

  const shieldBase = equipment.useShield ? (Number(equipment.shieldBonus) || 2) : (parsed && parsed.isShield ? (parsed.bonus || 2) : 0)
  const shieldMagic = Number(equipment.shieldMagicBonus) || 0
  const armorMagic = Number(equipment.armorMagicBonus) || 0
  const other = Number(equipment.otherAC) || 0
  const buffSum = (character?.buffs ?? [])
    .filter((b) => b?.enabled !== false)
    .reduce((s, b) => s + (Number(b?.ac) || 0), 0)
  const total = base + dexContrib + shieldBase + shieldMagic + armorMagic + other + buffSum
  const legacy = {
    total,
    base,
    dexContrib,
    shield: shieldBase,
    shieldBase,
    shieldMagic,
    armorMagic,
    other,
    buff: buffSum,
  }
  return applyClassFeatureACOverlay(character, effectiveMode, legacy, true)
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
