import { useState, useEffect } from 'react'
import { Plus, Minus, ArrowRightLeft } from 'lucide-react'
import { useModule } from '../contexts/ModuleContext'
import { adjustVault, convertCurrency, loadTeamVaultIntoCache } from '../lib/currencyStore'
import { getEffectiveTeamVaultBalances, deductTeamCurrency, convertEffectiveTeamCurrency } from '../lib/teamCurrencyPublicBags'
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
export default function CurrencyPanel() {
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
    Promise.resolve(loadTeamVaultIntoCache(currentModuleId)).then(() => refresh())
  }, [currentModuleId])

  useEffect(() => {
    const h = () => refresh()
    window.addEventListener('dnd-realtime-team-vault', h)
    window.addEventListener('dnd-realtime-characters', h)
    return () => {
      window.removeEventListener('dnd-realtime-team-vault', h)
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
      Promise.resolve(adjustVault(currentModuleId, currencyId, num)).then((result) => {
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

  const inputClass = 'h-9 rounded-lg bg-gray-800 border border-gray-600 text-white px-2.5 text-sm focus:border-dnd-red focus:ring-1 focus:ring-dnd-red'
  const btnClass = 'h-9 px-3 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm shrink-0'

  return (
    <div className="space-y-3">
      {/* 金额调整 | 金库兑换：左右分栏紧凑排布 */}
      <div className="rounded-xl bg-dnd-card border border-white/10 p-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
          {/* 左：金额调整 */}
          <div className="space-y-1.5 min-w-0">
            <h3 className="text-dnd-text-body text-xs font-semibold">金额调整</h3>
            <div className="flex flex-wrap gap-1.5 items-center">
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
                className={inputClass + ' w-[6.5rem] min-w-0 font-mono placeholder:text-gray-500 tabular-nums'}
              />
              <select value={currencyId} onChange={(e) => setCurrencyId(e.target.value)} className={inputClass + ' min-w-[6rem]'}>
                {CURRENCY_CONFIG.map((c) => (
                  <option key={c.id} value={c.id}>{getCurrencyDisplayName(c)}</option>
                ))}
              </select>
              <button type="button" onClick={handleApply} className={btnClass}>{sign === '+' ? '加入' : '扣除'}</button>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          {/* 右：金库兑换 */}
          <div className="space-y-1.5 min-w-0 lg:border-l lg:border-white/10 lg:pl-4">
            <h3 className="text-dnd-text-body text-xs font-semibold flex items-center gap-1.5">
              <ArrowRightLeft size={14} /> 金库兑换
            </h3>
            <div className="flex flex-wrap gap-1.5 items-center">
              <select value={convertFrom} onChange={(e) => { setConvertFrom(e.target.value); setConvertError(''); }} className={inputClass + ' min-w-[6rem]'}>
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
                className={inputClass + ' w-[6.5rem] min-w-0 font-mono placeholder:text-gray-500 tabular-nums'}
              />
              <span className="text-dnd-text-muted text-xs">→</span>
              <select value={convertTo} onChange={(e) => { setConvertTo(e.target.value); setConvertError(''); }} className={inputClass + ' min-w-[6rem]'}>
                {CURRENCY_CONFIG.filter((c) => c.id !== convertFrom).map((c) => (
                  <option key={c.id} value={c.id}>{getCurrencyDisplayName(c)}</option>
                ))}
              </select>
              <button type="button" onClick={handleConvert} className={btnClass}>兑换</button>
            </div>
            {convertPreview != null && toCfg && (
              <p className="text-dnd-text-muted text-[10px]">约 <span className="text-cyan-200 font-medium">{convertPreview}</span> {getCurrencyDisplayName(toCfg)}</p>
            )}
            {convertError && <p className="text-red-400 text-xs">{convertError}</p>}
            <p className="text-dnd-text-muted text-[10px] leading-snug">
              兑换会先从<strong className="text-dnd-text-body">账面金库</strong>扣源币种，不足部分再从<strong className="text-dnd-text-body">公家次元袋</strong>钱币堆扣除；兑得货币记入<strong className="text-dnd-text-body">账面</strong>（与下方合计一致）。
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <CurrencyGrid balances={vault} title="团队金库" />
        <p className="text-dnd-text-muted text-[10px] px-1 leading-relaxed">
          合计含<strong className="text-dnd-text-body">账面金库</strong>与各角色<strong className="text-dnd-text-body">公家次元袋</strong>内的钱币堆；增加金额只入账面，可将账面货币<strong className="text-dnd-text-body">拖入公家次元袋</strong>（仍计入本合计）。
        </p>
      </div>
    </div>
  )
}
