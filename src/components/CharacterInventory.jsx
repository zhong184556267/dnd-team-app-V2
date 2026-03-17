import { useState, useEffect, Fragment } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Trash2, Package, GripVertical, Dices } from 'lucide-react'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getCharacterWallet } from '../lib/currencyStore'
import { addToWarehouse } from '../lib/warehouseStore'
import { CurrencyGrid } from './CurrencyDisplay'
import { getItemWeightLb, parseWeightString } from '../lib/encumbrance'
import { getMaxAttunementSlots, getAttunedCountFromInventory } from '../lib/combatState'
import ItemAddForm from './ItemAddForm'
import EncumbranceBar from './EncumbranceBar'
import TransferModal from './TransferModal'
import { DamageDiceInlineRow } from './BuffForm'
import { parseDamageString, formatDamageForAttack } from '../data/buffTypes'
import { rollDice } from '../data/weaponDatabase'
import { inputClass, textareaClass, labelClass } from '../lib/inputStyles'
import { NumberStepper } from './BuffForm'

/** 从护甲附注字符串解析为分格字段，便于编辑。格式如：AC 12+敏捷；力量—；隐匿— */
function parseArmorNoteToFields(note) {
  const empty = { isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' }
  if (!note || typeof note !== 'string') return empty
  const s = note.trim()
  if (!s) return empty
  // 盾牌：AC +2
  const shieldMatch = s.match(/AC\s*\+\s*(\d+)/i)
  if (shieldMatch) {
    const bonus = shieldMatch[1]
    return { ...empty, isShield: true, shieldBonus: bonus }
  }
  let baseAC = ''
  let dexMode = 'none'
  let dexCap = 2
  const armorDexCapMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷\s*[（(]\s*最大\s*(\d+)\s*[）)]/i)
  if (armorDexCapMatch) {
    baseAC = armorDexCapMatch[1]
    dexMode = 'cap2'
    dexCap = parseInt(armorDexCapMatch[2], 10) || 2
  } else {
    const armorDexMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷/i)
    if (armorDexMatch) {
      baseAC = armorDexMatch[1]
      dexMode = 'full'
    } else {
      const armorFixedMatch = s.match(/AC\s*(\d+)/i)
      if (armorFixedMatch) {
        baseAC = armorFixedMatch[1]
        dexMode = 'none'
      }
    }
  }
  let strReq = ''
  const strMatch = s.match(/力量\s*(\d+)/i)
  if (strMatch) strReq = strMatch[1]
  const stealth = /隐匿\s*劣势/i.test(s) ? '劣势' : '—'
  return { isShield: false, baseAC, dexMode, dexCap, strReq, stealth, shieldBonus: '' }
}

/** 根据分格字段构建护甲附注字符串 */
function buildArmorNoteFromFields(fields) {
  if (!fields) return ''
  if (fields.isShield) {
    const n = fields.shieldBonus === '' ? '0' : String(fields.shieldBonus)
    return `AC +${n}；力量—；隐匿—`
  }
  const base = fields.baseAC === '' ? '0' : String(fields.baseAC)
  let acPart = `AC ${base}`
  if (fields.dexMode === 'full') acPart += '+敏捷'
  else if (fields.dexMode === 'cap2') acPart += `+敏捷（最大${fields.dexCap ?? 2}）`
  const strPart = fields.strReq === '' ? '—' : fields.strReq
  const stealthPart = fields.stealth === '劣势' ? '劣势' : '—'
  return `${acPart}；力量${strPart}；隐匿${stealthPart}`
}

/**
 * 个人背包：先选物品类型→自动带出可编辑信息→点「放入背包」才加入；同调列在名称前，最多 maxSlots
 */
export default function CharacterInventory({ character, canEdit, onSave, onWalletSuccess }) {
  const inv = character?.inventory ?? []
  const [wallet, setWallet] = useState({})
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDirection, setTransferDirection] = useState('toVault')
  const [editingIndex, setEditingIndex] = useState(null)
  const [editName, setEditName] = useState('')
  const [edit攻击, setEdit攻击] = useState('')
  const [edit伤害, setEdit伤害] = useState('')
  const [edit攻击距离, setEdit攻击距离] = useState('')
  const [edit攻击范围, setEdit攻击范围] = useState('')
  const [edit爆炸半径, setEdit爆炸半径] = useState(0)
  const [edit详细介绍, setEdit详细介绍] = useState('')
  const [edit附注, setEdit附注] = useState('')
  const [editArmorFields, setEditArmorFields] = useState(() => parseArmorNoteToFields(''))
  const [editQty, setEditQty] = useState(1)
  const [editMagicBonus, setEditMagicBonus] = useState(0)
  const [editCharge, setEditCharge] = useState(0)
  const [editChargeMax, setEditChargeMax] = useState(0)
  const [storeToVaultIndex, setStoreToVaultIndex] = useState(null)
  const [storeToVaultQty, setStoreToVaultQty] = useState(1)
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [lastExplosiveRoll, setLastExplosiveRoll] = useState(null) // { index, total, rolls, diceExpr }

  const maxAttunementSlots = getMaxAttunementSlots(character?.buffs ?? [])
  const attunedCount = getAttunedCountFromInventory(inv)

  useEffect(() => {
    if (character?.id) setWallet(getCharacterWallet(character.id))
  }, [character?.id, character?.wallet])

  const removeItem = (index) => {
    onSave({ inventory: inv.filter((_, i) => i !== index) })
  }

  const reorderInventory = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setEditingIndex(null)
    const next = [...inv]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    onSave({ inventory: next })
  }

  /** 同名物品（显示名称一致）可合并数量；invDisplayName 在下方定义，合并时用相同逻辑比较 */
  const getInvMergeKey = (entry) => {
    if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      const customName = entry.name && entry.name.trim()
      if (customName) return customName
      return getItemDisplayName(item) || '—'
    }
    return entry?.name ?? '—'
  }
  const isSameItemForMerge = (a, b) => a && b && getInvMergeKey(a) === getInvMergeKey(b)

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('opacity-50')
  }
  const handleDragEnd = (e) => e.currentTarget.classList.remove('opacity-50')
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) return
    const source = inv[fromIndex]
    const target = inv[toIndex]
    if (isSameItemForMerge(source, target)) {
      setEditingIndex(null)
      const qtyT = Math.max(1, Number(target?.qty) ?? 1)
      const qtyS = Math.max(1, Number(source?.qty) ?? 1)
      const chargeT = Number(target?.charge) || 0
      const chargeS = Number(source?.charge) || 0
      const merged = { ...target, qty: qtyT + qtyS, charge: chargeT + chargeS }
      const next = inv.filter((_, i) => i !== fromIndex)
      const newToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      next[newToIndex] = merged
      onSave({ inventory: next })
    } else {
      reorderInventory(fromIndex, toIndex)
    }
  }

  const openStoreToVault = (index) => {
    const e = inv[index]
    if (!e) return
    const q = Math.max(1, Number(e.qty) ?? 1)
    setStoreToVaultIndex(index)
    setStoreToVaultQty(1)
  }

  const confirmStoreToVault = () => {
    if (storeToVaultIndex == null) return
    const e = inv[storeToVaultIndex]
    if (!e) { setStoreToVaultIndex(null); return }
    const q = Math.max(1, Number(e.qty) ?? 1)
    const toStore = Math.min(Math.max(1, storeToVaultQty), q)
    const moduleId = character?.moduleId ?? 'default'
    if (e.itemId) {
      addToWarehouse(moduleId, {
        itemId: e.itemId,
        name: e.name,
        攻击: e.攻击,
        伤害: e.伤害,
        攻击距离: e.攻击距离,
        详细介绍: e.详细介绍,
        ...(e.附注 ? { 附注: e.附注 } : {}),
        ...(e.攻击范围 ? { 攻击范围: e.攻击范围 } : {}),
        ...(e.爆炸半径 != null ? { 爆炸半径: e.爆炸半径 } : {}),
        qty: toStore,
      })
    } else {
      addToWarehouse(moduleId, { name: e.name || '—', qty: toStore })
    }
    if (toStore >= q) {
      onSave({ inventory: inv.filter((_, i) => i !== storeToVaultIndex) })
    } else {
      const next = inv.map((entry, i) => (i === storeToVaultIndex ? { ...entry, qty: q - toStore } : entry))
      onSave({ inventory: next })
    }
    setStoreToVaultIndex(null)
    setStoreToVaultQty(1)
  }

  const setAttuned = (index, value) => {
    if (value && attunedCount >= maxAttunementSlots) return
    const next = inv.map((e, i) => (i === index ? { ...e, isAttuned: !!value } : e))
    onSave({ inventory: next })
  }

  const setQty = (index, value) => {
    const n = Math.max(1, parseInt(value, 10) || 1)
    const next = inv.map((e, i) => (i === index ? { ...e, qty: n } : e))
    onSave({ inventory: next })
  }

  const setMagicBonus = (index, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    const next = inv.map((e, i) => (i === index ? { ...e, magicBonus: n } : e))
    onSave({ inventory: next })
  }

  const setCharge = (index, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    const next = inv.map((e, i) => (i === index ? { ...e, charge: n } : e))
    onSave({ inventory: next })
  }

  const startEdit = (index) => {
    const e = inv[index]
    if (!e) return
    const proto = e.itemId ? getItemById(e.itemId) : null
    setEditingIndex(index)
    setEditName((e.name && e.name.trim()) || (proto ? getItemDisplayName(proto) : '') || '')
    setEdit攻击((e.攻击 != null && e.攻击 !== '') ? String(e.攻击) : (proto?.攻击 ?? ''))
    setEdit伤害((e.伤害 != null && e.伤害 !== '') ? String(e.伤害) : (proto?.伤害 ?? ''))
    setEdit攻击距离((e.攻击距离 != null && e.攻击距离 !== '') ? String(e.攻击距离) : '')
    setEdit攻击范围((e.攻击范围 != null && e.攻击范围 !== '') ? String(e.攻击范围) : '')
    setEdit爆炸半径(typeof e.爆炸半径 === 'number' ? e.爆炸半径 : (e.itemId ? (getItemById(e.itemId)?.爆炸半径) : undefined) ?? 0)
    setEdit详细介绍((e.详细介绍 != null && e.详细介绍 !== '') ? String(e.详细介绍) : '')
    setEdit附注((e.附注 != null && e.附注 !== '') ? String(e.附注) : '')
    if (proto?.类型 === '盔甲') {
      setEditArmorFields(parseArmorNoteToFields(e.附注 ?? ''))
    }
    setEditQty(Math.max(1, Number(e.qty) ?? 1))
    setEditMagicBonus(e.magicBonus != null && e.magicBonus !== '' ? Number(e.magicBonus) : 0)
    setEditCharge(e.charge != null && e.charge !== '' ? Number(e.charge) : 0)
    const chargeMaxVal = e.chargeMax ?? proto?.充能上限
    setEditChargeMax(chargeMaxVal != null ? Number(chargeMaxVal) : 0)
  }

  const saveEdit = () => {
    if (editingIndex == null) return
    const e = inv[editingIndex]
    const proto = e.itemId ? getItemById(e.itemId) : null
    const 附注Value = proto?.类型 === '盔甲' ? buildArmorNoteFromFields(editArmorFields) : (edit附注 != null && String(edit附注).trim() !== '' ? String(edit附注).trim() : (e.附注 ?? ''))
    const next = [...inv]
    next[editingIndex] = {
      ...e,
      name: (editName && editName.trim()) || (proto ? getItemDisplayName(proto) : null) || e.name || '—',
      攻击: (edit攻击 && edit攻击.trim()) || e.攻击,
      伤害: (edit伤害 && edit伤害.trim()) || e.伤害,
      攻击距离: (edit攻击距离 && edit攻击距离.trim()) ?? e.攻击距离 ?? '',
      攻击范围: (edit攻击范围 && edit攻击范围.trim()) || e.攻击范围 || undefined,
      ...((proto?.类型 === '爆炸物' || (proto?.类型 === '消耗品' && proto?.子类型 === '爆炸品')) ? { 爆炸半径: Number(edit爆炸半径) || 0 } : {}),
      详细介绍: edit详细介绍?.trim() ?? e.详细介绍 ?? '',
      附注: 附注Value,
      qty: Math.max(1, editQty),
      magicBonus: Number(editMagicBonus) || 0,
      charge: Number(editCharge) || 0,
      ...(proto?.类型 === '法器' && (proto?.充能上限 != null || /法杖|魔杖|权杖/.test(proto?.类别 ?? '')) ? { chargeMax: Math.max(0, Number(editChargeMax) || 0) } : {}),
    }
    onSave({ inventory: next })
    setEditingIndex(null)
  }

  const cancelEdit = () => {
    setEditingIndex(null)
  }

  const invDisplayName = (entry) => {
    if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      const customName = entry.name && entry.name.trim()
      if (customName) return customName
      return getItemDisplayName(item) || '—'
    }
    return entry?.name ?? '—'
  }

  const getEntryWeight = (entry) => {
    if (entry?.重量 != null && entry?.重量 !== '') return parseWeightString(entry.重量)
    if (!entry?.itemId) return 0
    const item = getItemById(entry.itemId)
    return getItemWeightLb(item)
  }

  const getEntryBriefFull = (entry) => {
    const brief = entry?.详细介绍?.trim()
    const proto = entry?.itemId ? getItemById(entry.itemId) : null
    const isExplosiveItem = proto?.类型 === '爆炸物' || (proto?.类型 === '消耗品' && proto?.子类型 === '爆炸品') || (entry?.爆炸半径 != null && (entry?.攻击距离 != null || entry?.攻击 != null || entry?.伤害 != null))
    const parts = []
    if (brief) parts.push(brief)
    if (!isExplosiveItem) {
      const range = entry?.攻击距离?.trim()
      const radius = entry?.爆炸半径 ?? proto?.爆炸半径
      if (range) parts.push(`攻击距离 ${range}`)
      if (radius != null && radius > 0) parts.push(`半径 ${radius}尺`)
    }
    if (parts.length) return parts.join('；')
    if (entry?.附注?.trim()) return entry.附注.trim()
    return proto?.详细介绍 ?? ''
  }

  const handleTransferSuccess = () => {
    setWallet(getCharacterWallet(character.id))
    onWalletSuccess?.()
  }

  return (
    <div className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden">
      {/* 中部：双栏 */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* 左侧：物品栏 */}
        <div className="min-w-0">
          <h3 className={labelClass}>物品栏</h3>
          {canEdit && (
            <div className="mb-3">
              <button type="button" onClick={() => setAddFormOpen(true)} className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm">
                添加物品
              </button>
              <ItemAddForm open={addFormOpen} onClose={() => setAddFormOpen(false)} onSave={(entry) => { onSave({ inventory: [...inv, entry] }); setAddFormOpen(false); }} submitLabel="确认加入" />
            </div>
          )}
          <div className="rounded-lg border border-gray-600 overflow-x-auto">
            <table className="inventory-table w-full text-sm" style={{ tableLayout: 'fixed', minWidth: '520px' }}>
              <colgroup>
                {canEdit && <col style={{ width: '1.9%' }} />}
                <col style={{ width: canEdit ? '12.38%' : '14.29%' }} />
                <col style={{ width: '9.52%' }} />
                <col style={{ width: '54.76%' }} />
                <col style={{ width: '9.52%' }} />
                <col style={{ width: '4.76%' }} />
                {canEdit && <col style={{ width: '7.14%' }} />}
              </colgroup>
              <thead>
                <tr className="bg-gray-800/80 text-dnd-text-muted text-xs uppercase tracking-wider" style={{ height: 48, minHeight: 48, maxHeight: 48 }}>
                  {canEdit && <th className="py-0 px-4 align-middle text-center" style={{ height: 48, maxHeight: 48 }} title="拖拽排序" />}
                  <th className="py-0 px-4 font-semibold min-w-0 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>名称</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>充能</th>
                  <th className="py-0 px-4 font-semibold min-w-0 border-l border-gray-600 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>简要介绍</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>数量</th>
                  <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>总重</th>
                  {canEdit && <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }} />}
                </tr>
              </thead>
              <tbody>
                {inv.map((entry, i) => {
                  const qty = Math.max(1, Number(entry?.qty) ?? 1)
                  const unitLb = getEntryWeight(entry)
                  const totalLb = Math.round(unitLb * qty * 100) / 100
                  const isEditing = canEdit && editingIndex === i
                  return (
                    <Fragment key={entry.id ?? `inv-${i}`}>
                      <tr
                        className={`border-t border-gray-700/80 hover:bg-gray-800/40 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                        draggable={canEdit}
                        onDragStart={canEdit ? (e) => handleDragStart(e, i) : undefined}
                        onDragEnd={canEdit ? handleDragEnd : undefined}
                        onDragOver={canEdit ? handleDragOver : undefined}
                        onDrop={canEdit ? (e) => handleDrop(e, i) : undefined}
                      >
                        {canEdit && (
                          <td className="py-1 px-4 align-middle text-center overflow-hidden" title="拖拽调整顺序" style={{ height: 48, maxHeight: 48 }}>
                            <span className="inline-flex justify-center"><GripVertical className="w-4 h-4" /></span>
                          </td>
                        )}
                        <td className="py-1 px-4 text-white font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          <span className="inline-flex items-center gap-0.5 truncate max-w-full">
                            {invDisplayName(entry)}
                            {(Number(entry.magicBonus) || 0) > 0 ? (
                              <span className="text-amber-200/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                            ) : null}
                          </span>
                        </td>
                        <td className="py-1 px-2 align-middle border-l border-gray-600 text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          {canEdit ? (
                            <div className="flex justify-center">
                              <NumberStepper
                                value={Number(entry.charge) || 0}
                                onChange={(v) => setCharge(i, v)}
                                min={0}
                                compact
                                pill
                              />
                            </div>
                          ) : (Number(entry.charge) || 0) > 0 ? (
                            <span className="tabular-nums text-dnd-text-body text-xs">{entry.charge}</span>
                          ) : null}
                        </td>
                        <td className="inventory-table-cell-brief py-1 px-4 text-dnd-text-body text-xs min-w-0 overflow-hidden border-l border-gray-600 align-middle text-left" style={{ height: 48, maxHeight: 48, overflow: 'hidden' }} title={getEntryBriefFull(entry) || undefined}>
                          <div className="min-h-0 overflow-hidden" style={{ maxHeight: 40 }}>
                          {(() => {
                            const proto = entry?.itemId ? getItemById(entry.itemId) : null
                            const isExplosive = proto?.类型 === '爆炸物' || (proto?.类型 === '消耗品' && proto?.子类型 === '爆炸品') || (entry?.爆炸半径 != null && (entry?.攻击距离 != null || entry?.攻击 != null || entry?.伤害 != null))
                            if (isExplosive) {
                              const throwRangeRaw = (entry.攻击距离 ?? proto?.攻击距离 ?? '').toString().trim()
                              const throwRange = throwRangeRaw ? (/^\d+$/.test(throwRangeRaw) ? `${throwRangeRaw}尺` : throwRangeRaw) : ''
                              const radius = entry.爆炸半径 ?? proto?.爆炸半径 ?? null
                              const damageStr = (entry.攻击 ?? proto?.攻击 ?? '').trim() || (entry.伤害 ? `${entry.伤害}` : (proto?.伤害 ?? ''))
                              const parsed = parseDamageString(damageStr)
                              const damageDisplay = formatDamageForAttack(parsed).trim() || [parsed.plus, parsed.type].filter(Boolean).join(' ') || '—'
                              const diceExpr = (parsed.plus || '').trim().toLowerCase()
                              const canRoll = /^\d+d\d+$/i.test(diceExpr)
                              const roll = lastExplosiveRoll?.index === i ? lastExplosiveRoll : null
                              return (
                                <div className="flex items-center gap-x-2 gap-y-0 overflow-hidden line-clamp-2 text-left">
                                  {radius != null && radius !== '' ? <span className="shrink-0">爆炸范围 {Number(radius)}尺半径</span> : null}
                                  {radius != null && radius !== '' && throwRange ? <span className="text-gray-500 shrink-0">|</span> : null}
                                  {throwRange ? <span className="shrink-0">抛投距离 {throwRange}</span> : null}
                                  {(radius != null && radius !== '' || throwRange) ? <span className="text-gray-500 shrink-0">|</span> : null}
                                  <span className="inline-flex items-center gap-1 shrink-0">
                                    <span>伤害 {damageDisplay}</span>
                                    {canRoll ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const { total, rolls } = rollDice(diceExpr)
                                          setLastExplosiveRoll({ index: i, total, rolls, diceExpr })
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded bg-amber-600 hover:bg-amber-500 text-white shrink-0"
                                        title="投掷"
                                      >
                                        <Dices className="w-3.5 h-3.5" />
                                      </button>
                                    ) : null}
                                    {roll ? <span className="text-amber-300 font-medium tabular-nums">= {roll.total}{roll.rolls?.length ? ` (${roll.rolls.join('+')})` : ''}</span> : null}
                                  </span>
                                </div>
                              )
                            }
                            return <span className="line-clamp-2 text-left inline-block w-full break-words">{getEntryBriefFull(entry) || '—'}</span>
                          })()}
                          </div>
                        </td>
                        <td className="py-1 px-2 align-middle border-l border-gray-600 text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                          {canEdit ? (
                            <div className="flex justify-center">
                              <NumberStepper
                                value={qty}
                                onChange={(v) => setQty(i, v)}
                                min={1}
                                compact
                                pill
                              />
                            </div>
                          ) : (
                            <span className="tabular-nums text-dnd-text-body text-xs">{qty}</span>
                          )}
                        </td>
                        <td className="py-1 px-2 tabular-nums text-dnd-text-body border-l border-gray-600 align-middle text-center overflow-hidden whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>{totalLb ? `${totalLb} lb` : ''}</td>
                        {canEdit && (
                          <td className="py-1 px-1 border-l border-gray-600 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                            <div className="flex items-center justify-center gap-0.5 min-w-0 max-w-full">
                              <button type="button" onClick={() => openStoreToVault(i)} title="存到团队仓库" className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0">
                                <Package size={14} />
                              </button>
                              <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1 rounded text-amber-400 hover:bg-amber-400/20 shrink-0">
                                <Pencil size={14} />
                              </button>
                              <button type="button" onClick={() => removeItem(i)} title="移除" className="p-1 rounded text-dnd-red hover:bg-dnd-red/20 shrink-0">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {isEditing && (
                        <tr className="border-t-0 bg-gray-800/80">
                          <td colSpan={canEdit ? 8 : 5} className="py-3 px-3 overflow-visible">
                            <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3 space-y-3" style={{ marginLeft: -50 }}>
                              <p className="text-dnd-text-muted text-xs mb-2">修改此项信息</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="sm:col-span-2">
                                  <label className="block text-dnd-text-muted text-xs mb-1">名称</label>
                                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="名称" className={inputClass + ' h-10'} />
                                </div>
                                {(() => {
                                  const editingProto = inv[editingIndex]?.itemId ? getItemById(inv[editingIndex].itemId) : null
                                  const showEditAttackDamage = editingProto && (editingProto.类型 === '近战武器' || editingProto.类型 === '远程武器' || editingProto.类型 === '枪械' || editingProto.类型 === '爆炸物' || (editingProto.类型 === '消耗品' && editingProto.子类型 === '爆炸品'))
                                  const showEditExplosiveExtra = editingProto && (editingProto.类型 === '爆炸物' || (editingProto.类型 === '消耗品' && editingProto.子类型 === '爆炸品'))
                                  const showEditArmorNote = editingProto && editingProto.类型 === '盔甲'
                                  return (
                                    <>
                                      {showEditAttackDamage && (
                                        <>
                                          {showEditExplosiveExtra ? (
                                            /* 爆炸物：能扔多远、爆炸炸多远、造成多少伤害 三模块 */
                                            <>
                                              <div className="sm:col-span-2 flex flex-wrap items-end gap-4 gap-y-3">
                                                <div className="flex items-center gap-2 flex-nowrap">
                                                  <span className="text-dnd-text-muted text-xs shrink-0">抛投距离</span>
                                                  <NumberStepper
                                                    value={parseInt(edit攻击距离, 10) || parseInt(String(edit攻击距离 || '').match(/\d+/)?.[0], 10) || 0}
                                                    onChange={(n) => setEdit攻击距离(String(n))}
                                                    min={0}
                                                    max={999}
                                                    compact
                                                  />
                                                  <span className="text-dnd-text-muted text-xs shrink-0">尺</span>
                                                </div>
                                                <div className="flex items-center gap-2 flex-nowrap">
                                                  <span className="text-dnd-text-muted text-xs shrink-0">半径</span>
                                                  <NumberStepper
                                                    value={edit爆炸半径}
                                                    onChange={setEdit爆炸半径}
                                                    min={0}
                                                    max={999}
                                                    compact
                                                  />
                                                  <span className="text-dnd-text-muted text-xs shrink-0">尺</span>
                                                </div>
                                                <div className="min-w-0 flex-1 flex items-center">
                                                  <DamageDiceInlineRow
                                                    value={parseDamageString(edit攻击)}
                                                    onChange={(next) => {
                                                      if (next.value != null) {
                                                        setEdit攻击(formatDamageForAttack(next.value))
                                                        setEdit伤害(next.value.type ?? '')
                                                      }
                                                    }}
                                                    module={{ id: 'inventory-dmg', value: parseDamageString(edit攻击) }}
                                                    compact
                                                    leftLabel="伤害"
                                                  />
                                                </div>
                                              </div>
                                              <div className="flex flex-wrap items-center gap-3">
                                                <div>
                                                  <label className="block text-dnd-text-muted text-xs mb-1">攻击范围</label>
                                                  <select value={edit攻击范围} onChange={(e) => setEdit攻击范围(e.target.value)} className={inputClass + ' h-10'}>
                                                    <option value="">—</option>
                                                    <option value="近战">近战</option>
                                                    <option value="远程">远程</option>
                                                  </select>
                                                </div>
                                                <div className="flex-1 min-w-[8rem]">
                                                  <label className="block text-dnd-text-muted text-xs mb-1">词条（附注）</label>
                                                  <input type="text" value={edit附注} onChange={(e) => setEdit附注(e.target.value)} placeholder="如：1磅" className={inputClass + ' h-10 w-full'} />
                                                </div>
                                              </div>
                                            </>
                                          ) : (
                                            /* 武器：伤害 + 攻击距离 */
                                            <>
                                              <div className="sm:col-span-2">
                                                <DamageDiceInlineRow
                                                  value={parseDamageString(edit攻击)}
                                                  onChange={(next) => {
                                                    if (next.value != null) {
                                                      setEdit攻击(formatDamageForAttack(next.value))
                                                      setEdit伤害(next.value.type ?? '')
                                                    }
                                                  }}
                                                  module={{ id: 'inventory-dmg', value: parseDamageString(edit攻击) }}
                                                  compact
                                                  leftLabel="伤害"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-dnd-text-muted text-xs mb-1">攻击距离</label>
                                                <input type="text" value={edit攻击距离} onChange={(e) => setEdit攻击距离(e.target.value)} placeholder="如：20/40、30/60" className={inputClass + ' h-10'} />
                                              </div>
                                            </>
                                          )}
                                        </>
                                      )}
                                      {showEditArmorNote && (
                                        <div className="sm:col-span-2 space-y-2">
                                          <p className="text-dnd-text-muted text-xs">附注（护甲等级 AC、力量、隐匿）</p>
                                          {editArmorFields.isShield ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                              <div>
                                                <label className="block text-dnd-text-muted text-[10px] mb-0.5">AC 加值</label>
                                                <input
                                                  type="number"
                                                  min={0}
                                                  value={editArmorFields.shieldBonus}
                                                  onChange={(e) => setEditArmorFields((f) => ({ ...f, shieldBonus: e.target.value }))}
                                                  placeholder="2"
                                                  className={inputClass + ' h-9'}
                                                />
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                              <div>
                                                <label className="block text-dnd-text-muted text-[10px] mb-0.5">基础 AC</label>
                                                <input
                                                  type="number"
                                                  min={0}
                                                  value={editArmorFields.baseAC}
                                                  onChange={(e) => setEditArmorFields((f) => ({ ...f, baseAC: e.target.value }))}
                                                  placeholder="12"
                                                  className={inputClass + ' h-9'}
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-dnd-text-muted text-[10px] mb-0.5">敏调</label>
                                                <div className="flex gap-1 items-center">
                                                  <select
                                                    value={editArmorFields.dexMode}
                                                    onChange={(e) => setEditArmorFields((f) => ({ ...f, dexMode: e.target.value }))}
                                                    className="h-9 flex-1 min-w-0 rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                                                  >
                                                    <option value="none">不加</option>
                                                    <option value="full">加敏捷</option>
                                                    <option value="cap2">加敏捷（最大）</option>
                                                  </select>
                                                  {editArmorFields.dexMode === 'cap2' && (
                                                    <input
                                                      type="number"
                                                      min={1}
                                                      value={editArmorFields.dexCap}
                                                      onChange={(e) => setEditArmorFields((f) => ({ ...f, dexCap: parseInt(e.target.value, 10) || 2 }))}
                                                      className={inputClass + ' h-9 w-12 shrink-0'}
                                                    />
                                                  )}
                                                </div>
                                              </div>
                                              <div>
                                                <label className="block text-dnd-text-muted text-[10px] mb-0.5">力量要求</label>
                                                <input
                                                  type="text"
                                                  value={editArmorFields.strReq}
                                                  onChange={(e) => setEditArmorFields((f) => ({ ...f, strReq: e.target.value }))}
                                                  placeholder="— 或 13"
                                                  className={inputClass + ' h-9'}
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-dnd-text-muted text-[10px] mb-0.5">隐匿</label>
                                                <select
                                                  value={editArmorFields.stealth}
                                                  onChange={(e) => setEditArmorFields((f) => ({ ...f, stealth: e.target.value }))}
                                                  className="h-9 w-full rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                                                >
                                                  <option value="—">—</option>
                                                  <option value="劣势">劣势</option>
                                                </select>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )
                                })()}
                                <div className="sm:col-span-2">
                                  <label className="block text-dnd-text-muted text-xs mb-1">详细描述</label>
                                  <textarea value={edit详细介绍} onChange={(e) => setEdit详细介绍(e.target.value)} placeholder="附魔、说明等" rows={2} className={textareaClass} />
                                </div>
                                <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                                  <div className="w-24">
                                    <label className="block text-dnd-text-muted text-xs mb-1">数量</label>
                                    <NumberStepper
                                      value={editQty}
                                      onChange={(v) => setEditQty(Math.max(1, v))}
                                      min={1}
                                    />
                                  </div>
                                  <div className="w-28">
                                    <label className="block text-dnd-text-muted text-xs mb-1">增强加值</label>
                                    <div className="flex items-center rounded-lg border border-gray-600 bg-gray-800 overflow-hidden h-10">
                                      <button type="button" onClick={() => setEditMagicBonus(Math.max(0, (editMagicBonus ?? 0) - 1))} className="px-2.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-r border-gray-600 font-medium text-lg shrink-0">−</button>
                                      <input type="number" min={0} value={editMagicBonus ?? ''} onChange={(e) => setEditMagicBonus(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0))} className="w-12 h-full bg-transparent border-0 text-center text-white text-sm tabular-nums px-1 focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                                      <button type="button" onClick={() => setEditMagicBonus((editMagicBonus ?? 0) + 1)} className="px-2.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-l border-gray-600 font-medium text-lg shrink-0">+</button>
                                    </div>
                                  </div>
                                  <div className="w-24">
                                    <label className="block text-dnd-text-muted text-xs mb-1">充能</label>
                                    <NumberStepper
                                      value={editCharge || 0}
                                      onChange={(v) => setEditCharge(Math.max(0, v))}
                                      min={0}
                                    />
                                  </div>
                                  {editingProto?.类型 === '法器' && (editingProto?.充能上限 != null || /法杖|魔杖|权杖/.test(editingProto?.类别 ?? '')) && (
                                    <div className="w-24">
                                      <label className="block text-dnd-text-muted text-xs mb-1">充能上限</label>
                                      <NumberStepper
                                        value={editChargeMax ?? 0}
                                        onChange={(v) => setEditChargeMax(Math.max(0, v))}
                                        min={0}
                                      />
                                    </div>
                                  )}
                                  <button type="button" onClick={saveEdit} className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm">保存</button>
                                  <button type="button" onClick={cancelEdit} className="h-10 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm">取消</button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {canEdit && inv.length > 0 && (
            <p className="text-dnd-text-muted text-xs mt-1">同调位：{attunedCount}/{maxAttunementSlots}</p>
          )}
          {inv.length === 0 && <p className="text-gray-500 text-sm py-3 text-center">暂无物品</p>}
        </div>

        {/* 右侧：个人持有（完整钱包设计：核心资产 + 零钱 + 存入/取出） */}
        <div className="lg:border-l lg:border-white/10 lg:pl-4">
          <CurrencyGrid balances={wallet} title="个人持有" />
          {canEdit && (
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => { setTransferDirection('toVault'); setTransferOpen(true); }}
                className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white text-sm font-medium"
              >
                <ArrowDownToLine size={16} /> 存入金库
              </button>
              <button
                type="button"
                onClick={() => { setTransferDirection('fromVault'); setTransferOpen(true); }}
                className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium"
              >
                <ArrowUpFromLine size={16} /> 从金库取出
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部：负重条（含物品与货币重量） */}
      <div className="px-4 pt-3 pb-4 border-t border-white/10">
        <h3 className="text-dnd-text-muted text-xs font-medium uppercase tracking-wider mb-2">负重（含物品与货币）</h3>
        <EncumbranceBar character={character} />
      </div>

      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        direction={transferDirection}
        characterId={character?.id}
        characterName={character?.name}
        onSuccess={handleTransferSuccess}
      />

      {/* 存到团队仓库：可选数量 */}
      {storeToVaultIndex != null && inv[storeToVaultIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setStoreToVaultIndex(null)}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-dnd-gold-light text-sm font-bold mb-2">存到团队仓库</p>
            <p className="text-dnd-text-muted text-xs mb-2">当前：{invDisplayName(inv[storeToVaultIndex])} × {inv[storeToVaultIndex].qty}</p>
            <div className="flex items-center gap-2 mb-4">
              <label className="text-dnd-text-muted text-xs shrink-0">数量</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, Number(inv[storeToVaultIndex].qty) ?? 1)}
                value={storeToVaultQty}
                onChange={(e) => {
                  const max = Math.max(1, Number(inv[storeToVaultIndex].qty) ?? 1)
                  const v = parseInt(e.target.value, 10)
                  setStoreToVaultQty(Number.isNaN(v) ? 1 : Math.max(1, Math.min(max, v)))
                }}
                className={inputClass + ' h-10 w-24'}
              />
              <span className="text-dnd-text-muted text-xs">/ {inv[storeToVaultIndex].qty}</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setStoreToVaultIndex(null)} className="h-10 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm">取消</button>
              <button type="button" onClick={confirmStoreToVault} className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">确认存入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
