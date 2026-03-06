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
    // 属性值增强/设定：用中文名，数值显示扣除后的总值
    if (buff.effectType === 'ability_score' || buff.effectType === 'ability_override') {
      const parts = Object.entries(buff.value)
        .filter(([, v]) => v != null && v !== 0)
        .map(([k, v]) => {
          const nameZh = ABILITY_NAMES_ZH[k] ?? k
          const base = baseAbilities[k] ?? 10
          const effective = buff.effectType === 'ability_override' ? Number(v) : base + Number(v)
          return `${nameZh} ${effective}`
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

export default function BuffListItem({ buff, baseAbilities, onEdit, onDelete, canEdit }) {
  const { label, value } = getEffectDisplay(buff, baseAbilities)

  return (
    <div
      className={`flex items-center flex-nowrap gap-2 px-2 h-[44px] border-b border-gray-800 last:border-b-0 bg-gray-800/30 ${!buff.enabled ? 'opacity-50' : ''}`}
    >
      {/* 名称 | 效果词条+数值 | 时间，三列平均分配，名称预留约 8 字宽 */}
      <div className="min-w-0 flex-1 flex items-center gap-2 flex-nowrap overflow-hidden">
        <span className="text-white font-bold text-sm truncate flex-1 min-w-[8em]" title={buff.source}>{buff.source}</span>
        <span className="text-gray-400 text-sm flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          <span className="truncate min-w-0" title={label}>{label}</span>
          <span className="shrink-0 w-12 text-right">
            {value != null ? (
              <span
                className={`inline-block font-mono font-bold text-sm px-2 py-0.5 rounded ${
                  isNegativeValue(value)
                    ? 'bg-red-900/50 text-red-400'
                    : 'bg-gray-700 text-white'
                }`}
              >
                {value}
              </span>
            ) : null}
          </span>
        </span>
        <span className="text-gray-500 text-xs truncate flex-1 min-w-0 text-right" title={buff.duration || '—'}>
          {buff.duration || '—'}
        </span>
      </div>

      {/* 右侧：分隔线 + 操作区 */}
      {canEdit && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-gray-600 text-sm">—</span>
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
