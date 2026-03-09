/**
 * D&D 动态 BUFF 系统 - 数据字典与分类逻辑
 * 二级联动：大类 -> 具体效果
 */

/** 伤害类型选项 */
export const DAMAGE_TYPES = [
  { value: 'bludgeoning', label: '钝击' },
  { value: 'piercing', label: '穿刺' },
  { value: 'slashing', label: '挥砍' },
  { value: 'fire', label: '火焰' },
  { value: 'cold', label: '冷冻' },
  { value: 'lightning', label: '闪电' },
  { value: 'acid', label: '强酸' },
  { value: 'thunder', label: '雷鸣' },
  { value: 'force', label: '力场' },
  { value: 'radiant', label: '辐射' },
  { value: 'necrotic', label: '死灵' },
  { value: 'psychic', label: '心灵' },
  { value: 'poison', label: '毒素' },
]

/** 状态免疫选项 */
export const CONDITION_OPTIONS = [
  { value: 'charmed', label: '魅惑' },
  { value: 'frightened', label: '恐惧' },
  { value: 'poisoned', label: '中毒' },
  { value: 'blinded', label: '目盲' },
  { value: 'deafened', label: '耳聋' },
  { value: 'paralyzed', label: '麻痹' },
  { value: 'stunned', label: '震慑' },
  { value: 'unconscious', label: '昏迷' },
  { value: 'psychic_collapse', label: '灵崩' },
  { value: 'exhaustion', label: '力竭' },
]

/** 属性键 */
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/** 属性键 -> 中文名（用于列表展示，不显示英文） */
export const ABILITY_NAMES_ZH = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

/**
 * BUFF 效果类型 - 二级联动
 * 第一级：大类 (category)
 * 第二级：具体效果 (key, label, dataType, needsSubSelect)
 */
export const BUFF_TYPES = {
  attack: {
    label: '攻击与检定',
    color: 'red', // 左边框颜色
    effects: [
      { key: 'attack_melee', label: '近战攻击', dataType: 'number' },
      { key: 'attack_ranged', label: '远程攻击', dataType: 'number' },
      { key: 'attack_all', label: '通用攻击', dataType: 'number' },
      { key: 'adv_melee', label: '近战攻击优势', dataType: 'boolean' },
      { key: 'adv_ranged', label: '远程攻击优势', dataType: 'boolean' },
      { key: 'adv_all_attack', label: '所有攻击优势', dataType: 'boolean' },
      { key: 'adv_save', label: '豁免检定优势', dataType: 'boolean' },
      { key: 'adv_skill', label: '技能检定优势', dataType: 'boolean' },
      { key: 'disadv_all', label: '通用劣势', dataType: 'boolean' },
      { key: 'custom_check', label: '📝 自由填写 (检定)', dataType: 'text' },
    ],
  },
  damage: {
    label: '伤害与抗性',
    color: 'orange',
    effects: [
      { key: 'dmg_bonus_melee', label: '近战伤害', dataType: 'number' },
      { key: 'dmg_bonus_ranged', label: '远程伤害', dataType: 'number' },
      { key: 'dmg_bonus_all', label: '通用伤害', dataType: 'number' },
      { key: 'dmg_type_specific', label: '特定类型伤害', dataType: 'object', subSelect: 'damageType' },
      { key: 'resist_type', label: '伤害抗性', dataType: 'array', subSelect: 'damageType' },
      { key: 'immune_type', label: '伤害免疫', dataType: 'array', subSelect: 'damageType' },
      { key: 'vulnerable_type', label: '伤害易伤', dataType: 'array', subSelect: 'damageType' },
      { key: 'custom_dmg', label: '📝 自由填写 (伤害)', dataType: 'text' },
    ],
  },
  attribute: {
    label: '属性与能力',
    color: 'gold',
    effects: [
      { key: 'ability_score', label: '属性调整', dataType: 'object', subSelect: 'abilityScores' },
      { key: 'ability_override', label: '属性值上限', dataType: 'object', subSelect: 'abilityScores' },
      { key: 'extra_attunement_slots', label: '额外同调位', dataType: 'number' },
      { key: 'ac_bonus', label: 'AC', dataType: 'number' },
      { key: 'speed_bonus', label: '移动速度', dataType: 'number' },
      { key: 'reach_bonus', label: '攻击距离', dataType: 'number' },
      { key: 'init_bonus', label: '先攻', dataType: 'number' },
      { key: 'save_dc_bonus', label: '豁免 DC', dataType: 'number' },
      { key: 'proficiency_override', label: '熟练加值覆写', dataType: 'number' },
      { key: 'custom_stat', label: '📝 自由填写 (属性)', dataType: 'text' },
    ],
  },
  condition: {
    label: '生命与状态',
    color: 'purple',
    effects: [
      { key: 'max_hp_bonus', label: '生命上限', dataType: 'number' },
      { key: 'regeneration', label: '再生', dataType: 'number' },
      { key: 'condition_immunity', label: '状态免疫', dataType: 'array', subSelect: 'condition' },
      { key: 'custom_condition', label: '📝 自由填写 (状态)', dataType: 'text' },
    ],
  },
}

/** 根据伤害类型 value 返回中文 label */
export function getDamageTypeLabel(value) {
  const v = String(value || '').toLowerCase()
  const found = DAMAGE_TYPES.find((d) => d.value === v)
  return found ? found.label : value
}

/** 根据状态 value 返回中文 label */
export function getConditionLabel(value) {
  const v = String(value || '')
  const found = CONDITION_OPTIONS.find((c) => c.value === v)
  return found ? found.label : value
}

/** 已移除的效果类型（仅用于显示旧数据，不可新增） */
const DEPRECATED_EFFECTS = { temp_hp: { key: 'temp_hp', label: '临时生命值（已移至血条）', dataType: 'number' } }

/** 扁平化：所有 effect key -> { category, effect } */
export function getEffectInfo(key) {
  if (DEPRECATED_EFFECTS[key]) {
    return { category: 'condition', effect: DEPRECATED_EFFECTS[key] }
  }
  for (const [cat, data] of Object.entries(BUFF_TYPES)) {
    const effect = data.effects.find((e) => e.key === key)
    if (effect) return { category: cat, ...data, effect }
  }
  return null
}

/** 获取大类列表（用于第一级下拉） */
export function getCategories() {
  return Object.entries(BUFF_TYPES).map(([key, val]) => ({ key, label: val.label }))
}
