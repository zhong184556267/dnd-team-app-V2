import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useModule } from '../contexts/ModuleContext'
import { CURRENCY_CONFIG, getCurrencyDisplayName } from '../data/currencyConfig'
import { getTeamVault, getCharacterWallet, transferCurrency, loadTeamVaultIntoCache } from '../lib/currencyStore'

export default function TransferModal({ open, onClose, direction, characterId, characterName, onSuccess }) {
  const { currentModuleId } = useModule()
  const [currencyId, setCurrencyId] = useState('gp')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [, setVaultTick] = useState(0)

  useEffect(() => {
    if (!open || !currentModuleId) return
    loadTeamVaultIntoCache(currentModuleId).then(() => setVaultTick((t) => t + 1))
  }, [open, currentModuleId])

  const vault = open ? getTeamVault(currentModuleId) : {}
  const wallet = open && characterId ? getCharacterWallet(characterId) : {}
  const maxSource = direction === 'toVault' ? (wallet[currencyId] ?? 0) : (vault[currencyId] ?? 0)
  const canAll = maxSource > 0

  useEffect(() => {
    if (!open) {
      setAmount('')
      setError('')
      setCurrencyId('gp')
    }
  }, [open, direction, characterId])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    const amt = amount.trim().toLowerCase() === 'all' ? 'all' : parseFloat(amount)
    if (amt !== 'all' && (typeof amt !== 'number' || Number.isNaN(amt) || amt <= 0)) {
      setError('请输入有效数量')
      setShake(true)
      setTimeout(() => setShake(false), 400)
      return
    }
    Promise.resolve(transferCurrency(currentModuleId, direction, characterId, currencyId, amt)).then((result) => {
      if (result.success) {
        onSuccess?.()
        onClose()
      } else {
        setError(result.error || '操作失败')
        setShake(true)
        setTimeout(() => setShake(false), 400)
      }
    })
  }

  if (!open) return null

  const isWithdraw = direction === 'fromVault'
  const title = isWithdraw ? '从金库取出' : '存入金库'
  const insufficient = isWithdraw && (parseFloat(amount) > maxSource && amount.trim().toLowerCase() !== 'all')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="rounded-xl bg-dnd-card border border-white/10 shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="font-display font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {characterName && (
            <p className="text-dnd-text-muted text-sm">角色：<span className="text-white">{characterName}</span></p>
          )}
          <div>
            <label className="block text-dnd-text-muted text-xs mb-1">货币类型</label>
            <select
              value={currencyId}
              onChange={(e) => { setCurrencyId(e.target.value); setError(''); }}
              className="w-full rounded-lg bg-gray-800 border border-white/10 text-white px-3 py-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
            >
              {CURRENCY_CONFIG.map((c) => (
                <option key={c.id} value={c.id}>{getCurrencyDisplayName(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-dnd-text-muted text-xs mb-1">数量（可填「全部」）</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
              placeholder={canAll ? `最多 ${maxSource}，或输入 全部` : '0'}
              className={`w-full rounded-lg bg-gray-800 border px-3 py-2 text-white focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500 ${
                insufficient || error ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-dnd-red'
              } ${shake ? 'animate-shake' : ''}`}
            />
            {canAll && (
              <button
                type="button"
                onClick={() => setAmount('全部')}
                className="mt-1 text-dnd-red text-xs font-medium hover:underline"
              >
                全部{isWithdraw ? '取出' : '存入'}
              </button>
            )}
          </div>
          {(error || insufficient) && (
            <p className="text-red-400 text-sm">{error || '金库余额不足'}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-sm">
              取消
            </button>
            <button
              type="submit"
              className={`px-4 py-2 rounded-lg font-semibold text-sm text-white ${
                insufficient ? 'bg-red-600 hover:bg-red-500' : 'bg-dnd-red hover:bg-dnd-red-hover'
              } ${shake ? 'animate-shake' : ''}`}
            >
              确认
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
