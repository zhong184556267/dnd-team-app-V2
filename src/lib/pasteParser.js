/**
 * 粘贴文本解析引擎：将自由文本（Markdown / 纯文本）解析为物品 / 专长 / 职业的结构化数据。
 * 解析后会返回 { data, warnings, errors }，供 UI 层展示预览与缺失提示。
 *
 * 物品：从正则提取名称、类型、伤害、词条、精通、重量、价格等
 * 专长：从 Markdown 标题 + 正文提取名称、分类、先决、描述
 * 职业：从 Markdown 表格 + 特性条文提取等级特性表
 */

import { ITEM_TYPES, WEAPON_MASTERY_OPTIONS } from '../data/itemDatabase'
import { ABILITY_KEYS, ABILITY_NAMES_ZH, DAMAGE_TYPES } from '../data/buffTypes'

// ─────────────────────────────────────────────────────────────
// 通用工具
// ─────────────────────────────────────────────────────────────

/** 简易拼音首字母 slug 生成（仅作 fallback id，不追求准确） */
function generateSlug(name) {
  if (!name) return ''
  const s = String(name).trim()
  // 如果是纯英文/数字，直接小写化
  if (/^[A-Za-z0-9 _-]+$/.test(s)) {
    return s.toLowerCase().replace(/[\s_]+/g, '_').replace(/[^a-z0-9_]/g, '')
  }
  // 中文：取每个字 unicode 编码的低位整数拼接（仅用于去重 id）
  let out = ''
  for (let i = 0; i < s.length; i++) {
    out += s.charCodeAt(i).toString(36).slice(-3)
  }
  return 'c_' + out.slice(0, 12)
}

function matchFirst(re, text) {
  const m = new RegExp(re, 'i').exec(text)
  return m ? (m[1] || '').trim() : ''
}

/** 从文本行列表中移除 Markdown 表格分隔行（|---|---|） */
function stripTableSeparators(lines) {
  return lines.filter((l) => !/^\s*\|?[\s-:|]+\|?\s*$/.test(l))
}

/** 解析 Markdown 表格行为 cells */
function parseTableRow(line) {
  if (!line || !line.includes('|')) return []
  const raw = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
  return raw.split('|').map((c) => c.trim())
}

// ─────────────────────────────────────────────────────────────
// 物品解析
// ─────────────────────────────────────────────────────────────

const DAMAGE_TYPE_KEYWORDS = ['挥砍', '穿刺', '钝击', '火焰', '冰霜', '闪电', '雷鸣', '酸蚀', '毒素', '力场', '光耀', '心灵', '暗蚀']

/** 尝试从文本中匹配物品类型 */
function detectItemType(text) {
  for (const t of ITEM_TYPES) {
    if (text.includes(t)) return t
  }
  // 常见近义
  if (/武器|长剑|短剑|匕首|巨斧|长弓|十字弩/.test(text)) return '近战武器'
  if (/盔甲|护甲|胸甲|皮甲|链甲|板甲/.test(text)) return '盔甲'
  if (/药水|治疗|解毒/.test(text)) return '药品'
  if (/卷轴|法术卷轴/.test(text)) return '消耗品'
  if (/戒指|项链|手镯|护身符/.test(text)) return '饰品'
  if (/工具|工匠|盗贼工具/.test(text)) return '工具'
  if (/食物|口粮|水/.test(text)) return '食物'
  if (/货币|金币|银币|铜币|GP|SP|CP/.test(text)) return '货币'
  return ''
}

/** 解析物品粘贴文本 */
export function parseItemText(text) {
  const result = { data: {}, warnings: [], errors: [] }
  if (!text || !text.trim()) {
    result.errors.push('粘贴内容为空')
    return result
  }
  const raw = String(text).trim()
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const joined = lines.join(' ')

  const data = {
    类型: '近战武器',
    子类型: '',
    类别: '',
    名称: '',
    攻击: '',
    附注: '',
    精通: '',
    伤害: '',
    重量: '',
    价格: '',
    详细介绍: '',
  }

  // 类型
  const type = detectItemType(joined)
  if (type) data.类型 = type
  else result.warnings.push('未识别物品类型（默认为「近战武器」）')

  // 名称 / 类别
  // 优先取第一个非空行作为名称候选
  let nameCandidate = ''
  const titleLine = lines.find((l) => /^#{1,3}\s+/.test(l))
  if (titleLine) {
    nameCandidate = titleLine.replace(/^#{1,3}\s+/, '').trim()
  } else if (lines.length > 0) {
    nameCandidate = lines[0].replace(/^[*•\-—\s]+/, '').trim()
  }
  // 去掉行尾冒号
  nameCandidate = nameCandidate.replace(/[:：]\s*$/, '').trim()
  if (nameCandidate) data.类别 = nameCandidate

  // 伤害：XdY + 伤害类型
  const damageMatch = joined.match(/(\d+d\d+)\s*[+]?\s*(\d+)?\s*(挥砍|穿刺|钝击|火焰|冰霜|闪电|雷鸣|酸蚀|毒素|力场|光耀|心灵|暗蚀)?/i)
  if (damageMatch) {
    let atk = damageMatch[1]
    if (damageMatch[2]) atk += '+' + damageMatch[2]
    data.攻击 = atk
    if (damageMatch[3]) data.伤害 = damageMatch[3]
  }

  // 伤害类型单独出现
  if (!data.伤害) {
    const dt = DAMAGE_TYPE_KEYWORDS.find((k) => joined.includes(k))
    if (dt) data.伤害 = dt
  }

  // 重量：X磅 / X lb
  const weightMatch = joined.match(/(\d+(?:\.\d+)?)\s*(磅|lb|lbs)\b/i)
  if (weightMatch) data.重量 = `${weightMatch[1]}磅`

  // 价格：X GP / X SP / X CP / X金币 / X银币 / X铜币
  const priceMatch = joined.match(/(\d+(?:\.\d+)?)\s*(GP|SP|CP|金币|银币|铜币|金|银|铜)\b/i)
  if (priceMatch) {
    const unit = priceMatch[2].toUpperCase()
    if (unit === 'GP' || unit === '金币' || unit === '金') data.价格 = `${priceMatch[1]} GP`
    else if (unit === 'SP' || unit === '银币' || unit === '银') data.价格 = `${priceMatch[1]} SP`
    else if (unit === 'CP' || unit === '铜币' || unit === '铜') data.价格 = `${priceMatch[1]} CP`
  }

  // 词条（附注）：在「词条」「特性」关键词后取逗号分隔列表
  const traitMatch = joined.match(/词条[:：]\s*([^\n。；;]+)/)
  if (traitMatch) data.附注 = traitMatch[1].trim()

  // 精通
  const masteryMatch = joined.match(/精通[:：]\s*([^\n。；;]+)/)
  if (masteryMatch) {
    const kw = masteryMatch[1].trim()
    const matched = WEAPON_MASTERY_OPTIONS.find((m) => kw.includes(m))
    data.精通 = matched || kw
  }

  // 详细介绍：剩余文本
  const descLines = lines.filter((l) => !/^#{1,3}\s+/.test(l) && l.length > 10)
  if (descLines.length > 0) data.详细介绍 = descLines.join('\n')

  // 校验
  if (!data.类别) result.errors.push('缺少名称/类别（必填）')
  if (!data.重量) result.warnings.push('未识别到重量信息')
  if (!data.价格) result.warnings.push('未识别到价格信息')
  if (data.类型 === '近战武器' || data.类型 === '远程武器') {
    if (!data.攻击) result.warnings.push('武器类型但未识别到伤害骰')
    if (!data.伤害) result.warnings.push('武器类型但未识别到伤害类型')
  }

  result.data = data
  return result
}

// ─────────────────────────────────────────────────────────────
// 专长解析
// ─────────────────────────────────────────────────────────────

/** 通用专长分类关键词 */
const FEAT_CATEGORY_RULES = [
  { kw: ['起源专长', '起源'], cat: '起源专长' },
  { kw: ['通用专长', '通用'], cat: '通用专长' },
  { kw: ['星辰专长', '星辰'], cat: '星辰专长' },
]

/** 解析专长粘贴文本 */
export function parseFeatText(text) {
  const result = { data: {}, warnings: [], errors: [] }
  if (!text || !text.trim()) {
    result.errors.push('粘贴内容为空')
    return result
  }
  const raw = String(text).trim()
  const lines = raw.split(/\r?\n/)

  let name = ''
  let category = ''
  let prerequisite = ''
  let description = ''
  let titleIdx = -1

  // 标题行
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const m = l.match(/^#{1,3}\s+(.+)/)
    if (m) {
      name = m[1].trim().replace(/[:：]\s*$/, '')
      titleIdx = i
      break
    }
    // 第一行非空且较短时也作名称
    if (l.trim() && !name) {
      const cand = l.trim().replace(/^[*•\-—\s]+/, '').replace(/[:：]\s*$/, '')
      if (cand && cand.length <= 20 && !/[，。]/.test(cand)) {
        name = cand
        titleIdx = i
        break
      }
    }
  }

  // 若仍无名称，取第一个非空行
  if (!name) {
    const first = lines.find((l) => l.trim())
    if (first) {
      name = first.trim().replace(/^[*•\-—\s]+/, '').replace(/[:：]\s*$/, '')
      titleIdx = lines.indexOf(first)
    }
  }

  // 分类
  for (const rule of FEAT_CATEGORY_RULES) {
    if (rule.kw.some((k) => raw.includes(k))) {
      category = rule.cat
      break
    }
  }
  if (!category) category = '通用专长'

  // 先决条件：匹配「先决」「前提」「等级 X+」
  const prereLine = lines.find((l) => /先决|前提|prerequisite/i.test(l))
  if (prereLine) {
    const m = prereLine.match(/[:：]\s*(.+)/)
    if (m) prerequisite = m[1].trim()
  }
  if (!prerequisite) {
    const lvlMatch = raw.match(/等级\s*(\d+)\s*\+/)
    if (lvlMatch) prerequisite = `等级 ${lvlMatch[1]}+`
  }

  // 描述：标题行之后的内容
  if (titleIdx >= 0) {
    description = lines.slice(titleIdx + 1).map((l) => l.trim()).filter(Boolean).join('\n')
  } else {
    description = lines.map((l) => l.trim()).filter(Boolean).join('\n')
  }
  // 去掉描述中可能残留的先决行
  description = description.replace(/^.*(?:先决|前提)[^\n]*\n?/i, '').trim()

  const data = {
    id: generateSlug(name),
    name,
    category,
    prerequisite,
    description,
  }

  if (!data.name) result.errors.push('缺少专长名称（必填）')
  if (!data.description) result.warnings.push('未识别到描述文本')
  if (data.description.length < 20) result.warnings.push('描述文本较短，请确认是否完整')

  result.data = data
  return result
}

// ─────────────────────────────────────────────────────────────
// 职业解析
// ─────────────────────────────────────────────────────────────

const ABILITY_REVERSE_MAP = {}
for (const k of ABILITY_KEYS) {
  ABILITY_REVERSE_MAP[ABILITY_NAMES_ZH[k]] = k
}

/** 解析职业粘贴文本（Markdown） */
export function parseClassText(text) {
  const result = { data: {}, warnings: [], errors: [] }
  if (!text || !text.trim()) {
    result.errors.push('粘贴内容为空')
    return result
  }
  const raw = String(text).trim()
  const lines = raw.split(/\r?\n/)

  const data = {
    name: '',
    hitDice: 8,
    saveProficiencies: [],
    armorProficiencies: [],
    weaponProficiencies: [],
    skillOptions: [],
    requirements: '',
    flavor: '',
    features: [],
    subclasses: {},
    isFanxing: true, // 自定义职业默认归为繁星特色
  }

  // 名称：第一个 # 标题
  for (const l of lines) {
    const m = l.match(/^#\s+(.+)/)
    if (m) {
      data.name = m[1].trim().replace(/[:：]\s*$/, '').replace(/[（(].*$/, '').trim()
      break
    }
  }
  if (!data.name) {
    const first = lines.find((l) => l.trim())
    if (first) data.name = first.trim().replace(/^[*•\-—\s]+/, '').replace(/[:：]\s*$/, '')
  }

  // 概览表：生命骰、豁免、护甲、武器等
  const overviewIdx = lines.findIndex((l) => /职业概览|核心特质|概览/.test(l))
  if (overviewIdx >= 0) {
    const tableStart = lines.findIndex((l, i) => i > overviewIdx && l.includes('|') && l.includes('项'))
    for (let i = overviewIdx + 1; i < Math.min(lines.length, overviewIdx + 40); i++) {
      const l = lines[i]
      if (!l.includes('|')) continue
      const cells = parseTableRow(l)
      if (cells.length < 2) continue
      const key = cells[0]
      const val = cells[1]
      if (key.includes('生命骰') || key.includes('生命值')) {
        const dm = val.match(/d(\d+)/i)
        if (dm) data.hitDice = parseInt(dm[1], 10)
      } else if (key.includes('豁免')) {
        for (const cn in ABILITY_REVERSE_MAP) {
          if (val.includes(cn)) data.saveProficiencies.push(ABILITY_REVERSE_MAP[cn])
        }
      } else if (key.includes('护甲')) {
        data.armorProficiencies = val.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
      } else if (key.includes('武器')) {
        data.weaponProficiencies = val.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
      } else if (key.includes('技能')) {
        data.skillOptions = val.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
      }
    }
  }

  // 先决条件
  const prereIdx = lines.findIndex((l) => /先决条件|先决/.test(l))
  if (prereIdx >= 0) {
    const after = lines.slice(prereIdx + 1).filter((l) => l.trim() && !l.startsWith('|') && !l.startsWith('---'))
    if (after.length > 0) data.requirements = after[0].trim()
  }
  // 表格形式的先决
  const prereTableIdx = lines.findIndex((l) => l.includes('|') && (l.includes('敏捷') || l.includes('智力')) && (l.includes('15') || l.includes('12')))
  if (!data.requirements && prereTableIdx >= 0) {
    const cells = parseTableRow(lines[prereTableIdx])
    if (cells.length >= 2) data.requirements = cells[cells.length - 1].trim()
  }

  // 等级成长表：找 | 等级 | 特性 | 的表头
  const growthHeaderIdx = lines.findIndex((l) => l.includes('|') && l.includes('等级') && (l.includes('特性') || l.includes('偷袭')))
  if (growthHeaderIdx >= 0) {
    const tableLines = []
    for (let i = growthHeaderIdx + 1; i < lines.length; i++) {
      const l = lines[i]
      if (!l.includes('|')) {
        if (tableLines.length > 0) break
        continue
      }
      // 跳过分隔行
      if (/^\s*\|?[\s-:|]+\|?\s*$/.test(l)) continue
      tableLines.push(l)
    }
    for (const tl of tableLines) {
      const cells = parseTableRow(tl)
      if (cells.length < 2) continue
      const lv = parseInt(cells[0], 10)
      if (!lv || lv < 1 || lv > 20) continue
      const featNames = cells.slice(1).join('，').split(/[、，,]/).map((s) => s.trim()).filter(Boolean)
      for (const fn of featNames) {
        const id = generateSlug(fn) || `feat_lv${lv}`
        data.features.push({
          id,
          name: fn,
          description: '（待补充：从特性条文中提取）',
          level: lv,
        })
      }
    }
  }

  // 特性条文：### 特性名（N 级）
  const featureSections = []
  let currentFeat = null
  let currentDesc = []
  for (const l of lines) {
    const m = l.match(/^###\s+(.+?)[（(]\s*(\d+)\s*级\s*[）)]/)
    if (m) {
      if (currentFeat) {
        currentFeat.description = currentDesc.join('\n').trim()
        featureSections.push(currentFeat)
      }
      currentFeat = { name: m[1].trim(), level: parseInt(m[2], 10), desc: [] }
      currentDesc = []
    } else if (currentFeat) {
      currentDesc.push(l)
    }
  }
  if (currentFeat) {
    currentFeat.description = currentDesc.join('\n').trim()
    featureSections.push(currentFeat)
  }

  // 用特性条文补充 description
  for (const fs of featureSections) {
    const exist = data.features.find((f) => f.name === fs.name || f.level === fs.level)
    if (exist) {
      exist.description = fs.description
    } else {
      data.features.push({
        id: generateSlug(fs.name) || `feat_${fs.level}`,
        name: fs.name,
        description: fs.description,
        level: fs.level,
      })
    }
  }

  // flavor：第一段非标题、非表格的描述文字
  const flavorLines = []
  let inFlavor = false
  for (const l of lines) {
    if (!l.trim()) continue
    if (/^#\s+/.test(l)) continue
    if (l.includes('|')) continue
    if (/^#{2,3}\s+/.test(l)) break
    if (/先决条件|职业概览|等级成长|特性条文|与组织/.test(l)) break
    inFlavor = true
    flavorLines.push(l.trim())
  }
  if (flavorLines.length > 0) data.flavor = flavorLines.join(' ').slice(0, 200)

  // 校验
  if (!data.name) result.errors.push('缺少职业名称（必填）')
  if (data.features.length === 0) result.errors.push('未解析到任何职业特性')
  if (data.hitDice === 8 && !data.saveProficiencies.length) {
    result.warnings.push('未识别到生命骰与豁免熟练，默认为 D8')
  }
  if (data.armorProficiencies.length === 0) result.warnings.push('未识别到护甲熟练')
  if (data.weaponProficiencies.length === 0) result.warnings.push('未识别到武器熟练')

  // 排序特性
  data.features.sort((a, b) => a.level - b.level)

  result.data = data
  return result
}

// ─────────────────────────────────────────────────────────────
// 统一入口
// ─────────────────────────────────────────────────────────────

export function parsePasteText(kind, text) {
  switch (kind) {
    case 'item':
      return parseItemText(text)
    case 'feat':
      return parseFeatText(text)
    case 'class':
      return parseClassText(text)
    default:
      return { data: {}, warnings: [], errors: ['未知解析类型：' + kind] }
  }
}

export { generateSlug }
