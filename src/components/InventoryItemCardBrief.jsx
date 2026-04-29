import { ChevronDown } from 'lucide-react'
import {
  inventoryItemBriefChevronBtnClass,
  inventoryItemBriefExpandedBodyClass,
  inventoryItemBriefExpandedMutedClass,
  inventoryItemBriefIsExpandable,
} from '../lib/inventoryItemCardStyles'

/** 名称行内：有详情时显示折叠钮；点击勿冒泡以免触发拖拽 */
export function InventoryItemBriefChevron({ brief, expanded, onToggle }) {
  if (!inventoryItemBriefIsExpandable(brief)) return null
  return (
    <button
      type="button"
      className={inventoryItemBriefChevronBtnClass}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={expanded}
      aria-label={expanded ? '收起详情' : '展开详情'}
      title={expanded ? '收起详情' : '展开详情'}
    >
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
    </button>
  )
}

/** 主行下方：展开时显示完整说明（默认不渲染 = 折叠） */
export function InventoryItemBriefExpandedText({ brief, expanded, variant = 'body' }) {
  if (!expanded || !inventoryItemBriefIsExpandable(brief)) return null
  const cls = variant === 'muted' ? inventoryItemBriefExpandedMutedClass : inventoryItemBriefExpandedBodyClass
  return <p className={cls}>{String(brief).trim()}</p>
}
