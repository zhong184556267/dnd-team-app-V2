import { Trash2, Pencil } from 'lucide-react'
import { getEffectInfo, getDamageTypeLabel, getConditionLabel, ABILITY_NAMES_ZH } from '../data/buffTypes'

/** 效果描述 + 数值（用于胶囊）；属性用中文名并显示扣除后的总值 */
function getEffectDisplay(buff, baseAbilities = {}) {
  const info = getEffectInfo(buff.effectType)
  if (!info) return { label: '—', value: buff.value != null ? String(buff.value) : null }
  if (buff.effectType.startsWith('custom_')) return { label: buff.value ? String(buff.value) : '—', value: null }
  const effectLabel = info.effect.label ?? buff.effectType

  if (info.effect.dataType === 'boolean') {
    return { label: effectLabel, value: buff.value ? '优势' : null }
  }
  if (info.effect.dataType === 'number' && typeof buff.value === 'number') {
    const sign = buff.value >= 0 ? '+' : ''
    return { label: effectLabel, value: `${sign}${buff.value}` }
  }
  if (info.effect.dataType === 'object' && buff.value) {
    if (buff.value.type && typeof buff.value.val === 'number') {
      const sign = buff.value.val >= 0 ? '+' : ''
      const typeLabel = getDamageTypeLabel(buff.value.type)
      return { label: `${effectLabel}(${typeLabel})`, value: `${sign}${buff.value.val}` }
    }
    // 属性值增强：显示加减值（如 智力 +2）；属性值上限：显示设定总值（如 智力 18）
    if (buff.effectType === 'ability_score' || buff.effectType === 'ability_override') {
      const parts = Object.entries(buff.value)
        .filter(([, v]) => v != null && v !== 0)
        .map(([k, v]) => {
          const nameZh = ABILITY_NAMES_ZH[k] ?? k
          const num = Number(v)
          if (buff.effectType === 'ability_override') {
            return `${nameZh} ${num}` // 上限：显示设定总值
          }
          const sign = num >= 0 ? '+' : ''
          return `${nameZh} ${sign}${num}` // 增强：显示加减值
        })
      return { label: effectLabel, value: parts.length ? parts.join('、') : null }
    }
    const parts = Object.entries(buff.value).filter(([, v]) => v != null && v !== 0).map(([k, v]) => `${ABILITY_NAMES_ZH[k] ?? k}+${v}`)
    return { label: effectLabel, value: parts.length ? parts.join(', ') : null }
  }
  if (Array.isArray(buff.value) && buff.value.length) {
    const isDamageType = ['resist_type', 'immune_type', 'vulnerable_type'].includes(buff.effectType)
    const isCondition = buff.effectType === 'condition_immunity'
    const displayValue = isDamageType
      ? buff.value.map(getDamageTypeLabel).join('、')
      : isCondition
        ? buff.value.map(getConditionLabel).join('、')
        : buff.value.join(', ')
    return { label: effectLabel, value: displayValue }
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
 * 无需在表单里选择“增益/减益”，根据数值正负自动分栏。
 */
export function isDebuff(buff, baseAbilities = {}) {
  const v = buff.value
  if (typeof v === 'number' && v < 0) return true
  if (v && typeof v === 'object' && typeof v.val === 'number' && v.val < 0) return true
  const { value } = getEffectDisplay(buff, baseAbilities)
  return isNegativeValue(value)
}

/**
 * 统一行布局：固定列宽 Grid，同列内所有行严格垂直对齐。
 * 窄屏用 min-width 允许收缩，桌面用固定宽度。
 */
const GRID_COLS = {
  withActions: 'grid-cols-[minmax(10rem,1fr)_5.5rem_4.5rem_4rem]',
  noActions: 'grid-cols-[minmax(10rem,1fr)_5.5rem_4.5rem]',
}

export default function BuffListItem({ buff, baseAbilities, onEdit, onDelete, canEdit, standalone }) {
  const { label, value } = getEffectDisplay(buff, baseAbilities)
  const sourceLabel = buff.source?.trim() || '未知来源'

  return (
    <div
      className={`grid ${canEdit ? GRID_COLS.withActions : GRID_COLS.noActions} items-center gap-x-1.5 px-2 min-h-[36px] py-1 h-full bg-gray-800/30 ${standalone ? '' : 'border-b border-gray-800 last:border-b-0'} ${!buff.enabled ? 'opacity-50' : ''}`}
      role="row"
    >
      {/* 列1：名称（来源）+ 效果类型（左对齐，无背景色块） */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-amber-400 text-sm font-medium shrink-0 truncate" title={sourceLabel}>
          {sourceLabel}
        </span>
        <span className="text-gray-400 text-sm min-w-0 truncate" title={label}>
          {label}
        </span>
      </div>

      {/* 列2：数值（左对齐贴近词条、等宽字体） */}
      <div className="flex items-center justify-start min-w-0">
        {value != null ? (
          <span
            className={`font-mono font-bold text-sm px-2 py-0.5 rounded whitespace-nowrap truncate max-w-full text-left ${
              isNegativeValue(value)
                ? 'bg-red-900/50 text-red-400'
                : 'bg-gray-700 text-white'
            }`}
            title={value}
          >
            {value}
          </span>
        ) : null}
      </div>

      {/* 列3：持续时间（右对齐） */}
      <div className="flex items-center justify-end min-w-0">
        <span className="text-gray-500 text-xs truncate" title={buff.duration || '—'}>
          {buff.duration || '—'}
        </span>
      </div>

      {/* 列4：操作按钮（右对齐） */}
      {canEdit && (
        <div className="flex items-center justify-end gap-1">
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
