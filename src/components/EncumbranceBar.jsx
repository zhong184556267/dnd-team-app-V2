import { useEncumbrance } from '../hooks/useEncumbrance'
import { ENCUMBRANCE_MULTIPLIER } from '../lib/encumbrance'

/**
 * 负重条：当前重量 / 最大重量 (lbs)，按百分比变色（绿/黄/红）
 * multiplier 默认 15（强壮等特性可传 30）
 */
export default function EncumbranceBar({ character, multiplier = ENCUMBRANCE_MULTIPLIER }) {
  const { total, max, percent, statusColor, statusLabel } = useEncumbrance(character, multiplier)

  const barColor =
    statusColor === 'red'
      ? 'bg-red-500'
      : statusColor === 'yellow'
        ? 'bg-amber-500'
        : 'bg-emerald-500'

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0 h-6 rounded-full bg-gray-800 border border-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <span className="text-sm font-mono text-dnd-text-body shrink-0 tabular-nums whitespace-nowrap">
        {total} / {max} lbs
      </span>
      <span
        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${
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
