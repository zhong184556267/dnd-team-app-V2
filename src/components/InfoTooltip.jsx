/**
 * 通用悬停提示组件
 * 鼠标移入 trigger 区域时，以 React Portal 渲染一个浮层显示详细内容。
 * 用于：武技、装备栏、背包物品、职业特性、专长等条目的详细说明。
 *
 * 特性：
 * - Portal 到 document.body，规避父级 overflow:hidden / z-index 截断
 * - 自动方向：上方空间不足时翻转到下方
 * - 自动水平对齐：超出视口边缘时夹紧到边界
 * - pointer-events:none，鼠标移到浮层上不会触发闪烁
 * - 不阻塞子元素的 click（如展开/删除按钮）
 */
import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

const TOOLTIP_Z = 9999
const VIEWPORT_PADDING = 8

export default function InfoTooltip({
  content,
  children,
  /** 触发区域附加类名（如需让整段文字都可 hover 而不仅是文字本身） */
  triggerClassName = '',
  /** 浮层最大宽度（px） */
  maxWidth = 420,
  /** 浮层附加类名 */
  tooltipClassName = '',
  /** 显示延迟（ms），避免快速划过时闪烁 */
  showDelay = 80,
  /** 是否禁用（如某些条目信息缺失则不显示） */
  disabled = false,
}) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: maxWidth })
  const triggerRef = useRef(null)
  const showTimer = useRef(null)

  const handleEnter = useCallback(() => {
    if (disabled) return
    if (showTimer.current) clearTimeout(showTimer.current)
    showTimer.current = setTimeout(() => {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = Math.min(maxWidth, vw - VIEWPORT_PADDING * 2)
      // 水平：默认相对 trigger 中心居中，超出视口则夹紧
      let left = rect.left + rect.width / 2 - w / 2
      if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING
      if (left + w > vw - VIEWPORT_PADDING) left = vw - VIEWPORT_PADDING - w
      // 垂直：默认上方 8px，空间不足则放下方
      let top = rect.top - 8
      const estimatedHeight = 220 // 估算高度用于判断翻转
      if (top - estimatedHeight < VIEWPORT_PADDING) {
        top = rect.bottom + 8
      }
      // 顶部夹紧（避免极长内容超出底部）
      if (top + estimatedHeight > vh - VIEWPORT_PADDING) {
        top = Math.max(VIEWPORT_PADDING, vh - VIEWPORT_PADDING - estimatedHeight)
      }
      setPos({ top, left, width: w })
      setVisible(true)
    }, showDelay)
  }, [disabled, maxWidth, showDelay])

  const handleLeave = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
    setVisible(false)
  }, [])

  if (disabled) {
    return <span className={triggerClassName}>{children}</span>
  }

  return (
    <span
      ref={triggerRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className={`inline-flex ${triggerClassName}`}
      style={{ cursor: 'help' }}
    >
      {children}
      {visible &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              width: `${pos.width}px`,
              zIndex: TOOLTIP_Z,
              pointerEvents: 'none',
            }}
            className={`rounded-lg border border-gray-600 bg-[#1a2430]/97 backdrop-blur-sm p-3 text-xs text-gray-200 shadow-2xl shadow-black/60 max-h-[60vh] overflow-y-auto ${tooltipClassName}`}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  )
}
