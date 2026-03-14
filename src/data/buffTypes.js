/**
 * D&D 动态 BUFF 系统 - 数据字典与分类逻辑
 * 二级联动：大类 -> 具体效果
 */

/** 伤害类型选项（统一简称，无英文展示；value 为程序用键） */
export const DAMAGE_TYPES = [
  { value: 'acid', label: '强酸', desc: '腐蚀性液体，消化酶' },
  { value: 'bludgeoning', label: '钝击', desc: '钝器，压紧，坠落' },
  { value: 'cold', label: '寒冷', desc: '冰水，寒风' },
  { value: 'fire', label: '火焰', desc: '烈焰，难以忍受的高温' },
  { value: 'force', label: '力场', desc: '纯粹的魔法能量' },
  { value: 'lightning', label: '闪电', desc: '高压电' },
  { value: 'necrotic', label: '暗蚀', desc: '窃取生命的能量' },
  { value: 'piercing', label: '穿刺', desc: '獠牙，刺穿' },
  { value: 'poison', label: '毒素', desc: '毒性气体，蛇毒' },
  { value: 'psychic', label: '心灵', desc: '摧毁心灵的能量' },
  { value: 'radiant', label: '光耀', desc: '神圣能量，炽热的辐射' },
  { value: 'slashing', label: '挥砍', desc: '爪子，切割用具' },
  { value: 'thunder', label: '雷鸣', desc: '足以形成冲击波的响声' },
  { value: 'penetrate', label: '贯通', desc: '子弹造成的伤害可穿透魔法能力' },
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

/** 状态效果文案（规则摘要，选择状态后显示） */
export const CONDITION_DESCRIPTIONS = {
  charmed: '无法对施法者进行攻击或施以有害效果，施法者对你进行社交检定具有优势。',
  frightened: '进行检定与攻击检定时具有劣势，且无法主动靠近恐惧源。',
  poisoned: '攻击检定与属性检定具有劣势。',
  blinded: '无法视物，视线内攻击具有劣势、被攻击具有优势。',
  deafened: '无法听见。',
  paralyzed: '无法行动或说话，近战攻击命中则暴击，对你攻击具有优势。',
  stunned: '无法行动、移动、说话，对你攻击具有优势。',
  unconscious: '倒地、无法行动与反应，对你攻击具有优势且命中即暴击。',
  psychic_collapse: '灵崩：精神崩溃，无法正常行动。',
}

/** 力竭等级文案 */
export const EXHAUSTION_DESCRIPTIONS = {
  1: '劣势于属性检定',
  2: '速度减半',
  3: '攻击检定与豁免检定劣势',
  4: '生命值上限减半',
  5: '速度降为 0',
  6: '死亡',
}

/** 属性键 */
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/** 属性键 -> 中文名（用于列表展示，不显示英文） */
export const ABILITY_NAMES_ZH = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

/** 伤害穿透特性 - 忽略伤害抗性可选类型（与 DAMAGE_TYPES 简称一致） */
export const PIERCING_DAMAGE_OPTIONS = [
  { value: 'fire', label: '火焰' },
  { value: 'cold', label: '寒冷' },
  { value: 'lightning', label: '闪电' },
  { value: 'acid', label: '强酸' },
  { value: 'poison', label: '毒素' },
  { value: 'radiant', label: '光耀' },
  { value: 'necrotic', label: '暗蚀' },
]

/** 伤害骰一行编辑中「骰子」下拉选项：D4～D12，以及 2d6/2d8 */
export const DAMAGE_DICE_OPTIONS = [
  { value: '1d4', label: '1d4' },
  { value: '1d6', label: '1d6' },
  { value: '1d8', label: '1d8' },
  { value: '1d10', label: '1d10' },
  { value: '1d12', label: '1d12' },
  { value: '2d6', label: '2d6' },
  { value: '2d8', label: '2d8' },
]

/** 伤害骰一行编辑中「箭」下拉选项 */
export const DAMAGE_DICE_ARROW_OPTIONS = [
  { value: '', label: '无' },
  { value: '固定', label: '固定' },
  { value: '每回合', label: '每回合' },
  { value: '命中时', label: '命中时' },
]

/** 从「1d6 穿刺」或「攻击」字符串解析出 { minus, plus, o1, o2, type, o3 }，用于回填伤害模块 */
export function parseDamageString(str) {
  if (!str || typeof str !== 'string') return { minus: '', plus: '', o1: '', o2: '', type: '', o3: '' }
  const s = str.trim()
  const withPlus = s.match(/^(\d*)\s*[+＋]\s*(\d*d\d+|\d+)\s*(.*)$/i)
  if (withPlus) {
    return { minus: (withPlus[1] || '').trim(), plus: String(withPlus[2]).toLowerCase(), o1: '', o2: '', type: (withPlus[3] || '').trim(), o3: '' }
  }
  const simple = s.match(/^(\d*d\d+|\d+)\s+(.+)$/i)
  if (simple) return { minus: '', plus: String(simple[1]).toLowerCase(), o1: '', o2: '', type: (simple[2] || '').trim(), o3: '' }
  const diceOnly = s.match(/^(\d*d\d+)$/i)
  if (diceOnly) return { minus: '', plus: String(diceOnly[1]).toLowerCase(), o1: '', o2: '', type: '', o3: '' }
  return { minus: '', plus: '', o1: '', o2: '', type: s, o3: '' }
}

/** 将伤害模块 value（parseDamageString 返回结构）格式化为「攻击」字段字符串，如 "1d6 穿刺"、"0+1d8 挥砍" */
export function formatDamageForAttack(obj) {
  if (!obj || typeof obj !== 'object') return ''
  const { minus, plus, type } = obj
  const parts = []
  if (minus !== '' && minus !== undefined) parts.push(minus + '+')
  if (plus) parts.push(plus)
  if (type) parts.push(type)
  return parts.join(' ').trim()
}

/** 兼容旧 UI 的选项（仅用于迁移） */
export const PIERCING_ELEMENT_OPTIONS = PIERCING_DAMAGE_OPTIONS.slice(0, 5)
export const PIERCING_ALIGNMENT_OPTIONS = PIERCING_DAMAGE_OPTIONS.slice(5, 7)

/** 将伤害穿透特性 value（对象）格式化为展示文案，如「忽略伤害抗性：闪电、光」；兼容旧 shape（element/alignment） */
export function formatDamagePiercingTraitsValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const pierce = Array.isArray(value.pierce)
    ? value.pierce
    : [...(Array.isArray(value.element) ? value.element : []), ...(Array.isArray(value.alignment) ? value.alignment : [])]
  if (pierce.length === 0) return ''
  const labels = pierce.map((v) => PIERCING_DAMAGE_OPTIONS.find((o) => o.value === v)?.label ?? v)
  return '忽略伤害抗性：' + labels.join('、')
}

/**
 * BUFF 效果类型 - 二级联动（大类）
 * 第一级：大类 (category)
 * 第二级：具体效果 (key, label, dataType, subSelect, hidden)
 */
const CATEGORY_ORDER = ['ability', 'offense', 'defense', 'mobility_casting']

export const BUFF_TYPES = {
  ability: {
    // 合并「属性基础修正」+「技能与检定专精」
    label: '属性/技能',
    color: 'gold',
    effects: [
      { key: 'ability_score', label: '属性调整', dataType: 'object', subSelect: 'abilityScores' },
      { key: 'ability_override', label: '属性值上限', dataType: 'object', subSelect: 'abilityScores' },
      { key: 'extra_attunement_slots', label: '额外同调位', dataType: 'number' },
      // 技能增强：数值加值+优势配置，这里沿用原有技能加值结构
      { key: 'skill_bonus', label: '技能增强', dataType: 'object', subSelect: 'skillsAndAdvantage' },
      { key: 'adv_skill', label: '技能检定优势', dataType: 'boolean', hidden: true },
      // 豁免检定增强：数值加值+优势配置
      { key: 'save_bonus', label: '豁免检定增强', dataType: 'object', subSelect: 'abilityScoresAndAdvantage' },
      { key: 'adv_save', label: '豁免检定优势', dataType: 'boolean', hidden: true },
    ],
  },
  offense: {
    label: '攻击/伤害',
    color: 'red',
    effects: [
      // 表格：命中/伤害加值
      // 互动调整方式：数字输入 + 下拉（普通/优势/劣势），数值同时作用于命中与伤害。
      // 为兼容旧数据，仍接受旧文本形式「攻击+X / 伤害+Y」，计算时自动解析。
      { key: 'attack_damage_bonus', label: '命中/伤害加值', dataType: 'object', subSelect: 'numberAndAdvantage' },
      // 表格：攻击距离
      // 互动调整方式：数字输入（尺），用于记录近战/远程的基础攻击距离。
      { key: 'attack_distance_range', label: '攻击距离', dataType: 'number' },
      // 表格：攻击范围（影响到的区域/目标）
      // 互动调整方式：下拉选择「半径/直径」，配合数字输入（尺，步进 5），例如「半径 10 尺」。
      { key: 'attack_area', label: '攻击范围', dataType: 'object', subSelect: 'attackAreaSize' },
      // 表格：伤害穿透特性
      // 互动调整方式：标签多选：
      //   ☑️ 视为魔法
      //   ☑️ 视为银质
      //   ☑️ 元素穿透: 忽略 [火/冷/雷/酸/毒] 抗性
      //   ☑️ 正邪穿透: 忽略 [光/暗] 抗性
      // dataType: array + 自定义子选择器 damagePiercingTraits
      { key: 'damage_piercing_traits', label: '伤害穿透特性', dataType: 'array', subSelect: 'damagePiercingTraits' },
      // 表格：暴击范围扩大
      // 互动调整方式：范围选项：默认 20，可选 19-20、18-20。
      // 这里用文本，直接填「20 / 19-20 / 18-20」之类的描述。
      { key: 'crit_range_expand', label: '暴击范围扩大', dataType: 'text' },
      // 表格：伤害骰（自定义一行：箭 - 数字 + 骰子 箭 类型 箭，箭为下拉）
      { key: 'extra_damage_dice', label: '伤害骰', dataType: 'object', subSelect: 'damageDiceInline' },
      // 表格：弹药无限
      // 互动调整方式：勾选开关，表示「远程攻击不消耗弹药」。
      { key: 'infinite_ammo', label: '弹药无限', dataType: 'boolean' },
    ],
  },
  defense: {
    label: '防御/生存',
    color: 'orange',
    effects: [
      { key: 'ac_bonus', label: 'AC', dataType: 'number' },
      { key: 'resist_type', label: '伤害抗性', dataType: 'array', subSelect: 'damageType' },
      { key: 'immune_type', label: '伤害免疫', dataType: 'array', subSelect: 'damageType' },
      { key: 'vulnerable_type', label: '伤害易伤', dataType: 'array', subSelect: 'damageType' },
      { key: 'max_hp_bonus', label: '生命上限', dataType: 'number' },
      { key: 'condition_immunity', label: '状态免疫', dataType: 'array', subSelect: 'condition' },
      { key: 'custom_condition', label: '📝 自由填写 (状态)', dataType: 'text' },
    ],
  },
  // 合并「移动与机动天赋」+「专注与施法优化」
  mobility_casting: {
    label: '移动/施法',
    color: 'purple',
    effects: [
      // 表格：速度增加。典型来源：木精灵、野蛮人快速移动、武僧无甲移动。
      // 互动调整方式：数字输入，直接写「基础速度+X 尺」，无需再拆分多行说明。
      { key: 'base_speed_increment', label: '速度增加', dataType: 'number' },
      // 表格：地形无视。典型来源：陆地行者、飘忽步。
      // 互动调整方式：开关启用，忽略困难地形。规则逻辑：全局被动。
      { key: 'terrain_ignore', label: '地形无视', dataType: 'boolean' },
      // 表格：专注增强。典型来源：战法师、某些物品。
      // 互动调整方式：数字输入 + 下拉（普通/优势/劣势）。规则逻辑：受伤害进行专注检定时应用加值与优势。
      { key: 'concentration_save_enhance', label: '专注增强', dataType: 'object', subSelect: 'numberAndAdvantage' },
      // 表格：施法距离延伸。典型来源：法术延展专长。
      // 互动调整方式：倍率/数值 — 选择 x2 或输入固定增量。规则逻辑：仅影响法术射程。
      { key: 'spell_range_extension', label: '施法距离延伸', dataType: 'text' },
      // 表格：法术攻击加值。仅数值。
      { key: 'spell_attack_bonus', label: '法术攻击加值', dataType: 'number' },
      // 表格：法术豁免 DC 加值。仅数值。
      { key: 'save_dc_bonus', label: 'DC', dataType: 'number' },
      // 以下保留旧 key，供已有数据与计算器解析
      { key: 'speed_bonus', label: '移动速度', dataType: 'number', hidden: true },
      { key: 'flight_speed', label: '飞行速度', dataType: 'object', subSelect: 'flightSpeed', hidden: true },
      { key: 'init_bonus', label: '先攻', dataType: 'number', hidden: true },
      { key: 'concentration', label: '专注', dataType: 'object', subSelect: 'numberAndAdvantage', hidden: true },
      { key: 'charge', label: '充能数', dataType: 'number', hidden: true },
    ],
  },
}

/** 旧称/别称 -> 统一简称（兼容历史数据） */
const DAMAGE_TYPE_ALIASES = { 贯穿: '贯通', 冷冻: '寒冷', 辐射: '光耀', 死灵: '暗蚀' }

/** 根据伤害类型 value 或已有中文简称返回统一中文 label（界面不展示英文） */
export function getDamageTypeLabel(value) {
  if (value == null || value === '') return ''
  const v = String(value).trim()
  if (DAMAGE_TYPE_ALIASES[v]) return DAMAGE_TYPE_ALIASES[v]
  const byValue = DAMAGE_TYPES.find((d) => d.value === v.toLowerCase())
  if (byValue) return byValue.label
  const byLabel = DAMAGE_TYPES.find((d) => d.label === v)
  if (byLabel) return byLabel.label
  return v
}

/** 将中文简称或英文 value 规范为英文 value（用于抗性/伤害计算匹配） */
export function getDamageTypeValue(labelOrValue) {
  if (labelOrValue == null || labelOrValue === '') return ''
  const v = String(labelOrValue).trim()
  const label = DAMAGE_TYPE_ALIASES[v] || v
  const byValue = DAMAGE_TYPES.find((d) => d.value === v.toLowerCase())
  if (byValue) return byValue.value
  const byLabel = DAMAGE_TYPES.find((d) => d.label === label)
  if (byLabel) return byLabel.value
  return v.toLowerCase()
}

/** 根据状态 value 返回中文 label */
export function getConditionLabel(value) {
  const v = String(value || '')
  const found = CONDITION_OPTIONS.find((c) => c.value === v)
  return found ? found.label : value
}

/** 优势/劣势选项（用于 numberAndAdvantage 等）：普通、优势、劣势 */
export const ADVANTAGE_OPTIONS = [
  { value: '', label: '普通' },
  { value: 'advantage', label: '优势' },
  { value: 'disadvantage', label: '劣势' },
]

/** 已移除的效果类型（仅用于显示旧数据，不可新增） */
const DEPRECATED_EFFECTS = {
  temp_hp: { key: 'temp_hp', label: '临时生命值（已移至血条）', dataType: 'number' },
  dmg_bonus_all: { key: 'dmg_bonus_all', label: '通用伤害', dataType: 'number' },
  dmg_type_specific: { key: 'dmg_type_specific', label: '特定类型伤害', dataType: 'object', subSelect: 'damageType' },
  disadv_all: { key: 'disadv_all', label: '通用劣势', dataType: 'boolean' },
  proficiency_override: { key: 'proficiency_override', label: '熟练加值覆写', dataType: 'number' },
}

/** 扁平化：所有 effect key -> { category, effect } */
export function getEffectInfo(key) {
  if (DEPRECATED_EFFECTS[key]) {
    return { category: 'defense', effect: DEPRECATED_EFFECTS[key] }
  }
  for (const cat of CATEGORY_ORDER) {
    const data = BUFF_TYPES[cat]
    if (!data) continue
    const effect = data.effects.find((e) => e.key === key)
    if (effect) return { category: cat, ...data, effect }
  }
  return null
}

/** 获取大类列表（用于第一级下拉） */
export function getCategories() {
  return CATEGORY_ORDER.map((key) => ({ key, label: BUFF_TYPES[key].label }))
}

/** 旧大类 -> 当前大类（兼容旧存档） */
const OLD_CATEGORY_TO_NEW = {
  attack: 'offense',
  damage: 'defense',
  attribute: 'ability',
  condition: 'defense',
  mobility: 'mobility_casting',
  casting: 'mobility_casting',
}

/**
 * 规范化 category：优先按 effectType 查当前大类，否则按旧 category 映射
 * @param {string} effectType - 效果 key
 * @param {string} [oldCategory] - 旧存档可能为 attack/damage/attribute/condition
 * @returns {string} 新 6 大类之一
 */
export function normalizeEffectCategory(effectType, oldCategory) {
  const info = getEffectInfo(effectType)
  if (info) return info.category
  if (oldCategory && OLD_CATEGORY_TO_NEW[oldCategory]) return OLD_CATEGORY_TO_NEW[oldCategory]
  return 'ability'
}
