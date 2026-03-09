/**
 * 统一输入框样式（与「详细描述」等舒适输入一致）
 * 红框聚焦、圆角、深底、适中内边距，避免输入中断
 */
const base =
  'w-full rounded-lg bg-gray-800 text-white border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500 disabled:opacity-70 text-sm'

/** 单行输入框 */
export const inputClass = base + ' h-10 min-w-0 px-3'

/** 多行文本框（与详细描述一致：可拉高、最小高度） */
export const textareaClass = base + ' px-3 py-2 resize-y min-h-[3rem]'

/** 可选：标签样式 */
export const labelClass = 'block text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-2'
