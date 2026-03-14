import { useState, useEffect, Fragment } from 'react'
import { Package, Pencil, Trash2, GripVertical } from 'lucide-react'
import { useModule } from '../contexts/ModuleContext'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getWarehouse, addToWarehouse, removeFromWarehouse, updateWarehouseItem, reorderWarehouse } from '../lib/warehouseStore'
import { getAllCharacters, updateCharacter } from '../lib/characterStore'
import { getItemWeightLb, parseWeightString } from '../lib/encumbrance'
import ItemAddForm from '../components/ItemAddForm'
import CurrencyPanel from '../components/CurrencyPanel'
import MagicCraftingPanel from '../components/MagicCraftingPanel'
import { DamageDiceInlineRow, NumberStepper } from '../components/BuffForm'
import { parseDamageString, formatDamageForAttack } from '../data/buffTypes'
import { inputClass, textareaClass } from '../lib/inputStyles'

/** 从护甲附注字符串解析为分格字段 */
function parseArmorNoteToFields(note) {
  const empty = { isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' }
  if (!note || typeof note !== 'string') return empty
  const s = note.trim()
  if (!s) return empty
  const shieldMatch = s.match(/AC\s*\+\s*(\d+)/i)
  if (shieldMatch) return { ...empty, isShield: true, shieldBonus: shieldMatch[1] }
  let baseAC = '', dexMode = 'none', dexCap = 2
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
  return { ...empty, baseAC, dexMode, dexCap, strReq, stealth }
}

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

export default function Warehouse() {
  const { currentModuleId } = useModule()
  const [list, setList] = useState([])
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [depositIndex, setDepositIndex] = useState(null)
  const [depositCharId, setDepositCharId] = useState('')
  const [depositQty, setDepositQty] = useState(1)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editName, setEditName] = useState('')
  const [edit攻击, setEdit攻击] = useState('')
  const [edit伤害, setEdit伤害] = useState('')
  const [edit攻击距离, setEdit攻击距离] = useState('')
  const [edit详细介绍, setEdit详细介绍] = useState('')
  const [edit附注, setEdit附注] = useState('')
  const [editArmorFields, setEditArmorFields] = useState(() => parseArmorNoteToFields(''))
  const [editQty, setEditQty] = useState(1)
  const [editMagicBonus, setEditMagicBonus] = useState(0)
  const [editCharge, setEditCharge] = useState(0)

  const characters = getAllCharacters(currentModuleId)

  useEffect(() => {
    setList(getWarehouse(currentModuleId))
  }, [currentModuleId])

  const refreshList = () => setList(getWarehouse(currentModuleId))

  const handleRemove = (i) => {
    removeFromWarehouse(currentModuleId, i)
    refreshList()
  }

  const reorderList = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setEditingIndex(null)
    setList(reorderWarehouse(currentModuleId, fromIndex, toIndex))
  }
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
    reorderList(fromIndex, toIndex)
  }

  const setQty = (i, value) => {
    const n = Math.max(1, parseInt(value, 10) || 1)
    const next = updateWarehouseItem(currentModuleId, i, { qty: n })
    setList(next)
  }

  const setCharge = (i, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    const next = updateWarehouseItem(currentModuleId, i, { charge: n })
    setList(next)
  }

  const startEdit = (i) => {
    const e = list[i]
    if (!e) return
    const proto = e.itemId ? getItemById(e.itemId) : null
    setEditingIndex(i)
    setEditName((e.name && e.name.trim()) || (proto ? getItemDisplayName(proto) : '') || '')
    setEdit攻击((e.攻击 != null && e.攻击 !== '') ? String(e.攻击) : (proto?.攻击 ?? ''))
    setEdit伤害((e.伤害 != null && e.伤害 !== '') ? String(e.伤害) : (proto?.伤害 ?? ''))
    setEdit攻击距离((e.攻击距离 != null && e.攻击距离 !== '') ? String(e.攻击距离) : '')
    setEdit详细介绍((e.详细介绍 != null && e.详细介绍 !== '') ? String(e.详细介绍) : '')
    setEdit附注((e.附注 != null && e.附注 !== '') ? String(e.附注) : '')
    if (proto?.类型 === '盔甲') setEditArmorFields(parseArmorNoteToFields(e.附注 ?? ''))
    setEditQty(Math.max(1, Number(e.qty) ?? 1))
    setEditMagicBonus(Number(e.magicBonus) || 0)
    setEditCharge(Number(e.charge) || 0)
  }

  const saveEdit = () => {
    if (editingIndex == null) return
    const e = list[editingIndex]
    const proto = e.itemId ? getItemById(e.itemId) : null
    const 附注Value = proto?.类型 === '盔甲' ? buildArmorNoteFromFields(editArmorFields) : (edit附注 != null && String(edit附注).trim() !== '' ? String(edit附注).trim() : (e.附注 ?? ''))
    const next = updateWarehouseItem(currentModuleId, editingIndex, {
      name: (editName && editName.trim()) || (proto ? getItemDisplayName(proto) : null) || e.name || '—',
      攻击: (edit攻击 && edit攻击.trim()) ?? e.攻击,
      伤害: (edit伤害 && edit伤害.trim()) ?? e.伤害,
      攻击距离: (edit攻击距离 && edit攻击距离.trim()) ?? e.攻击距离 ?? '',
      详细介绍: edit详细介绍?.trim() ?? e.详细介绍 ?? '',
      附注: 附注Value,
      qty: Math.max(1, editQty),
      magicBonus: Number(editMagicBonus) || 0,
      charge: Number(editCharge) || 0,
    })
    setList(next)
    setEditingIndex(null)
  }

  const cancelEdit = () => setEditingIndex(null)

  const openDeposit = (i) => {
    const e = list[i]
    if (!e) return
    setDepositIndex(i)
    setDepositCharId(characters[0]?.id ?? '')
    setDepositQty(Math.min(Math.max(1, Number(e.qty) ?? 1), 999))
  }

  const confirmDeposit = () => {
    if (depositIndex == null || !depositCharId) return
    const entry = list[depositIndex]
    if (!entry) { setDepositIndex(null); return }
    const char = characters.find((c) => c.id === depositCharId)
    if (!char) { setDepositIndex(null); return }
    const q = Math.max(1, Math.min(depositQty, Number(entry.qty) ?? 1))
    const proto = entry.itemId ? getItemById(entry.itemId) : null
    const invEntry = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      itemId: entry.itemId ?? undefined,
      name: (entry.name && entry.name.trim()) || (proto ? getItemDisplayName(proto) : '—'),
      攻击: entry.攻击 ?? '',
      伤害: entry.伤害 ?? '',
      详细介绍: entry.详细介绍 ?? '',
      ...(entry.附注 ? { 附注: entry.附注 } : {}),
      ...(entry.攻击距离 != null && entry.攻击距离 !== '' ? { 攻击距离: entry.攻击距离 } : {}),
      ...(entry.精通 ? { 精通: entry.精通 } : {}),
      重量: proto?.重量,
      qty: q,
      isAttuned: false,
      magicBonus: Number(entry.magicBonus) || 0,
      charge: Number(entry.charge) || 0,
      ...(Array.isArray(entry.effects) && entry.effects.length > 0 ? { effects: entry.effects } : {}),
    }
    const inv = char.inventory ?? []
    updateCharacter(depositCharId, { inventory: [...inv, invEntry] })
    if (q >= (Number(entry.qty) ?? 1)) {
      removeFromWarehouse(currentModuleId, depositIndex)
    } else {
      removeFromWarehouse(currentModuleId, depositIndex, q)
    }
    setDepositIndex(null)
    setDepositCharId('')
    setDepositQty(1)
    refreshList()
  }

  const displayName = (entry) => {
    if (entry.itemId) {
      const item = getItemById(entry.itemId)
      return entry.name?.trim() || getItemDisplayName(item)
    }
    return entry.name || '?'
  }

  const getEntryWeight = (entry) => {
    if (entry?.重量 != null && entry?.重量 !== '') return parseWeightString(entry.重量)
    if (!entry?.itemId) return 0
    return getItemWeightLb(getItemById(entry.itemId))
  }

  const getEntryBriefFull = (entry) => {
    const brief = entry?.详细介绍?.trim()
    const range = entry?.攻击距离?.trim()
    const parts = []
    if (brief) parts.push(brief)
    if (range) parts.push(`攻击距离 ${range}`)
    if (parts.length) return parts.join('；')
    if (entry?.附注?.trim()) return entry.附注.trim()
    return getItemById(entry?.itemId)?.详细介绍 ?? ''
  }

  return (
    <div className="p-4 pb-40 min-h-screen bg-dnd-bg">
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        团队仓库
      </h1>

      {/* 货币与金库 */}
      <section className="mb-6">
        <h2 className="text-dnd-text-muted text-sm font-medium mb-3 uppercase tracking-wider">货币与金库</h2>
        <CurrencyPanel />
      </section>

      <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAddFormOpen(true)} className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm">
            添加物品
          </button>
          <ItemAddForm open={addFormOpen} onClose={() => setAddFormOpen(false)} onSave={(entry) => { addToWarehouse(currentModuleId, entry); refreshList(); }} submitLabel="放入仓库" />
        </div>
        <div className="rounded border border-gray-600 overflow-hidden mt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-800/80 text-dnd-text-muted text-[10px] uppercase tracking-wider">
                <th className="py-1.5 px-1 w-8" title="拖拽排序" />
                <th className="text-left py-1.5 px-2 font-semibold">名称</th>
                <th className="text-left py-1.5 px-2 font-semibold min-w-[14rem] max-w-[24rem]">简要介绍</th>
                <th className="text-right py-1.5 px-1.5 w-12">充能</th>
                <th className="text-right py-1.5 px-1.5 w-12">数量</th>
                <th className="text-right py-1.5 px-1.5 w-14">总重</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {list.map((entry, i) => {
                const qty = Math.max(1, Number(entry?.qty) ?? 1)
                const unitLb = getEntryWeight(entry)
                const totalLb = Math.round(unitLb * qty * 100) / 100
                const isEditing = editingIndex === i
                return (
                  <Fragment key={i}>
                    <tr
                      className="border-t border-gray-700/80 hover:bg-gray-800/40 cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => handleDragStart(e, i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, i)}
                    >
                      <td className="py-1.5 px-1 text-gray-500" title="拖拽调整顺序">
                        <GripVertical className="w-4 h-4" />
                      </td>
                      <td className="py-1.5 px-2 text-white font-medium align-middle">
                        <span className="inline-flex items-center gap-0.5">
                          {displayName(entry)}
                          {(Number(entry.magicBonus) || 0) > 0 ? (
                            <span className="text-amber-200/90 text-xs font-mono tabular-nums">+{entry.magicBonus}</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-dnd-text-body max-w-[24rem] min-w-[14rem]">
                        <span className="line-clamp-2" title={getEntryBriefFull(entry)}>{getEntryBriefFull(entry) || '—'}</span>
                      </td>
                      <td className="py-1.5 px-1.5 text-right">
                        <div className="inline-flex items-center w-20">
                          <NumberStepper
                            value={Number(entry.charge) || 0}
                            onChange={(v) => setCharge(i, String(v))}
                            min={0}
                            compact
                          />
                        </div>
                      </td>
                      <td className="py-1.5 px-1.5 text-right">
                        <input
                          type="number"
                          min={1}
                          value={qty}
                          onChange={(e) => setQty(i, e.target.value)}
                          className="w-12 h-7 rounded bg-gray-700 border border-gray-600 text-white text-right text-xs tabular-nums px-1 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                        />
                      </td>
                      <td className="text-right py-1.5 px-1.5 tabular-nums text-dnd-text-body">{totalLb ? `${totalLb} lb` : ''}</td>
                      <td className="py-1.5 px-1.5">
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={() => openDeposit(i)} title="移交角色" className="p-1.5 rounded text-emerald-400 hover:bg-emerald-400/20">
                            <Package size={16} />
                          </button>
                          <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1.5 rounded text-amber-400 hover:bg-amber-400/20">
                            <Pencil size={16} />
                          </button>
                          <button type="button" onClick={() => handleRemove(i)} title="移除" className="p-1.5 rounded text-dnd-red hover:text-dnd-red/20">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="border-t-0 bg-gray-800/80">
                        <td colSpan={7} className="py-3 px-3">
                          <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="sm:col-span-2">
                                <label className="block text-dnd-text-muted text-xs mb-1">名称</label>
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="名称" className={inputClass + ' h-10'} />
                              </div>
                              {(() => {
                                const editingProto = list[editingIndex]?.itemId ? getItemById(list[editingIndex].itemId) : null
                                const showEditAttackDamage = editingProto && (editingProto.类型 === '近战武器' || editingProto.类型 === '远程武器' || editingProto.类型 === '枪械')
                                return showEditAttackDamage ? (
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
                                        module={{ id: 'warehouse-dmg', value: parseDamageString(edit攻击) }}
                                        compact
                                        leftLabel="伤害"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-dnd-text-muted text-xs mb-1">攻击距离</label>
                                      <input type="text" value={edit攻击距离} onChange={(e) => setEdit攻击距离(e.target.value)} placeholder="如：20/40、30/60" className={inputClass + ' h-10'} />
                                    </div>
                                  </>
                                ) : null
                              })()}
                              {list[editingIndex]?.itemId && getItemById(list[editingIndex].itemId)?.类型 === '盔甲' && (
                                <div className="sm:col-span-2 space-y-2">
                                  <p className="text-dnd-text-muted text-xs">附注（护甲 AC、力量、隐匿）</p>
                                  {editArmorFields.isShield ? (
                                    <div>
                                      <label className="block text-dnd-text-muted text-[10px] mb-0.5">AC 加值</label>
                                      <input type="number" min={0} value={editArmorFields.shieldBonus} onChange={(e) => setEditArmorFields((f) => ({ ...f, shieldBonus: e.target.value }))} className={inputClass + ' h-9 w-20'} />
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      <div>
                                        <label className="block text-dnd-text-muted text-[10px] mb-0.5">基础 AC</label>
                                        <input type="number" min={0} value={editArmorFields.baseAC} onChange={(e) => setEditArmorFields((f) => ({ ...f, baseAC: e.target.value }))} className={inputClass + ' h-9'} />
                                      </div>
                                      <div>
                                        <label className="block text-dnd-text-muted text-[10px] mb-0.5">敏调</label>
                                        <select value={editArmorFields.dexMode} onChange={(e) => setEditArmorFields((f) => ({ ...f, dexMode: e.target.value }))} className="h-9 w-full rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red">
                                          <option value="none">不加</option>
                                          <option value="full">加敏捷</option>
                                          <option value="cap2">加敏捷（最大）</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-dnd-text-muted text-[10px] mb-0.5">力量要求</label>
                                        <input type="text" value={editArmorFields.strReq} onChange={(e) => setEditArmorFields((f) => ({ ...f, strReq: e.target.value }))} className={inputClass + ' h-9'} />
                                      </div>
                                      <div>
                                        <label className="block text-dnd-text-muted text-[10px] mb-0.5">隐匿</label>
                                        <select value={editArmorFields.stealth} onChange={(e) => setEditArmorFields((f) => ({ ...f, stealth: e.target.value }))} className="h-9 w-full rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red">
                                          <option value="—">—</option>
                                          <option value="劣势">劣势</option>
                                        </select>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="sm:col-span-2">
                                <label className="block text-dnd-text-muted text-xs mb-1">详细描述</label>
                                <textarea value={edit详细介绍} onChange={(e) => setEdit详细介绍(e.target.value)} placeholder="附魔、说明等" rows={2} className={textareaClass} />
                              </div>
                              <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                                <div className="w-20">
                                  <label className="block text-dnd-text-muted text-xs mb-1">数量</label>
                                  <input type="number" min={1} value={editQty} onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-10'} />
                                </div>
                                <div className="w-28">
                                  <label className="block text-dnd-text-muted text-xs mb-1">增强加值</label>
                                  <div className="flex items-center rounded-lg border border-gray-600 bg-gray-800 overflow-hidden h-10">
                                    <button type="button" onClick={() => setEditMagicBonus(Math.max(0, (editMagicBonus || 0) - 1))} className="px-2.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-r border-gray-600 font-medium text-lg shrink-0">−</button>
                                    <input type="number" min={0} value={editMagicBonus || ''} onChange={(e) => setEditMagicBonus(parseInt(e.target.value, 10) || 0)} className="w-12 h-full bg-transparent border-0 text-center text-white text-sm tabular-nums px-1 focus:outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                                    <button type="button" onClick={() => setEditMagicBonus((editMagicBonus || 0) + 1)} className="px-2.5 h-full flex items-center justify-center text-dnd-text-muted hover:text-white hover:bg-gray-700 border-l border-gray-600 font-medium text-lg shrink-0">+</button>
                                  </div>
                                </div>
                                <div className="w-16">
                                  <label className="block text-dnd-text-muted text-xs mb-1">充能</label>
                                  <input type="number" min={0} value={editCharge || ''} onChange={(e) => setEditCharge(parseInt(e.target.value, 10) || 0)} className={inputClass + ' h-10'} />
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
        {list.length === 0 && (
          <p className="text-gray-500 text-sm py-4">仓库暂无物品，可点击「添加物品」添加。</p>
        )}
      </div>

      {/* 魔法物品制作工厂 */}
      <section className="mt-8">
        <MagicCraftingPanel />
      </section>

      {/* 移交角色弹窗 */}
      {depositIndex != null && list[depositIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setDepositIndex(null)}>
          <div
            className="rounded-xl bg-dnd-card border border-white/10 shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="font-display font-semibold text-white">移交角色</h2>
              <p className="text-dnd-text-muted text-sm mt-1">{displayName(list[depositIndex])}</p>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">选择角色</label>
                <select
                  value={depositCharId}
                  onChange={(e) => setDepositCharId(e.target.value)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red focus:outline-none"
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                  ))}
                </select>
              </div>
              {(Number(list[depositIndex]?.qty) ?? 1) > 1 && (
                <div>
                  <label className="block text-dnd-text-muted text-xs mb-1">数量</label>
                  <input
                    type="number"
                    min={1}
                    max={Number(list[depositIndex]?.qty) ?? 1}
                    value={depositQty}
                    onChange={(e) => setDepositQty(Math.max(1, Math.min(Number(list[depositIndex]?.qty) ?? 1, parseInt(e.target.value, 10) || 1)))}
                    className={inputClass + ' w-full'}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDepositIndex(null)}
                className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeposit}
                disabled={!depositCharId}
                className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认移交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
