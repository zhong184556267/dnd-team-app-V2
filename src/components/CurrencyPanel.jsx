import { useState, useEffect } from 'react'
import { Plus, Minus, ArrowRightLeft } from 'lucide-react'
import { getTeamVault, adjustVault, convertVaultCurrency, convertCurrency } from '../lib/currencyStore'
import { CURRENCY_CONFIG, getCurrencyDisplayName } from '../data/currencyConfig'
import { CurrencyGrid } from './CurrencyDisplay'

/** 团队仓库页用：金库兑换 + 金库 +/- 输入 + 团队金库展示 */
export default function CurrencyPanel() {
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

  const refresh = () => setVault(getTeamVault())

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (convertFrom === convertTo) {
      const other = CURRENCY_CONFIG.find((c) => c.id !== convertFrom)
      setConvertTo(other?.id ?? 'gp')
    }
  }, [convertFrom, convertTo])

  const handleApply = () => {
    setError('')
    const num = parseFloat(String(amountInput).replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError('请输入有效数量')
      return
    }
    const delta = sign === '+' ? num : -num
    const result = adjustVault(currencyId, delta)
    if (result.success) {
      refresh()
      setAmountInput('')
    } else {
      setError(result.error || '操作失败')
    }
  }

  const convertAmountNum = parseFloat(String(convertAmount).replace(/,/g, ''))
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
    const result = convertVaultCurrency(convertFrom, convertTo, amt)
    if (result.success) {
      refresh()
      setConvertAmount('')
    } else {
      setConvertError(result.error || '兑换失败')
    }
  }

  const inputClass = 'h-9 rounded-lg bg-gray-800 border border-gray-600 text-white px-2.5 text-sm focus:border-dnd-red focus:ring-1 focus:ring-dnd-red'
  const btnClass = 'h-9 px-3 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm shrink-0'

  return (
    <div className="space-y-3">
      {/* 金库兑换 | 金库调整：左右分栏紧凑排布 */}
      <div className="rounded-xl bg-dnd-card border border-white/10 p-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
          {/* 左：金库兑换 */}
          <div className="space-y-1.5 min-w-0">
            <h3 className="text-dnd-text-body text-xs font-semibold flex items-center gap-1.5">
              <ArrowRightLeft size={14} /> 金库兑换
            </h3>
            <div className="flex flex-wrap gap-1.5 items-center">
              <select value={convertFrom} onChange={(e) => { setConvertFrom(e.target.value); setConvertError(''); }} className={inputClass + ' min-w-[6rem]'}>
                {CURRENCY_CONFIG.map((c) => (
                  <option key={c.id} value={c.id}>{getCurrencyDisplayName(c)}</option>
                ))}
              </select>
              <input type="text" placeholder="数量或全部" value={convertAmount} onChange={(e) => { setConvertAmount(e.target.value); setConvertError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleConvert()} className={inputClass + ' w-20 font-mono placeholder:text-gray-500'} />
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
          </div>

          {/* 右：金库调整 */}
          <div className="space-y-1.5 min-w-0 lg:border-l lg:border-white/10 lg:pl-4">
            <h3 className="text-dnd-text-body text-xs font-semibold">金库调整</h3>
            <div className="flex flex-wrap gap-1.5 items-center">
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                <button type="button" onClick={() => setSign('+')} className={`h-9 w-9 shrink-0 flex items-center justify-center transition-colors ${sign === '+' ? 'bg-dnd-red text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`} title="增加"><Plus className="w-4 h-4" /></button>
                <button type="button" onClick={() => setSign('-')} className={`h-9 w-9 shrink-0 flex items-center justify-center transition-colors ${sign === '-' ? 'bg-dnd-red text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`} title="减少"><Minus className="w-4 h-4" /></button>
              </div>
              <input type="number" min="0" step="any" placeholder="数量" value={amountInput} onChange={(e) => { setAmountInput(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleApply()} className={inputClass + ' w-20 font-mono placeholder:text-gray-500'} />
              <select value={currencyId} onChange={(e) => setCurrencyId(e.target.value)} className={inputClass + ' min-w-[6rem]'}>
                {CURRENCY_CONFIG.map((c) => (
                  <option key={c.id} value={c.id}>{getCurrencyDisplayName(c)}</option>
                ))}
              </select>
              <button type="button" onClick={handleApply} className={btnClass}>{sign === '+' ? '加入' : '扣除'}</button>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        </div>
      </div>

      <CurrencyGrid balances={vault} title="团队金库" />
    </div>
  )
}
