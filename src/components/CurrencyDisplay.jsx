import { useState, useEffect, useRef } from 'react'
import DragHandleIcon from './DragHandleIcon'
import { getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { inputClass } from '../lib/inputStyles'
import { formatDisplayOneDecimal } from '../lib/encumbrance'

/** 核心三币 + 零钱四币（四币不常用：统一样式、更紧凑、固定一行四列） */
const CORE_WALLET_IDS = ['au', 'gp', 'gem_lb']
const PETTY_WALLET_IDS = ['cp', 'sp', 'kr', 'pp']

/** 零钱四币共用：细灰边，避免克朗/铂金币 standard 样式过亮、与铜银不一致 */
const PETTY_TILE_UNIFIED = {
  card: 'bg-[#151b24]/90 border border-gray-600/40',
  value: 'text-gray-200',
}

function walletTileClasses(style) {
  switch (style) {
    case 'gold':
      return { card: 'border border-dnd-gold/55 bg-[#2b1f17]/60', value: 'text-dnd-gold-light' }
    case 'aurum':
      return { card: 'border border-dnd-gold/45 bg-[#1b2230]/60', value: 'text-dnd-gold-light' }
    case 'crystal':
      return { card: 'border border-cyan-400/45 bg-[#0d2a3a]/60', value: 'text-cyan-200' }
    case 'muted':
      return { card: 'border border-gray-600/45 bg-[#1a1f26]/75', value: 'text-gray-200' }
    case 'standard':
    default:
      return { card: 'border border-amber-600/35 bg-[#252018]/55', value: 'text-amber-100/95' }
  }
}

function formatAmount(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '0'
  if (Number.isInteger(amount)) return amount.toLocaleString()
  return formatDisplayOneDecimal(amount)
}

/** 拖入次元袋：与个人持有格子配合，替代原背包内货币行的拖拽 */
function WalletCurrencyDragHandle({ currencyId, small }) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/dnd-wallet-currency', currencyId)
        e.dataTransfer.setData('text/plain', `wc:${currencyId}`)
        e.dataTransfer.effectAllowed = 'copyMove'
        e.currentTarget.classList.add('opacity-50')
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('opacity-50')}
      className="inline-flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-dnd-text-muted hover:text-dnd-gold-light/85 touch-none"
      title="拖入次元袋"
      aria-label="拖入次元袋"
      role="presentation"
    >
      <DragHandleIcon className={`${small ? 'w-3 h-3' : 'w-3.5 h-3.5'} opacity-70 text-dnd-text-muted`} />
    </span>
  )
}

/** 可输入金额：支持光标编辑，失焦/回车提交（背包表格 / 个人持有共用） */
export function CurrencyAmountField({ currencyId, amount, compact, micro, valueClass, onCommit }) {
  const isGem = currencyId === 'gem_lb'
  const [text, setText] = useState('')
  const committedRef = useRef(false)
  useEffect(() => {
    const n = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0
    setText(isGem ? formatDisplayOneDecimal(n) : Math.floor(n).toLocaleString())
    committedRef.current = false
  }, [amount, isGem])

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const raw = text.trim().replace(/,/g, '')
    if (raw === '') {
      onCommit?.(currencyId, 0)
      setText(isGem ? '0' : '0')
      return
    }
    const n = isGem ? parseFloat(raw) : parseInt(raw, 10)
    if (Number.isNaN(n)) return
    const v = isGem ? Math.round(Math.max(0, n) * 10) / 10 : Math.max(0, n)
    onCommit?.(currencyId, v)
    setText(isGem ? formatDisplayOneDecimal(v) : Math.floor(v).toLocaleString())
  }

  const sizeCls = micro
    ? '!h-6 !py-0 !px-0.5 text-[11px] !bg-transparent !border-gray-600/45'
    : compact
      ? '!h-7 text-sm border-white/15 bg-black/25'
      : '!h-8 text-sm sm:text-base border-white/15 bg-black/25'

  return (
    <input
      type="text"
      inputMode={isGem ? 'decimal' : 'numeric'}
      autoComplete="off"
      className={`${inputClass} w-full min-w-0 text-center tabular-nums ${sizeCls} ${valueClass}`}
      value={text}
      onChange={(e) => {
        const v = e.target.value
        if (isGem) {
          if (v === '' || /^\d*\.?\d*$/.test(v.replace(/,/g, ''))) setText(v.replace(/,/g, ''))
        } else if (v === '' || /^\d*$/.test(v.replace(/,/g, ''))) {
          setText(v.replace(/,/g, ''))
        }
      }}
      onFocus={() => setText((t) => t.replace(/,/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          e.target.blur()
        }
      }}
    />
  )
}

/** 单币种小卡。variant=petty：铜银克朗铂统一灰系、更扁、一行四列用 */
function WalletCurrencyCard({
  currencyId,
  amount,
  compact,
  variant = 'core',
  editable,
  onCurrencyChange,
  dragCurrencyToBag,
}) {
  const cfg = getCurrencyById(currencyId)
  if (!cfg) return null
  const isPetty = variant === 'petty'
  const { card, value } = isPetty ? PETTY_TILE_UNIFIED : walletTileClasses(cfg.style)
  const unitLabel = getCurrencyDisplayName(cfg)

  const sizePad = isPetty
    ? 'px-1 py-1 rounded-md'
    : compact
      ? 'px-1.5 py-1.5 rounded-md'
      : 'px-2.5 py-2 rounded-lg gap-0.5'

  let valueClass = `font-bold tabular-nums w-full min-w-0 ${value} `
  if (isPetty) {
    valueClass += 'text-xs '
  } else {
    valueClass += compact ? 'text-sm ' : 'text-base sm:text-lg '
  }

  const rowAlign = !dragCurrencyToBag ? 'flex-col items-center' : isPetty ? 'flex-row items-center' : 'flex-row items-start'

  return (
    <div className={`flex flex-col justify-center items-center min-h-0 min-w-0 ${sizePad} ${card}`}>
      <div className={`flex w-full min-w-0 gap-0.5 ${rowAlign}`}>
        {dragCurrencyToBag ? <WalletCurrencyDragHandle currencyId={currencyId} small={isPetty} /> : null}
        <div
          className={`flex flex-col justify-center items-center min-h-0 flex-1 min-w-0 ${dragCurrencyToBag && !isPetty ? 'pt-0.5' : ''} ${isPetty ? 'gap-px' : 'gap-0'}`}
        >
          {editable && onCurrencyChange ? (
            <CurrencyAmountField
              currencyId={currencyId}
              amount={amount}
              compact={compact && !isPetty}
              micro={isPetty}
              valueClass={valueClass}
              onCommit={onCurrencyChange}
            />
          ) : (
            <span className={valueClass + ' text-center'}>{formatAmount(amount)}</span>
          )}
          <span
            className={
              isPetty
                ? 'text-[8px] text-gray-400 font-medium leading-tight text-center mt-0.5 pb-px'
                : compact
                  ? 'text-[9px] opacity-90 text-current font-medium leading-tight text-center'
                  : 'text-[10px] opacity-90 text-current font-medium leading-tight text-center'
            }
          >
            {unitLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * 钱包 / 团队金库等：外层一张卡；内为 7 种货币各一张小卡（同布局）
 * @param embedded 为真时不渲染外层卡壳（由父级「钱包」等分区包住）
 */
export function CurrencyGrid({
  balances,
  title,
  subtitle,
  extraClass = '',
  titleClass,
  fillHeight,
  embedded = false,
  editable = false,
  onCurrencyChange,
  dragCurrencyToBag = false,
}) {
  const compact = !!fillHeight
  const wrapPad = compact ? 'p-1.5 space-y-1.5' : 'p-2 space-y-2'
  const coreGrid = compact ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-3 gap-2'
  const pettyGrid = compact ? 'grid grid-cols-4 gap-1' : 'grid grid-cols-4 gap-1.5'

  const grid = (
    <div className={wrapPad}>
      <div className={coreGrid}>
        {CORE_WALLET_IDS.map((id) => (
          <WalletCurrencyCard
            key={id}
            currencyId={id}
            amount={balances?.[id] ?? 0}
            compact={compact}
            variant="core"
            editable={editable}
            onCurrencyChange={onCurrencyChange}
            dragCurrencyToBag={dragCurrencyToBag}
          />
        ))}
      </div>
      <div className={pettyGrid}>
        {PETTY_WALLET_IDS.map((id) => (
          <WalletCurrencyCard
            key={id}
            currencyId={id}
            amount={balances?.[id] ?? 0}
            compact={compact}
            variant="petty"
            editable={editable}
            onCurrencyChange={onCurrencyChange}
            dragCurrencyToBag={dragCurrencyToBag}
          />
        ))}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className={`min-w-0 flex flex-col ${fillHeight ? 'flex-1 min-h-0' : ''} ${extraClass}`}>
        <div className={fillHeight ? 'flex-1 min-h-0 overflow-y-auto min-w-0' : 'min-w-0'}>{grid}</div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl bg-dnd-card border border-white/10 overflow-hidden ${fillHeight ? 'h-full' : ''} ${extraClass}`}>
      {title || subtitle ? (
        <div className="border-b border-white/10 px-3 pt-3 pb-2.5 space-y-1.5">
          {title ? (
            <h3 className={titleClass ?? 'text-dnd-text-muted text-xs font-bold uppercase tracking-wider mb-0'}>{title}</h3>
          ) : null}
          {subtitle ? <div className="text-[10px] text-dnd-text-muted leading-snug">{subtitle}</div> : null}
        </div>
      ) : null}
      {grid}
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
    blockClass += 'bg-[#2b1f17]/60 border-dnd-gold/55 text-dnd-gold-light font-bold text-lg'
  } else if (isAurum) {
    blockClass += 'bg-[#1b2230]/60 border-dnd-gold/45 text-dnd-gold-light font-semibold'
  } else if (isCrystal) {
    blockClass += 'bg-[#0d2a3a]/60 border-cyan-400/50 text-cyan-200 font-semibold'
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
