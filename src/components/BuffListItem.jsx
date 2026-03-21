import { Trash2, Pencil } from 'lucide-react'
import { getEffectInfo, getDamageTypeLabel, getConditionLabel, ABILITY_NAMES_ZH, formatDamagePiercingTraitsValue } from '../data/buffTypes'
import { SAVE_NAMES, SKILLS } from '../data/dndSkills'
import { formatContainedSpellBrief } from '../lib/containedSpellBrief'

/** 单条效果的简化文案（用于外层一行展示），如 "心灵抗性"、"智力-2，感知+2"、"生命上限+26" */
function getEffectSummaryShort(buff) {
  const info = getEffectInfo(buff.effectType)
  if (!info) return buff.value != null ? String(buff.value) : ''
  // 自由填写：优先 value（与保存一致），兼容 customText；空时显示占位便于记录“仅描述”类效果
  if (buff.effectType.startsWith('custom_')) {
    const text = (buff.value != null && buff.value !== '' ? String(buff.value) : '') || (buff.customText != null && buff.customText !== '' ? String(buff.customText) : '')
    return text || '（自由填写）'
  }
  const effectLabel = info.effect.label ?? buff.effectType
  const v = buff.value

  if (info.effect.dataType === 'boolean') return buff.value ? effectLabel : ''
  if (info.effect.dataType === 'number' && typeof v === 'number') {
    const sign = v >= 0 ? '+' : ''
    return `${effectLabel}${sign}${v}`
  }
  if (info.effect.dataType === 'object' && v) {
    if (v.type != null && typeof v.val === 'number') {
      const typeLabel = getDamageTypeLabel(v.type)
      const sign = v.val >= 0 ? '+' : ''
      return `${typeLabel}${sign}${v.val}`
    }
    if (info.effect.subSelect === 'numberAndAdvantage') {
      const val = v.val ?? (typeof v === 'number' ? v : 0)
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      const numStr = val !== 0 ? (val >= 0 ? '+' : '') + val : ''
      return effectLabel + (numStr ? numStr : '') + (adv ? (numStr ? ' ' : '') + adv : '')
    }
    if (info.effect.subSelect === 'flightSpeed') {
      const speed = v.speed ?? (typeof v === 'number' ? v : 0)
      const hover = v.hover ? '悬浮' : ''
      return (speed ? speed + '尺' : '') + (hover ? (speed ? ' ' : '') + hover : '') || effectLabel
    }
    if (info.effect.subSelect === 'abilityScoresAndAdvantage') {
      const labels = buff.effectType === 'save_bonus' ? SAVE_NAMES : ABILITY_NAMES_ZH
      const parts = Object.entries(v)
        .filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
        .map(([k, val]) => {
          const nameZh = labels[k] ?? k
          const num = Number(val)
          const sign = num >= 0 ? '+' : ''
          return `${nameZh}${sign}${num}`
        })
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      return parts.join('，') + (adv ? (parts.length ? '，' : '') + adv : '')
    }
    if (info.effect.subSelect === 'skillsAndAdvantage') {
      const parts = Object.entries(v)
        .filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
        .map(([k, val]) => {
          const sk = SKILLS.find((s) => s.id === k)
          const nameZh = sk ? sk.name : k
          const num = Number(val)
          const sign = num >= 0 ? '+' : ''
          return `${nameZh}${sign}${num}`
        })
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      return parts.join('，') + (adv ? (parts.length ? '，' : '') + adv : '')
    }
    if (buff.effectType === 'ability_score' || buff.effectType === 'ability_override') {
      const parts = Object.entries(v)
        .filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
        .map(([k, val]) => {
          const nameZh = ABILITY_NAMES_ZH[k] ?? k
          const num = Number(val)
          if (buff.effectType === 'ability_override') return `${nameZh}${num}`
          const sign = num >= 0 ? '+' : ''
          return `${nameZh}${sign}${num}`
        })
      return parts.join('，')
    }
  }
  if (buff.effectType === 'damage_piercing_traits' && v && typeof v === 'object' && !Array.isArray(v)) {
    const str = formatDamagePiercingTraitsValue(v)
    return str || effectLabel
  }
  if (buff.effectType === 'extra_damage_dice') {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const s = [' - ', v.minus, ' + ', v.plus, ' ', v.type].join('').replace(/\s+/g, ' ').trim()
      return s || effectLabel
    }
    return effectLabel
  }
  if (Array.isArray(v) && v.length) {
    if (['resist_type', 'immune_type', 'vulnerable_type'].includes(buff.effectType)) {
      const labels = v.map(getDamageTypeLabel)
      const suffix = buff.effectType === 'resist_type' ? '抗性' : buff.effectType === 'immune_type' ? '免疫' : '易伤'
      return labels.map((l) => `${l}${suffix}`).join('，')
    }
    if (buff.effectType === 'ignore_resistance') {
      const labels = v.map(getDamageTypeLabel)
      return '无视' + labels.join('、') + '抗性'
    }
    if (buff.effectType === 'condition_immunity') {
      return v.map(getConditionLabel).join('、') + '免疫'
    }
  }
  if (buff.effectType === 'contained_spell' && v && typeof v === 'object' && !Array.isArray(v)) {
    const spellLine = formatContainedSpellBrief(v)
    return spellLine || effectLabel
  }
  return v != null ? `${effectLabel}${String(v)}` : effectLabel
}

/** 整条 buff 的简化一行文案：来源 | 效果1，效果2，… */
function getBuffSummaryLine(buff, baseAbilities = {}) {
  const source = buff.source?.trim() || '未知来源'
  const effectParts = []
  if (Array.isArray(buff.effects) && buff.effects.length) {
    buff.effects.forEach((e) => {
      const s = getEffectSummaryShort({ effectType: e.effectType, value: e.value, customText: e.customText })
      if (s) effectParts.push(s)
    })
  } else {
    const s = getEffectSummaryShort(buff)
    if (s) effectParts.push(s)
  }
  const effectsStr = effectParts.join('，')
  return effectsStr ? `${source} | ${effectsStr}` : source
}

/** 效果描述 + 数值（用于胶囊）；属性用中文名并显示扣除后的总值 */
function getEffectDisplay(buff, baseAbilities = {}) {
  const info = getEffectInfo(buff.effectType)
  if (!info) return { label: '—', value: buff.value != null ? String(buff.value) : null }
  if (buff.effectType.startsWith('custom_')) {
    const text = (buff.value != null && buff.value !== '' ? String(buff.value) : '') || (buff.customText != null && buff.customText !== '' ? String(buff.customText) : '')
    return { label: text || '（自由填写）', value: null }
  }
  const effectLabel = info.effect.label ?? buff.effectType

  if (info.effect.dataType === 'boolean') {
    return { label: effectLabel, value: buff.value ? '优势' : null }
  }
  if (info.effect.dataType === 'number' && typeof buff.value === 'number') {
    const sign = buff.value >= 0 ? '+' : ''
    return { label: effectLabel, value: `${sign}${buff.value}` }
  }
  if (info.effect.dataType === 'object' && buff.value) {
    const v = buff.value
    if (v.type != null && typeof v.val === 'number') {
      const sign = v.val >= 0 ? '+' : ''
      const typeLabel = getDamageTypeLabel(v.type)
      return { label: `${effectLabel}(${typeLabel})`, value: `${sign}${v.val}` }
    }
    if (info.effect.subSelect === 'numberAndAdvantage') {
      const val = v.val ?? (typeof v === 'number' ? v : 0)
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      const numStr = val !== 0 ? (val >= 0 ? '+' : '') + val : ''
      return { label: effectLabel, value: (numStr || adv) ? `${numStr}${adv ? ' ' + adv : ''}` : null }
    }
    if (info.effect.subSelect === 'flightSpeed') {
      const speed = v.speed ?? (typeof v === 'number' ? v : 0)
      const hover = v.hover ? '悬浮' : ''
      return { label: effectLabel, value: speed ? `${speed}尺${hover ? ' ' + hover : ''}` : (hover || null) }
    }
    if (info.effect.subSelect === 'abilityScoresAndAdvantage') {
      const labels = buff.effectType === 'save_bonus' ? SAVE_NAMES : ABILITY_NAMES_ZH
      const parts = Object.entries(v)
        .filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
        .map(([k, val]) => `${labels[k] ?? k} ${val >= 0 ? '+' : ''}${val}`)
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      return { label: effectLabel, value: parts.length ? parts.join('、') + (adv ? ' ' + adv : '') : (adv || null) }
    }
    if (info.effect.subSelect === 'skillsAndAdvantage') {
      const parts = Object.entries(v)
        .filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
        .map(([k, val]) => {
          const sk = SKILLS.find((s) => s.id === k)
          return `${sk ? sk.name : k} ${val >= 0 ? '+' : ''}${val}`
        })
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      return { label: effectLabel, value: parts.length ? parts.join('、') + (adv ? ' ' + adv : '') : (adv || null) }
    }
    if (buff.effectType === 'contained_spell' && v && typeof v === 'object' && !Array.isArray(v)) {
      const spellLine = formatContainedSpellBrief(v)
      return { label: effectLabel, value: spellLine || null }
    }
    if (buff.effectType === 'ability_score' || buff.effectType === 'ability_override') {
      const parts = Object.entries(buff.value)
        .filter(([, v]) => v != null && v !== 0)
        .map(([k, val]) => {
          const nameZh = ABILITY_NAMES_ZH[k] ?? k
          const num = Number(val)
          if (buff.effectType === 'ability_override') return `${nameZh} ${num}`
          const sign = num >= 0 ? '+' : ''
          return `${nameZh} ${sign}${num}`
        })
      return { label: effectLabel, value: parts.length ? parts.join('、') : null }
    }
    if (buff.effectType === 'extra_damage_dice') {
      const str = typeof v === 'string' ? v.trim() : [' - ', v.minus, ' + ', v.plus, ' ', v.type].join('').replace(/\s+/g, ' ').trim()
      return { label: effectLabel, value: str || null }
    }
    const parts = Object.entries(v).filter(([k, val]) => k !== 'advantage' && val != null && val !== 0).map(([k, val]) => `${ABILITY_NAMES_ZH[k] ?? k}+${val}`)
    return { label: effectLabel, value: parts.length ? parts.join(', ') : null }
  }
  if (Array.isArray(buff.value) && buff.value.length) {
    const isDamageType = ['resist_type', 'immune_type', 'vulnerable_type', 'ignore_resistance'].includes(buff.effectType)
    const isCondition = buff.effectType === 'condition_immunity'
    const displayValue = isDamageType
      ? buff.value.map(getDamageTypeLabel).join('、')
      : isCondition
        ? buff.value.map(getConditionLabel).join('、')
        : buff.value.join(', ')
    return { label: effectLabel, value: displayValue }
  }
  if (buff.effectType === 'damage_piercing_traits' && buff.value && typeof buff.value === 'object' && !Array.isArray(buff.value)) {
    const str = formatDamagePiercingTraitsValue(buff.value)
    return { label: effectLabel, value: str || null }
  }
  return { label: effectLabel, value: buff.value != null ? String(buff.value) : null }
}

/** 数值是否为负数（用于红色高亮） */
function isNegativeValue(val) {
  if (val == null) return false
  const s = String(val)
  return s.startsWith('-') || (s.includes('-') && !s.startsWith('+'))
}

/**
 * 自动识别减益：显示值为负、或原始数值为负的条目归为减益栏。
 * 支持多效果 buff：任一效果为负则整条归为减益。
 */
export function isDebuff(buff, baseAbilities = {}) {
  if (Array.isArray(buff.effects) && buff.effects.length) {
    return buff.effects.some((e) => {
      const v = e.value
      if (typeof v === 'number' && v < 0) return true
      if (v && typeof v === 'object' && typeof v.val === 'number' && v.val < 0) return true
      const { value } = getEffectDisplay({ effectType: e.effectType, value: e.value }, baseAbilities)
      return isNegativeValue(value)
    })
  }
  const v = buff.value
  if (typeof v === 'number' && v < 0) return true
  if (v && typeof v === 'object' && typeof v.val === 'number' && v.val < 0) return true
  const { value } = getEffectDisplay(buff, baseAbilities)
  return isNegativeValue(value)
}

/**
 * 统一行布局：名字列（约7字宽） + 效果列（对齐） + 持续时间 + 操作
 */
const GRID_COLS = {
  withActions: 'grid-cols-[7em_1fr_auto_auto]',
  noActions: 'grid-cols-[7em_1fr_auto]',
}

/** 多效果时渲染为多组 (label, value) 胶囊（供 isDebuff 等内部用） */
function getEffectDisplays(buff, baseAbilities) {
  if (Array.isArray(buff.effects) && buff.effects.length) {
    return buff.effects.map((e) => getEffectDisplay({ effectType: e.effectType, value: e.value, customText: e.customText }, baseAbilities))
  }
  return [getEffectDisplay(buff, baseAbilities)]
}

export default function BuffListItem({ buff, baseAbilities, onEdit, onDelete, canEdit, standalone }) {
  const summaryLine = getBuffSummaryLine(buff, baseAbilities)
  const barIdx = summaryLine.indexOf(' | ')
  const sourceName = barIdx >= 0 ? summaryLine.slice(0, barIdx) : summaryLine
  const effectsStr = barIdx >= 0 ? summaryLine.slice(barIdx + 3) : ''

  return (
    <div
      className={`grid ${canEdit && !buff.fromItem ? GRID_COLS.withActions : GRID_COLS.noActions} items-center gap-x-2 px-1.5 min-h-[32px] py-0.5 h-full bg-[#202838]/36 ${standalone ? '' : 'border-b border-white/10 last:border-b-0'} ${!buff.enabled ? 'opacity-50' : ''}`}
      role="row"
    >
      {/* 名字：约 7 字宽，过长截断；来自装备时显示标签 */}
      <div className="min-w-0 shrink-0 w-[7em] overflow-hidden flex items-center gap-1">
        <span className="text-dnd-gold-light/95 text-sm truncate block" title={sourceName}>
          {sourceName}
        </span>
        {buff.fromItem && <span className="text-gray-500 text-[10px] shrink-0" title="来自装备/背包附魔">装备</span>}
      </div>
      {/* 效果：垂直对齐；负值红色 */}
      <div className="min-w-0">
        {effectsStr ? (
          <span className="text-gray-200 text-sm truncate block" title={effectsStr}>
            {effectsStr.split(/(-\d+)/g).map((part, i) =>
              part.match(/^-\d+$/) ? (
                <span key={i} className="text-red-400">{part}</span>
              ) : (
                part
              )
            )}
          </span>
        ) : null}
      </div>

      {/* 持续时间（可选，小字） */}
      <div className="shrink-0">
        <span className="text-gray-500 text-xs whitespace-nowrap" title={buff.duration || '—'}>
          {buff.duration || '—'}
        </span>
      </div>

      {/* 操作按钮（来自装备的附魔不可编辑/删除） */}
      {canEdit && !buff.fromItem && (
        <div className="flex items-center justify-end gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onEdit?.(buff.id)}
            className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-dnd-gold transition-colors"
            title="编辑"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(buff.id)}
            className="p-1 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-500 transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
