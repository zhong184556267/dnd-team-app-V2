/**
 * D&D 5e 豁免检定与技能（关联属性 + 中文名）
 * 豁免检定 = d20 + 属性调整 + 熟练加值(若熟练) + Buff
 * 技能 = d20 + 属性调整 + 熟练加值×系数(无/半/熟练/专精) + Buff
 */

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export const SAVE_NAMES = {
  str: '力量豁免',
  dex: '敏捷豁免',
  con: '体质豁免',
  int: '智力豁免',
  wis: '感知豁免',
  cha: '魅力豁免',
}

/** 技能：id, 关联属性 ab, 中文名 name */
export const SKILLS = [
  { id: 'acrobatics', ab: 'dex', name: '体操' },
  { id: 'animalHandling', ab: 'wis', name: '驯兽' },
  { id: 'arcana', ab: 'int', name: '奥秘' },
  { id: 'athletics', ab: 'str', name: '运动' },
  { id: 'concentration', ab: 'con', name: '专注' },
  { id: 'deception', ab: 'cha', name: '欺瞒' },
  { id: 'history', ab: 'int', name: '历史' },
  { id: 'insight', ab: 'wis', name: '洞察' },
  { id: 'intimidation', ab: 'cha', name: '威吓' },
  { id: 'investigation', ab: 'int', name: '调查' },
  { id: 'medicine', ab: 'wis', name: '医学' },
  { id: 'nature', ab: 'int', name: '自然' },
  { id: 'perception', ab: 'wis', name: '察觉' },
  { id: 'performance', ab: 'cha', name: '表演' },
  { id: 'persuasion', ab: 'cha', name: '说服' },
  { id: 'religion', ab: 'int', name: '宗教' },
  { id: 'sleightOfHand', ab: 'dex', name: '巧手' },
  { id: 'stealth', ab: 'dex', name: '潜行' },
  { id: 'survival', ab: 'wis', name: '生存' },
]

/** 熟练等级常量（用于 UI 色彩与数据结构） */
export const PROFICIENCY_LEVELS = {
  NONE: 'none',           // 无 — 灰色
  HALF: 'half',           // 半熟练 — 天蓝
  PROFICIENT: 'prof',     // 熟练 — 红色
  EXPERT: 'expertise',    // 精通/专精 — 暗金
}

/** 熟练程度：none=无, half=半熟练, prof=熟练, expertise=专精；对应熟练加值系数 0, 0.5, 1, 2 */
export const SKILL_PROF_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'half', label: '半' },
  { value: 'prof', label: '熟练' },
  { value: 'expertise', label: '专精' },
]

export function skillProfFactor(prof) {
  switch (prof) {
    case 'half': return 0.5
    case 'prof': return 1
    case 'expertise': return 2
    default: return 0
  }
}

/** 熟练度等级对应的 UI 样式：文字色、边框色、光晕、是否实心 */
export function getProficiencyStyle(level) {
  switch (level) {
    case 'expertise':
      return { text: 'text-dnd-gold', border: 'border-dnd-gold', shadow: '0 0 8px rgba(184,134,11,0.6)', fill: true }
    case 'prof':
      return { text: 'text-dnd-red', border: 'border-dnd-red', shadow: null, fill: true }
    case 'half':
      return { text: 'text-sky-400', border: 'border-sky-400', shadow: null, fill: false }
    default:
      return { text: 'text-gray-600', border: 'border-gray-600', shadow: null, fill: false }
  }
}
