import { useEncumbrance } from '../hooks/useEncumbrance'
import { ENCUMBRANCE_MULTIPLIER, formatDisplayOneDecimal } from '../lib/encumbrance'

/**
 * 负重条：当前重量 / 最大重量 (lbs)，按百分比变色（绿/黄/红）
 * multiplier 默认 15（强壮等特性可传 30）
 */
export default function EncumbranceBar({ character, multiplier = ENCUMBRANCE_MULTIPLIER }) {
  const { total, max, percent, statusColor, statusLabel } = useEncumbrance(character, multiplier)

  // 使用内联颜色，避免主题/CSS 导致 Tailwind 语义色与轨道同色；NaN 时仍有合法宽度
  const fillColor =
    statusColor === 'red'
      ? '#ef4444'
      : statusColor === 'yellow'
        ? 'var(--accent-gold, #c79a42)'
        : '#22c55e'
  const pct = Number.isFinite(Number(percent)) ? Math.min(100, Math.max(0, Number(percent))) : 0
  const displayMax = Number.isFinite(Number(max)) ? formatDisplayOneDecimal(max) : '—'
  const displayTotal = formatDisplayOneDecimal(Number(total) || 0)

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 h-5 rounded-full bg-[#1b2738] border border-white/15 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            minWidth: pct > 0 ? '6px' : 0,
            backgroundColor: fillColor,
            boxShadow: pct > 0 ? `0 0 10px ${fillColor}66` : undefined,
          }}
        />
      </div>
      <span className="text-xs font-mono text-dnd-text-body shrink-0 tabular-nums whitespace-nowrap">
        {displayTotal} / {displayMax} lbs
      </span>
      <span
        className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
          statusColor === 'red'
            ? 'bg-red-900/40 text-red-300'
            : statusColor === 'yellow'
              ? 'bg-amber-900/40 text-amber-300'
              : 'bg-emerald-900/40 text-emerald-300'
        }`}
      >
        {statusLabel}
      </span>
    </div>
  )
}
