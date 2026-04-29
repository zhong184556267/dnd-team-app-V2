import { useState, useEffect } from 'react'
import { Plus, Minus, ArrowRightLeft } from 'lucide-react'
import { useModule } from '../contexts/ModuleContext'
import { convertCurrency, loadTeamVaultIntoCache, getTeamVault, setTeamVault } from '../lib/currencyStore'
import { getEffectiveTeamVaultBalances, deductTeamCurrency, convertEffectiveTeamCurrency, sumWarehouseWalletBalances, sumPublicBagWalletBalances } from '../lib/teamCurrencyPublicBags'
import { loadWarehouseIntoCache, addWarehouseCurrencyStack, tryConsumeWarehouseCurrencyStacks } from '../lib/warehouseStore'
import { CURRENCY_CONFIG, getCurrencyDisplayName } from '../data/currencyConfig'
import { CurrencyGrid } from './CurrencyDisplay'

/** 去掉千分位逗号（半角/全角）供解析 */
function stripNumberGrouping(s) {
  return String(s ?? '').replace(/,/g, '').replace(/，/g, '')
}

/**
 * 数值输入时插入千分位逗号；金库兑换仍允许输入「全部」。
 * 支持小数（如晶石磅数）。
 */
function formatAmountInputWithCommas(raw) {
  const t = String(raw ?? '').trim()
  if (/^全部$/i.test(t)) return t
  let s = stripNumberGrouping(t).replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  let intRaw = dot === -1 ? s : s.slice(0, dot)
  let frac = dot === -1 ? '' : s.slice(dot + 1).replace(/\./g, '')
  const trailingDot = dot !== -1 && dot === s.length - 1 && frac === ''

  if (s === '') return ''
  if (s === '.') return '0.'

  let intDisp = ''
  if (intRaw !== '') {
    const n = parseInt(intRaw, 10)
    intDisp = Number.isNaN(n) ? intRaw : n.toLocaleString('en-US')
  } else if (frac !== '' || trailingDot) {
    intDisp = '0'
  }

  if (trailingDot && frac === '') return `${intDisp}.`
  if (frac !== '') return `${intDisp}.${frac}`
  return intDisp
}

/** 团队仓库页用：金库兑换 + 金库 +/- 输入 + 团队金库展示 */
export default function CurrencyPanel({ variant = 'panel', showControls = true, showTotals = true }) {
  const { currentModuleId } = useModule()
  const [vault, setVault] = useState({})
  const [sign, setSign] = useState('+')
  const [amountInput, setAmountInput] = useState('')
  const [currencyId, setCurrencyId] = useState('gp')
  const [error, setError] = useState('')
  // 金库兑换
  const [convertFrom, setConvertFrom] = useState('gem_lb')
  const [convertTo, setConvertTo] = useState('au')
  const [convertAmount, setConvertAmount] = useState('')
  const [convertError, setConvertError] = useState('')

  const refresh = () => setVault(getEffectiveTeamVaultBalances(currentModuleId))

  useEffect(() => {
    if (!currentModuleId) return
    Promise.all([loadTeamVaultIntoCache(currentModuleId), loadWarehouseIntoCache(currentModuleId)]).then(() => refresh())
  }, [currentModuleId])

  useEffect(() => {
    const h = () => refresh()
    window.addEventListener('dnd-realtime-team-vault', h)
    window.addEventListener('dnd-realtime-warehouse', h)
    window.addEventListener('dnd-realtime-characters', h)
    return () => {
      window.removeEventListener('dnd-realtime-team-vault', h)
      window.removeEventListener('dnd-realtime-warehouse', h)
      window.removeEventListener('dnd-realtime-characters', h)
    }
  }, [currentModuleId])

  useEffect(() => {
    if (convertFrom === convertTo) {
      const other = CURRENCY_CONFIG.find((c) => c.id !== convertFrom)
      setConvertTo(other?.id ?? 'gp')
    }
  }, [convertFrom, convertTo])

  const handleApply = () => {
    setError('')
    const num = parseFloat(stripNumberGrouping(amountInput))
    if (Number.isNaN(num) || num <= 0) {
      setError('请输入有效数量')
      return
    }
    if (sign === '+') {
      Promise.resolve(addWarehouseCurrencyStack(currentModuleId, currencyId, num)).then((result) => {
        if (result.success) {
          refresh()
          setAmountInput('')
        } else {
          setError(result.error || '操作失败')
        }
      })
      return
    }
    Promise.resolve(deductTeamCurrency(currentModuleId, currencyId, num)).then((result) => {
      if (result.success) {
        refresh()
        setAmountInput('')
      } else {
        setError(result.error || '操作失败')
      }
    })
  }

  const convertAmountNum = parseFloat(stripNumberGrouping(convertAmount))
  const convertAmountValid = !Number.isNaN(convertAmountNum) && convertAmountNum > 0
  const convertMaxFrom = vault[convertFrom] ?? 0
  const convertPreview = convertAmountValid
    ? convertCurrency(convertAmountNum, convertFrom, convertTo)
    : convertAmount.trim().toLowerCase() === '全部' && convertMaxFrom > 0
      ? convertCurrency(convertMaxFrom, convertFrom, convertTo)
      : null
  const toCfg = CURRENCY_CONFIG.find((c) => c.id === convertTo)

  const handleConvert = () => {
    setConvertError('')
    const isAll = String(convertAmount).trim().toLowerCase() === '全部'
    const amt = isAll ? 'all' : convertAmountNum
    if (!isAll && (Number.isNaN(convertAmountNum) || convertAmountNum <= 0)) {
      setConvertError('请输入有效数量或「全部」')
      return
    }
    Promise.resolve(convertEffectiveTeamCurrency(currentModuleId, convertFrom, convertTo, amt)).then((result) => {
      if (result.success) {
        refresh()
        setConvertAmount('')
      } else {
        setConvertError(result.error || '兑换失败')
      }
    })
  }

  const handleCurrencyChange = async (currencyId, value) => {
    if (!currentModuleId) return
    const isGem = currencyId === 'gem_lb'
    const targetValue = isGem
      ? Math.round(Math.max(0, value) * 10) / 10
      : Math.max(0, Math.floor(value))

    // 1. 账面清零
    const vault = getTeamVault(currentModuleId)
    await setTeamVault(currentModuleId, { ...vault, [currencyId]: 0 })

    // 2. 清空秘法箱中该货币的实物（顶层）
    const whCurrent = sumWarehouseWalletBalances(currentModuleId)
    const currentWh = whCurrent[currencyId] ?? 0
    if (currentWh > 0) {
      await tryConsumeWarehouseCurrencyStacks(currentModuleId, currencyId, currentWh)
    }

    // 3. 按目标值重新添加实物到秘法箱
    if (targetValue > 0) {
      await addWarehouseCurrencyStack(currentModuleId, currencyId, targetValue)
    }

    window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
    window.dispatchEvent(new CustomEvent('dnd-realtime-warehouse'))
    refresh()
  }

  const isTopBar = variant === 'topbar'
  const inputClass = 'h-9 rounded-lg bg-gray-800 border border-gray-600 text-white px-2.5 text-sm focus:border-dnd-red focus:ring-1 focus:ring-dnd-red'
  const btnClass = 'h-9 px-3 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm shrink-0'

  return (
    <div className={isTopBar ? '' : 'space-y-3'}>
      {showControls ? (
        <>
          {/* 金额调整 | 金库兑换 */}
          <div className={isTopBar ? 'flex flex-row items-center gap-2' : 'rounded-xl bg-dnd-card border border-white/10 p-3'}>
            <div className={isTopBar ? 'flex flex-row items-center gap-2' : 'grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4'}>
          {/* 左：金额调整 */}
          <div className={`min-w-0 ${isTopBar ? 'flex items-center gap-1' : 'space-y-1'}`}>
            {!isTopBar && <h3 className="text-dnd-text-body text-[11px] font-semibold">金额调整</h3>}
            <div className={`items-center ${isTopBar ? 'flex gap-1' : 'flex flex-wrap gap-1.5'}`}>
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                <button type="button" onClick={() => setSign('+')} className={`h-9 w-9 shrink-0 flex items-center justify-center transition-colors ${sign === '+' ? 'bg-dnd-red text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`} title="增加"><Plus className="w-4 h-4" /></button>
                <button type="button" onClick={() => setSign('-')} className={`h-9 w-9 shrink-0 flex items-center justify-center transition-colors ${sign === '-' ? 'bg-dnd-red text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`} title="减少"><Minus className="w-4 h-4" /></button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="数量"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(formatAmountInputWithCommas(e.target.value))
                  setError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                className={inputClass + ` ${isTopBar ? 'w-20 px-1.5' : 'w-[6.5rem]'} min-w-0 font-mono placeholder:text-gray-500 tabular-nums`}
              />
              <select value={currencyId} onChange={(e) => setCurrencyId(e.target.value)} className={inputClass + ` ${isTopBar ? 'min-w-[5rem] px-1 text-xs' : 'min-w-[6rem]'}`}>
                {CURRENCY_CONFIG.map((c) => (
                  <option key={c.id} value={c.id}>{getCurrencyDisplayName(c)}</option>
                ))}
              </select>
              <button type="button" onClick={handleApply} className={`h-9 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm shrink-0 ${isTopBar ? 'px-2 text-xs' : 'px-3'}`}>{sign === '+' ? '加入' : '扣除'}</button>
            </div>
            {!isTopBar && error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          {/* 右：金库兑换 */}
          <div className={`min-w-0 ${isTopBar ? 'flex items-center gap-1' : 'space-y-1'} ${isTopBar ? '' : 'lg:border-l lg:border-white/10 lg:pl-4'}`}>
            {!isTopBar && <h3 className="text-dnd-text-body text-[11px] font-semibold flex items-center gap-1.5"><ArrowRightLeft size={14} /> 金库兑换</h3>}
            <div className={`items-center ${isTopBar ? 'flex gap-1' : 'flex flex-wrap gap-1.5'}`}>
              <select value={convertFrom} onChange={(e) => { setConvertFrom(e.target.value); setConvertError(''); }} className={inputClass + ` ${isTopBar ? 'min-w-[5rem] px-1 text-xs' : 'min-w-[6rem]'}`}>
                {CURRENCY_CONFIG.map((c) => (
                  <option key={c.id} value={c.id}>{getCurrencyDisplayName(c)}</option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="数量或全部"
                value={convertAmount}
                onChange={(e) => {
                  const v = e.target.value
                  const t = v.trim()
                  if (t.length <= 2 && '全部'.startsWith(t)) {
                    setConvertAmount(t)
                    setConvertError('')
                    return
                  }
                  setConvertAmount(formatAmountInputWithCommas(v))
                  setConvertError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleConvert()}
                className={inputClass + ` ${isTopBar ? 'w-20 px-1.5' : 'w-[6.5rem]'} min-w-0 font-mono placeholder:text-gray-500 tabular-nums`}
              />
              <span className="text-dnd-text-muted text-xs">→</span>
              <select value={convertTo} onChange={(e) => { setConvertTo(e.target.value); setConvertError(''); }} className={inputClass + ` ${isTopBar ? 'min-w-[5rem] px-1 text-xs' : 'min-w-[6rem]'}`}>
                {CURRENCY_CONFIG.filter((c) => c.id !== convertFrom).map((c) => (
                  <option key={c.id} value={c.id}>{getCurrencyDisplayName(c)}</option>
                ))}
              </select>
              <button type="button" onClick={handleConvert} className={`h-9 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm shrink-0 ${isTopBar ? 'px-2 text-xs' : 'px-3'}`}>兑换</button>
            </div>
            {!isTopBar && convertPreview != null && toCfg && (
              <p className="text-dnd-text-muted text-[10px]">约 <span className="text-cyan-200 font-medium">{convertPreview}</span> {getCurrencyDisplayName(toCfg)}</p>
            )}
            {!isTopBar && convertError && <p className="text-red-400 text-xs">{convertError}</p>}
          </div>
            </div>
          </div>
        </>
      ) : null}

      {showTotals ? (
        <CurrencyGrid
          balances={vault}
          title="团队资金总计"
          editable
          onCurrencyChange={handleCurrencyChange}
        />
      ) : null}
    </div>
  )
}
