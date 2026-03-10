import { useState, useEffect, Fragment } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Trash2, Package } from 'lucide-react'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getCharacterWallet } from '../lib/currencyStore'
import { addToWarehouse } from '../lib/warehouseStore'
import { CurrencyGrid } from './CurrencyDisplay'
import { getItemWeightLb } from '../lib/encumbrance'
import { getMaxAttunementSlots, getAttunedCountFromInventory } from '../lib/combatState'
import ItemPicker from './ItemPicker'
import EncumbranceBar from './EncumbranceBar'
import TransferModal from './TransferModal'
import { inputClass, textareaClass, labelClass } from '../lib/inputStyles'

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
  const [selectedItemId, setSelectedItemId] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [instance攻击, setInstance攻击] = useState('')
  const [instance伤害, setInstance伤害] = useState('')
  const [instance详细介绍, setInstance详细介绍] = useState('')
  const [instance附注, setInstance附注] = useState('')
  const [instanceArmorFields, setInstanceArmorFields] = useState(() => parseArmorNoteToFields(''))
  const [instanceQty, setInstanceQty] = useState(1)
  const [instanceMagicBonus, setInstanceMagicBonus] = useState(0)
  const [wallet, setWallet] = useState({})
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDirection, setTransferDirection] = useState('toVault')
  const [editingIndex, setEditingIndex] = useState(null)
  const [editName, setEditName] = useState('')
  const [edit攻击, setEdit攻击] = useState('')
  const [edit伤害, setEdit伤害] = useState('')
  const [edit详细介绍, setEdit详细介绍] = useState('')
  const [edit附注, setEdit附注] = useState('')
  const [editArmorFields, setEditArmorFields] = useState(() => parseArmorNoteToFields(''))
  const [editQty, setEditQty] = useState(1)
  const [editMagicBonus, setEditMagicBonus] = useState(0)
  const [storeToVaultIndex, setStoreToVaultIndex] = useState(null)
  const [storeToVaultQty, setStoreToVaultQty] = useState(1)

  const selectedPrototype = selectedItemId ? getItemById(selectedItemId) : null
  const showAttackDamage = selectedPrototype && (selectedPrototype.类型 === '武器' || selectedPrototype.类型 === '枪械')
  const showArmorNote = selectedPrototype && selectedPrototype.类型 === '盔甲'
  const isShield = selectedPrototype?.子类型 === '盾牌'
  const maxAttunementSlots = getMaxAttunementSlots(character?.buffs ?? [])
  const attunedCount = getAttunedCountFromInventory(inv)

  useEffect(() => {
    if (character?.id) setWallet(getCharacterWallet(character.id))
  }, [character?.id, character?.wallet])

  useEffect(() => {
    if (!selectedItemId) return
    const proto = getItemById(selectedItemId)
    setInstanceName('')
    setInstance攻击(proto?.攻击 ?? '')
    setInstance伤害(proto?.伤害 ?? '')
    setInstance详细介绍(proto?.详细介绍 ?? '')
    setInstance附注(proto?.附注 ?? '')
    if (proto?.类型 === '盔甲') {
      setInstanceArmorFields(parseArmorNoteToFields(proto?.附注 ?? ''))
    }
    setInstanceQty(1)
    setInstanceMagicBonus(0)
  }, [selectedItemId])

  const handleAddFromPicker = () => {
    if (!selectedItemId) return
    const proto = getItemById(selectedItemId)
    const 附注Value = showArmorNote ? buildArmorNoteFromFields(instanceArmorFields) : (instance附注?.trim() || '')
    const entry = {
      id: 'inv_' + Date.now(),
      itemId: selectedItemId,
      name: (instanceName && instanceName.trim()) || proto?.类别 || getItemDisplayName(proto) || '—',
      攻击: (instance攻击 && instance攻击.trim()) || (proto?.攻击 ?? ''),
      伤害: (instance伤害 && instance伤害.trim()) || (proto?.伤害 ?? ''),
      详细介绍: instance详细介绍?.trim() ?? '',
      ...(附注Value ? { 附注: 附注Value } : {}),
      重量: proto?.重量,
      qty: Math.max(1, instanceQty),
      isAttuned: false,
      magicBonus: Number(instanceMagicBonus) || 0,
    }
    onSave({ inventory: [...inv, entry] })
    setSelectedItemId('')
    setInstanceName('')
    setInstance攻击('')
    setInstance伤害('')
    setInstance详细介绍('')
    setInstance附注('')
    setInstanceArmorFields(parseArmorNoteToFields(''))
    setInstanceQty(1)
    setInstanceMagicBonus(0)
  }

  const removeItem = (index) => {
    onSave({ inventory: inv.filter((_, i) => i !== index) })
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
    if (e.itemId) {
      addToWarehouse({
        itemId: e.itemId,
        name: e.name,
        攻击: e.攻击,
        伤害: e.伤害,
        详细介绍: e.详细介绍,
        ...(e.附注 ? { 附注: e.附注 } : {}),
        qty: toStore,
      })
    } else {
      addToWarehouse({ name: e.name || '—', qty: toStore })
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

  const startEdit = (index) => {
    const e = inv[index]
    if (!e) return
    const proto = e.itemId ? getItemById(e.itemId) : null
    setEditingIndex(index)
    setEditName((e.name && e.name.trim()) || '')
    setEdit攻击((e.攻击 != null && e.攻击 !== '') ? String(e.攻击) : '')
    setEdit伤害((e.伤害 != null && e.伤害 !== '') ? String(e.伤害) : '')
    setEdit详细介绍((e.详细介绍 != null && e.详细介绍 !== '') ? String(e.详细介绍) : '')
    setEdit附注((e.附注 != null && e.附注 !== '') ? String(e.附注) : '')
    if (proto?.类型 === '盔甲') {
      setEditArmorFields(parseArmorNoteToFields(e.附注 ?? ''))
    }
    setEditQty(Math.max(1, Number(e.qty) ?? 1))
    setEditMagicBonus(Number(e.magicBonus) || 0)
  }

  const saveEdit = () => {
    if (editingIndex == null) return
    const e = inv[editingIndex]
    const proto = e.itemId ? getItemById(e.itemId) : null
    const 附注Value = proto?.类型 === '盔甲' ? buildArmorNoteFromFields(editArmorFields) : (edit附注 != null && String(edit附注).trim() !== '' ? String(edit附注).trim() : (e.附注 ?? ''))
    const next = [...inv]
    next[editingIndex] = {
      ...e,
      name: (editName && editName.trim()) || e.name || '—',
      攻击: (edit攻击 && edit攻击.trim()) || e.攻击,
      伤害: (edit伤害 && edit伤害.trim()) || e.伤害,
      详细介绍: edit详细介绍?.trim() ?? e.详细介绍 ?? '',
      附注: 附注Value,
      qty: Math.max(1, editQty),
      magicBonus: Number(editMagicBonus) || 0,
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
    if (entry?.重量 != null && entry?.重量 !== '') return Number(entry.重量) || 0
    if (!entry?.itemId) return 0
    const item = getItemById(entry.itemId)
    return getItemWeightLb(item)
  }

  const getEntryBriefFull = (entry) => {
    const brief = entry?.详细介绍?.trim()
    if (brief) return brief
    if (entry?.附注?.trim()) return entry.附注.trim()
    return getItemById(entry?.itemId)?.详细介绍 ?? ''
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
            <div className="space-y-3 mb-3">
              <p className="text-dnd-text-muted text-xs">从下拉菜单中，选择物品再进行定制修改</p>
              <div className="flex-1 min-w-[18rem]">
                <ItemPicker
                  value={selectedItemId}
                  onChange={setSelectedItemId}
                  placeholder="— 选择物品（类型→子类型→物品）—"
                />
              </div>
              {selectedItemId && selectedPrototype && (
                <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3 space-y-3">
                  <p className="text-dnd-text-muted text-xs">基于「{getItemDisplayName(selectedPrototype)}」修改后放入背包</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-dnd-text-muted text-xs mb-1">名称</label>
                      <input
                        type="text"
                        value={instanceName}
                        onChange={(e) => setInstanceName(e.target.value)}
                        placeholder={`不填则用「${getItemDisplayName(selectedPrototype)}」`}
                        className={inputClass + ' h-10'}
                      />
                    </div>
                    {showArmorNote && (
                      <div className="sm:col-span-2 space-y-2">
                        <p className="text-dnd-text-muted text-xs">附注（护甲等级 AC、力量、隐匿）</p>
                        {instanceArmorFields.isShield ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">AC 加值</label>
                              <input
                                type="number"
                                min={0}
                                value={instanceArmorFields.shieldBonus}
                                onChange={(e) => setInstanceArmorFields((f) => ({ ...f, shieldBonus: e.target.value }))}
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
                                value={instanceArmorFields.baseAC}
                                onChange={(e) => setInstanceArmorFields((f) => ({ ...f, baseAC: e.target.value }))}
                                placeholder="12"
                                className={inputClass + ' h-9'}
                              />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">敏调</label>
                              <div className="flex gap-1 items-center">
                                <select
                                  value={instanceArmorFields.dexMode}
                                  onChange={(e) => setInstanceArmorFields((f) => ({ ...f, dexMode: e.target.value }))}
                                  className="h-9 flex-1 min-w-0 rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                                >
                                  <option value="none">不加</option>
                                  <option value="full">加敏捷</option>
                                  <option value="cap2">加敏捷（最大）</option>
                                </select>
                                {instanceArmorFields.dexMode === 'cap2' && (
                                  <input
                                    type="number"
                                    min={1}
                                    value={instanceArmorFields.dexCap}
                                    onChange={(e) => setInstanceArmorFields((f) => ({ ...f, dexCap: parseInt(e.target.value, 10) || 2 }))}
                                    className={inputClass + ' h-9 w-12 shrink-0'}
                                  />
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">力量要求</label>
                              <input
                                type="text"
                                value={instanceArmorFields.strReq}
                                onChange={(e) => setInstanceArmorFields((f) => ({ ...f, strReq: e.target.value }))}
                                placeholder="— 或 13"
                                className={inputClass + ' h-9'}
                              />
                            </div>
                            <div>
                              <label className="block text-dnd-text-muted text-[10px] mb-0.5">隐匿</label>
                              <select
                                value={instanceArmorFields.stealth}
                                onChange={(e) => setInstanceArmorFields((f) => ({ ...f, stealth: e.target.value }))}
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
                    {showAttackDamage && (
                      <>
                        <div>
                          <label className="block text-dnd-text-muted text-xs mb-1">攻击（伤害骰与类型）</label>
                          <input
                            type="text"
                            value={instance攻击}
                            onChange={(e) => setInstance攻击(e.target.value)}
                            placeholder="如：1d8 挥砍"
                            className={inputClass + ' h-10'}
                          />
                        </div>
                        <div>
                          <label className="block text-dnd-text-muted text-xs mb-1">伤害类型</label>
                          <input
                            type="text"
                            value={instance伤害}
                            onChange={(e) => setInstance伤害(e.target.value)}
                            placeholder="如：挥砍、穿刺"
                            className={inputClass + ' h-10'}
                          />
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <label className="block text-dnd-text-muted text-xs mb-1">详细描述</label>
                      <textarea
                        value={instance详细介绍}
                        onChange={(e) => setInstance详细介绍(e.target.value)}
                        placeholder="附魔、说明等"
                        rows={2}
                        className={textareaClass}
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                      <div className="w-20">
                        <label className="block text-dnd-text-muted text-xs mb-1">数量</label>
                        <input
                          type="number"
                          min={1}
                          value={instanceQty}
                          onChange={(e) => setInstanceQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className={inputClass + ' h-10'}
                        />
                      </div>
                      <div className="w-20">
                        <label className="block text-dnd-text-muted text-xs mb-1">{showArmorNote ? '增强加值' : '魔法充能'}</label>
                        <input
                          type="number"
                          min={0}
                          value={instanceMagicBonus || ''}
                          onChange={(e) => setInstanceMagicBonus(parseInt(e.target.value, 10) || 0)}
                          placeholder={showArmorNote ? '如 +1 护甲' : '0'}
                          className={inputClass + ' h-10'}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddFromPicker}
                        className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm"
                      >
                        放入背包
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="rounded-lg border border-gray-600 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/80 text-dnd-text-muted text-xs uppercase tracking-wider">
                  {canEdit && <th className="text-center py-2 px-2 w-12" title="同调">同调</th>}
                  <th className="text-left py-2 px-3 font-semibold">名称</th>
                  <th className="text-left py-2 px-3 font-semibold min-w-[10rem] max-w-[16rem]">简要介绍</th>
                  <th className="text-right py-2 px-2 w-14">数量</th>
                  <th className="text-right py-2 px-2 w-16">单重</th>
                  <th className="text-right py-2 px-2 w-16">总重</th>
                  <th className="text-right py-2 px-2 w-16">魔法充能</th>
                  {canEdit && <th className="w-14" />}
                </tr>
              </thead>
              <tbody>
                {inv.map((entry, i) => {
                  const qty = Math.max(1, Number(entry?.qty) ?? 1)
                  const unitLb = getEntryWeight(entry)
                  const totalLb = Math.round(unitLb * qty * 100) / 100
                  const canAttune = entry.isAttuned || attunedCount < maxAttunementSlots
                  const isEditing = canEdit && editingIndex === i
                  return (
                    <Fragment key={entry.id ?? `inv-${i}`}>
                      <tr className="border-t border-gray-700/80 hover:bg-gray-800/40">
                        {canEdit && (
                          <td className="py-2 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!entry.isAttuned}
                              disabled={!canAttune && !entry.isAttuned}
                              onChange={(e) => setAttuned(i, e.target.checked)}
                              className="rounded border-gray-500"
                            />
                          </td>
                        )}
                        <td className="py-2 px-3 text-white font-medium">{invDisplayName(entry)}</td>
                        <td className="py-2 px-3 text-dnd-text-body text-xs max-w-[16rem] min-w-[10rem]">
                          <span className="line-clamp-2" title={getEntryBriefFull(entry)}>{getEntryBriefFull(entry) || '—'}</span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          {canEdit ? (
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => setQty(i, e.target.value)}
                              className="w-14 h-8 rounded bg-gray-700 border border-gray-600 text-white text-right text-sm tabular-nums px-1.5 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                            />
                          ) : (
                            <span className="tabular-nums text-dnd-text-body">{qty}</span>
                          )}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums text-dnd-text-muted">{unitLb ? `${unitLb} lb` : '—'}</td>
                        <td className="text-right py-2 px-2 tabular-nums text-dnd-text-body">{totalLb ? `${totalLb} lb` : '—'}</td>
                        <td className="py-2 px-2 text-right">
                          {canEdit ? (
                            <input
                              type="number"
                              min={0}
                              value={Number(entry.magicBonus) || ''}
                              onChange={(e) => setMagicBonus(i, e.target.value)}
                              placeholder="0"
                              className="w-14 h-8 rounded bg-gray-700 border border-gray-600 text-white text-right text-sm tabular-nums px-1.5 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500"
                            />
                          ) : (
                            <span className="tabular-nums text-dnd-text-body">{(Number(entry.magicBonus) || 0) > 0 ? entry.magicBonus : '—'}</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => openStoreToVault(i)} title="存到团队仓库" className="p-1.5 rounded text-emerald-400 hover:bg-emerald-400/20">
                                <Package size={16} />
                              </button>
                              <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1.5 rounded text-amber-400 hover:bg-amber-400/20">
                                <Pencil size={16} />
                              </button>
                              <button type="button" onClick={() => removeItem(i)} title="移除" className="p-1.5 rounded text-dnd-red hover:bg-dnd-red/20">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {isEditing && (
                        <tr className="border-t-0 bg-gray-800/80">
                          <td colSpan={canEdit ? 8 : 6} className="py-3 px-3">
                            <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3 space-y-3">
                              <p className="text-dnd-text-muted text-xs mb-2">修改此项信息</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="sm:col-span-2">
                                  <label className="block text-dnd-text-muted text-xs mb-1">名称</label>
                                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="名称" className={inputClass + ' h-10'} />
                                </div>
                                {(() => {
                                  const editingProto = inv[editingIndex]?.itemId ? getItemById(inv[editingIndex].itemId) : null
                                  const showEditAttackDamage = editingProto && (editingProto.类型 === '武器' || editingProto.类型 === '枪械')
                                  const showEditArmorNote = editingProto && editingProto.类型 === '盔甲'
                                  return (
                                    <>
                                      {showEditAttackDamage && (
                                        <>
                                          <div>
                                            <label className="block text-dnd-text-muted text-xs mb-1">攻击（伤害骰与类型）</label>
                                            <input type="text" value={edit攻击} onChange={(e) => setEdit攻击(e.target.value)} placeholder="如：1d8 挥砍" className={inputClass + ' h-10'} />
                                          </div>
                                          <div>
                                            <label className="block text-dnd-text-muted text-xs mb-1">伤害类型</label>
                                            <input type="text" value={edit伤害} onChange={(e) => setEdit伤害(e.target.value)} placeholder="如：挥砍、穿刺" className={inputClass + ' h-10'} />
                                          </div>
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
                                  <div className="w-20">
                                    <label className="block text-dnd-text-muted text-xs mb-1">数量</label>
                                    <input type="number" min={1} value={editQty} onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-10'} />
                                  </div>
                                  <div className="w-16">
                                    <label className="block text-dnd-text-muted text-xs mb-1">
                                      {inv[editingIndex]?.itemId && getItemById(inv[editingIndex].itemId)?.类型 === '盔甲' ? '增强加值' : '魔法充能'}
                                    </label>
                                    <input type="number" min={0} value={editMagicBonus || ''} onChange={(e) => setEditMagicBonus(parseInt(e.target.value, 10) || 0)} placeholder={inv[editingIndex]?.itemId && getItemById(inv[editingIndex].itemId)?.类型 === '盔甲' ? '如 +1' : '0'} className={inputClass + ' h-10'} />
                                  </div>
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
