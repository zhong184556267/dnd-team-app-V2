/**
 * 统一输入框样式（与截图风格一致：深底、圆角、橙色聚焦）
 */
const base =
  'w-full rounded-lg border text-sm min-w-0 placeholder:opacity-70 disabled:opacity-70 focus:outline-none focus:ring-2'

/** 单行输入框（背景/边框/文字用 CSS 变量，在 index.css 中定义） */
export const inputClass =
  base + ' h-10 px-3 bg-[var(--input-bg)] border-[var(--border-color)] text-[var(--text-main)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-[var(--accent)]'

/** 去掉 w-full，用于行内多列布局；避免与 w-8 / flex-1 等宽度类冲突导致控件被撑满一行 */
export const inputClassInline = inputClass.replace(/\bw-full\b/, '').trim()

/** 多行文本框 */
export const textareaClass =
  base + ' px-3 py-2 resize-y min-h-[3rem] bg-[var(--input-bg)] border-[var(--border-color)] text-[var(--text-main)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-[var(--accent)]'

/** 可选：标签样式（强调色） */
export const labelClass = 'block uppercase tracking-wider text-xs font-bold mb-2 text-[var(--accent)]'
