import { MoreVertical } from 'lucide-react'

/**
 * 全站统一的拖拽/排序手柄：竖排三点（⋮），与背包表一致。
 */
export default function DragHandleIcon({ className = '', ...rest }) {
  /** pointer-events-none：让拖动从最近的 draggable 祖先生效，避免 SVG 在 WebKit 下吞掉 drag */
  return <MoreVertical className={`pointer-events-none ${className}`.trim()} aria-hidden {...rest} />
}
