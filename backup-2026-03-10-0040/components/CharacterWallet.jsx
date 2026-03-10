import { useState, useEffect } from 'react'
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { getTeamVault, getCharacterWallet } from '../lib/currencyStore'
import { CurrencyGrid } from './CurrencyDisplay'
import TransferModal from './TransferModal'

/** 角色卡上的个人钱包：展示该角色持有 + 存入金库 / 从金库取出 */
export default function CharacterWallet({ characterId, characterName, canEdit, onSuccess }) {
  const [wallet, setWallet] = useState({})
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDirection, setTransferDirection] = useState('toVault')
  const [flashKey, setFlashKey] = useState(0)

  const refresh = () => {
    if (characterId) setWallet(getCharacterWallet(characterId))
  }

  useEffect(() => {
    refresh()
  }, [characterId])

  const handleTransferSuccess = () => {
    refresh()
    setFlashKey((k) => k + 1)
    onSuccess?.()
  }

  const openDeposit = () => {
    setTransferDirection('toVault')
    setTransferOpen(true)
  }
  const openWithdraw = () => {
    setTransferDirection('fromVault')
    setTransferOpen(true)
  }

  if (!characterId) return null

  return (
    <div className="space-y-3">
      <CurrencyGrid
        key={`wallet-${flashKey}`}
        balances={wallet}
        title="个人持有"
        extraClass={flashKey > 0 ? 'animate-flash' : ''}
      />
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openDeposit}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white text-sm font-medium"
          >
            <ArrowDownToLine size={16} /> 存入金库
          </button>
          <button
            type="button"
            onClick={openWithdraw}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium"
          >
            <ArrowUpFromLine size={16} /> 从金库取出
          </button>
        </div>
      )}
      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        direction={transferDirection}
        characterId={characterId}
        characterName={characterName}
        onSuccess={handleTransferSuccess}
      />
    </div>
  )
}
