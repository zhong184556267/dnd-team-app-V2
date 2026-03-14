import { CURRENCY_CONFIG, getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'

/** 核心资产：奥拉 | 金币(居中最大) | 晶石 */
const CORE_IDS = ['au', 'gp', 'gem_lb']
/** 零钱：铜币、银币、克朗、铂金币 */
const PETTY_IDS = ['cp', 'sp', 'kr', 'pp']

function formatAmount(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '0'
  return Number.isInteger(amount) ? amount.toLocaleString() : amount.toFixed(2)
}

/** 核心资产区单卡：金币 / 奥拉 / 晶石；compact 时仅略大于零钱区 */
function CoreCurrencyCard({ currencyId, amount, compact }) {
  const cfg = getCurrencyById(currencyId)
  if (!cfg) return null
  const isGold = cfg.style === 'gold'
  const isAurum = cfg.style === 'aurum'
  const isCrystal = cfg.style === 'crystal'
  const unitLabel = getCurrencyDisplayName(cfg)

  let cardClass = 'rounded border flex flex-col justify-center items-center gap-0 min-h-0 '
  cardClass += compact ? 'px-1.5 py-1 ' : 'rounded-lg px-2.5 py-2 gap-0.5 '
  let valueClass = 'font-bold tabular-nums '
  valueClass += compact ? 'text-sm ' : 'text-base sm:text-lg '
  if (isGold) {
    cardClass += 'bg-gradient-to-br from-amber-950/60 to-amber-950/40 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]'
    valueClass += 'text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]'
  } else if (isAurum) {
    cardClass += 'bg-orange-950/40 border-orange-400/50 shadow-[0_0_10px_rgba(251,146,60,0.12)]'
    valueClass += 'text-orange-200'
  } else if (isCrystal) {
    cardClass += 'bg-cyan-950/40 border-cyan-400/50 shadow-[0_0_10px_rgba(34,211,238,0.12)]'
    valueClass += 'text-cyan-200'
  } else {
    cardClass += 'bg-gray-800/60 border-white/10'
    valueClass += 'text-dnd-text-body'
  }

  return (
    <div className={cardClass}>
      <span className={valueClass}>{formatAmount(amount)}</span>
      <span className={compact ? 'text-[9px] opacity-90 text-current font-medium leading-tight' : 'text-[10px] opacity-90 text-current font-medium leading-tight'}>{unitLabel}</span>
    </div>
  )
}

/** 零钱区单条：铜/银/铂；compact 时更小 */
function PettyCurrencyItem({ currencyId, amount, compact }) {
  const cfg = getCurrencyById(currencyId)
  if (!cfg) return null
  const unitLabel = getCurrencyDisplayName(cfg)
  const wrapClass = compact
    ? 'flex items-center justify-between gap-1.5 rounded bg-gray-800/50 border border-white/5 px-2 py-1'
    : 'flex items-center justify-between gap-3 rounded-lg bg-gray-800/50 border border-white/5 px-3 py-2'
  return (
    <div className={wrapClass}>
      <span className="text-dnd-text-muted text-xs font-medium">{unitLabel}</span>
      <span className={compact ? 'text-xs font-semibold text-gray-300 tabular-nums' : 'text-sm font-semibold text-gray-300 tabular-nums'}>{formatAmount(amount)}</span>
    </div>
  )
}

/**
 * 分层货币仪表盘：核心资产区（金币/奥拉/晶石）+ 零钱区（铜/银/铂）
 * 统一深色容器，内部有明确分区与层级
 */
export function CurrencyGrid({ balances, title, extraClass = '', titleClass, fillHeight }) {
  const compact = fillHeight
  const innerClass = fillHeight
    ? 'px-1.5 pt-0 pb-0 h-full flex flex-col min-h-0'
    : 'p-2 pt-0 space-y-2'
  const coreWrapClass = fillHeight
    ? 'rounded bg-gradient-to-b from-amber-950/20 to-transparent border border-amber-500/20 p-1 flex-1 min-h-0 flex flex-col justify-center'
    : 'rounded-lg bg-gradient-to-b from-amber-950/20 to-transparent border border-amber-500/20 p-1.5'
  const coreGridGap = fillHeight ? 'gap-1' : 'gap-1.5'
  const pettyGap = fillHeight ? 'gap-1' : 'gap-2'
  return (
    <div className={`rounded-xl bg-dnd-card border border-white/10 overflow-hidden ${fillHeight ? 'h-full' : ''} ${extraClass}`}>
      {title && (
        <h3 className={titleClass ?? 'text-dnd-text-muted text-xs font-bold uppercase tracking-wider px-3 pt-3 pb-1.5'}>
          {title}
        </h3>
      )}
      <div className={innerClass}>
        {/* 核心资产区：三货币紧凑横排 */}
        <div className={coreWrapClass}>
          <div className={`grid grid-cols-3 ${coreGridGap}`}>
            {CORE_IDS.map((id) => (
              <CoreCurrencyCard key={id} currencyId={id} amount={balances?.[id] ?? 0} compact={compact} />
            ))}
          </div>
        </div>
        {/* 零钱区：平铺对齐核心区宽度，四项等分 */}
        <div className={`grid grid-cols-4 shrink-0 ${pettyGap}`}>
          {PETTY_IDS.map((id) => (
            <PettyCurrencyItem key={id} currencyId={id} amount={balances?.[id] ?? 0} compact={compact} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** 单种货币显示（兼容旧用法：选择器、弹窗等小范围展示） */
export function CurrencyBlock({ currencyId, amount, label }) {
  const cfg = getCurrencyById(currencyId)
  if (!cfg) return null
  const isGold = cfg.style === 'gold'
  const isAurum = cfg.style === 'aurum'
  const isCrystal = cfg.style === 'crystal'
  const isMuted = cfg.style === 'muted'
  const unitLabel = getCurrencyDisplayName(cfg)

  let blockClass = 'rounded-lg border px-3 py-2 text-right '
  if (isGold) {
    blockClass += 'bg-gradient-to-br from-amber-900/40 to-amber-950/40 border-amber-500/50 text-amber-200 font-bold text-lg shadow-[0_0_12px_rgba(245,158,11,0.25)]'
  } else if (isAurum) {
    blockClass += 'bg-orange-950/30 border-orange-400/50 text-orange-200 font-semibold border-2 shadow-[0_0_8px_rgba(251,146,60,0.2)]'
  } else if (isCrystal) {
    blockClass += 'bg-cyan-950/30 border-cyan-400/50 text-cyan-200 font-semibold border-2 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
  } else if (isMuted) {
    blockClass += 'bg-gray-800/60 border-white/5 text-gray-400 text-sm'
  } else {
    blockClass += 'bg-gray-800/60 border-white/10 text-dnd-text-body'
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      {label && <span className="text-dnd-text-muted text-xs">{label}</span>}
      <div className={blockClass}>
        <span>{formatAmount(amount)}</span>
        <span className="ml-1 opacity-90 text-sm font-normal">{unitLabel}</span>
      </div>
    </div>
  )
}
