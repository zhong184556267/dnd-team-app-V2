import { useState, useEffect, Fragment } from 'react'
import { Package, Pencil, Trash2, GripVertical } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { logTeamActivity } from '../lib/activityLog'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getWarehouse, loadWarehouseIntoCache, addToWarehouse, removeFromWarehouse, updateWarehouseItem, reorderWarehouse, setWarehouse } from '../lib/warehouseStore'
import { getAllCharacters, updateCharacter } from '../lib/characterStore'
import { getItemWeightLb, parseWeightString } from '../lib/encumbrance'
import ItemAddForm from '../components/ItemAddForm'
import CurrencyPanel from '../components/CurrencyPanel'
import MagicCraftingPanel from '../components/MagicCraftingPanel'
import { NumberStepper } from '../components/BuffForm'
import { inputClass } from '../lib/inputStyles'

const subTitleClass = 'text-dnd-gold-light text-xs font-bold uppercase tracking-wider'

export default function Warehouse() {
  const { user } = useAuth()
  const { currentModuleId } = useModule()
  const [list, setList] = useState([])
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [depositIndex, setDepositIndex] = useState(null)
  const [depositCharId, setDepositCharId] = useState('')
  const [depositQty, setDepositQty] = useState(1)
  const [editingIndex, setEditingIndex] = useState(null)

  const characters = getAllCharacters(currentModuleId)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      await loadWarehouseIntoCache(currentModuleId)
      if (!cancelled) setList(getWarehouse(currentModuleId))
    }
    load()
    return () => { cancelled = true }
  }, [currentModuleId])

  useEffect(() => {
    const h = () => {
      loadWarehouseIntoCache(currentModuleId).then(() => {
        setList(getWarehouse(currentModuleId))
      })
    }
    window.addEventListener('dnd-realtime-warehouse', h)
    return () => window.removeEventListener('dnd-realtime-warehouse', h)
  }, [currentModuleId])

  const refreshList = () => setList(getWarehouse(currentModuleId))

  const handleRemove = (i) => {
    Promise.resolve(removeFromWarehouse(currentModuleId, i)).then(refreshList)
  }

  const reorderList = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setEditingIndex(null)
    Promise.resolve(reorderWarehouse(currentModuleId, fromIndex, toIndex)).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  /** 同名物品（显示名称一致）可合并数量 */
  const isSameItemForMerge = (a, b) => a && b && displayName(a) === displayName(b)

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
    const source = list[fromIndex]
    const target = list[toIndex]
    if (isSameItemForMerge(source, target)) {
      setEditingIndex(null)
      const qtyT = Math.max(1, Number(target?.qty) ?? 1)
      const qtyS = Math.max(1, Number(source?.qty) ?? 1)
      const chargeT = Number(target?.charge) || 0
      const chargeS = Number(source?.charge) || 0
      const merged = { ...target, qty: qtyT + qtyS, charge: chargeT + chargeS }
      const next = list.filter((_, i) => i !== fromIndex)
      const newToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      next[newToIndex] = merged
      Promise.resolve(setWarehouse(currentModuleId, next)).then(refreshList)
    } else {
      reorderList(fromIndex, toIndex)
    }
  }

  const setQty = (i, value) => {
    const n = Math.max(1, parseInt(value, 10) || 1)
    Promise.resolve(updateWarehouseItem(currentModuleId, i, { qty: n })).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  const setCharge = (i, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    Promise.resolve(updateWarehouseItem(currentModuleId, i, { charge: n })).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  const startEdit = (i) => {
    if (list[i]) setEditingIndex(i)
  }

  const applyEditSave = (entry) => {
    if (editingIndex == null) return
    Promise.resolve(updateWarehouseItem(currentModuleId, editingIndex, entry)).then(() => { refreshList(); setEditingIndex(null) })
  }

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
    const removePromise = q >= (Number(entry.qty) ?? 1)
      ? removeFromWarehouse(currentModuleId, depositIndex)
      : removeFromWarehouse(currentModuleId, depositIndex, q)
    Promise.resolve(updateCharacter(depositCharId, { inventory: [...inv, invEntry] }))
      .then(() => Promise.resolve(removePromise))
      .then(() => {
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将团队仓库「${displayName(entry)}」存入了角色「${char.name || '未命名'}」的背包`,
          })
        }
        refreshList()
      })
    setDepositIndex(null)
    setDepositCharId('')
    setDepositQty(1)
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
        <div className="px-1.5 py-1 border-b border-gray-600 flex items-center justify-between flex-wrap gap-1">
          <h3 className={subTitleClass + ' mb-0'}>团队仓库</h3>
          <>
            <button type="button" onClick={() => setAddFormOpen(true)} className="h-7 px-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-xs">
              添加物品
            </button>
            <ItemAddForm
              open={addFormOpen}
              onClose={() => setAddFormOpen(false)}
              onSave={(entry) => {
                Promise.resolve(addToWarehouse(currentModuleId, entry)).then(() => {
                  const nm = entry?.name?.trim() || entry?.itemId || '物品'
                  if (user?.name) {
                    logTeamActivity({
                      actor: user.name,
                      moduleId: currentModuleId,
                      summary: `玩家 ${user.name} 向团队仓库放入了「${nm}」`,
                    })
                  }
                  refreshList()
                  setAddFormOpen(false)
                })
              }}
              submitLabel="放入仓库"
              inventory={list}
            />
            <ItemAddForm open={editingIndex !== null} onClose={() => setEditingIndex(null)} onSave={applyEditSave} submitLabel="保存" editEntry={editingIndex != null ? list[editingIndex] : null} inventory={list} />
          </>
        </div>
        <div className="overflow-x-auto">
          <table className="inventory-table w-full text-xs" style={{ tableLayout: 'fixed', minWidth: '520px' }}>
            <colgroup>
              <col style={{ width: '1.9%' }} />
              <col style={{ width: '12.38%' }} />
              <col style={{ width: '9.52%' }} />
              <col style={{ width: '54.76%' }} />
              <col style={{ width: '9.52%' }} />
              <col style={{ width: '4.76%' }} />
              <col style={{ width: '7.14%' }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-800/80 text-dnd-text-muted text-[10px] uppercase tracking-wider" style={{ height: 48, minHeight: 48, maxHeight: 48 }}>
                <th className="py-0 px-4 align-middle text-center" style={{ height: 48, maxHeight: 48 }} title="拖拽排序" />
                <th className="py-0 px-4 font-semibold min-w-0 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>名称</th>
                <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>充能</th>
                <th className="py-0 px-4 font-semibold min-w-0 border-l border-gray-600 align-middle text-left" style={{ height: 48, maxHeight: 48 }}>简要介绍</th>
                <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>数量</th>
                <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }}>总重</th>
                <th className="py-0 px-4 border-l border-gray-600 align-middle text-center" style={{ height: 48, maxHeight: 48 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((entry, i) => {
                const qty = Math.max(1, Number(entry?.qty) ?? 1)
                const unitLb = getEntryWeight(entry)
                const totalLb = Math.round(unitLb * qty * 100) / 100
                return (
                  <Fragment key={i}>
                    <tr
                      className="border-t border-gray-700/80 hover:bg-gray-800/40 cursor-grab active:cursor-grabbing"
                      style={{ height: 48, minHeight: 48, maxHeight: 48 }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, i)}
                    >
                      <td className="py-1 px-4 align-middle text-center overflow-hidden" title="拖拽调整顺序" style={{ height: 48, maxHeight: 48 }}>
                        <span className="inline-flex justify-center"><GripVertical className="w-3.5 h-3.5" /></span>
                      </td>
                      <td className="py-1 px-4 text-white font-medium align-middle text-left overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <span className="inline-flex items-center gap-0.5 truncate max-w-full">
                          {displayName(entry)}
                          {(Number(entry.magicBonus) || 0) > 0 ? (
                            <span className="text-amber-200/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                          ) : null}
                          {(() => {
                            const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                            const stoneVal = stoneEffect != null && stoneEffect.value != null ? Number(stoneEffect.value) : null
                            if (stoneVal == null || Number.isNaN(stoneVal)) return null
                            return <span className="text-amber-200/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">{stoneVal}层</span>
                          })()}
                        </span>
                      </td>
                      <td className="py-1 px-2 border-l border-gray-600 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <div className="flex justify-center">
                          <NumberStepper
                            value={Number(entry.charge) || 0}
                            onChange={(v) => setCharge(i, v)}
                            min={0}
                            compact
                            pill
                          />
                        </div>
                      </td>
                      <td className="inventory-table-cell-brief py-1 px-4 text-dnd-text-body text-xs min-w-0 overflow-hidden border-l border-gray-600 align-middle text-left" style={{ height: 48, maxHeight: 48, overflow: 'hidden' }} title={getEntryBriefFull(entry) || undefined}>
                        <div className="min-h-0 overflow-hidden" style={{ maxHeight: 40 }}>
                          <span className="line-clamp-2 text-left inline-block w-full break-words">{getEntryBriefFull(entry) || '—'}</span>
                        </div>
                      </td>
                      <td className="py-1 px-2 border-l border-gray-600 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <div className="flex justify-center">
                          <NumberStepper
                            value={qty}
                            onChange={(v) => setQty(i, v)}
                            min={1}
                            compact
                            pill
                          />
                        </div>
                      </td>
                      <td className="py-1 px-2 tabular-nums text-dnd-text-body border-l border-gray-600 align-middle text-center overflow-hidden whitespace-nowrap" style={{ height: 48, maxHeight: 48 }}>{totalLb ? `${totalLb} lb` : ''}</td>
                      <td className="py-1 px-1 border-l border-gray-600 align-middle text-center overflow-hidden" style={{ height: 48, maxHeight: 48 }}>
                        <div className="flex items-center justify-center gap-0.5 min-w-0 max-w-full">
                          <button type="button" onClick={() => openDeposit(i)} title="存入角色" className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0">
                            <Package size={14} />
                          </button>
                          <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1 rounded text-amber-400 hover:bg-amber-400/20 shrink-0">
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => handleRemove(i)} title="移除" className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <p className="text-gray-500 text-sm py-2 text-center">暂无物品</p>}
      </div>

      {/* 魔法物品制作工厂 */}
      <section className="mt-8">
        <MagicCraftingPanel />
      </section>

      {/* 存入角色弹窗（样式与背包「存到团队仓库」一致） */}
      {depositIndex != null && list[depositIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDepositIndex(null)}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-dnd-gold-light text-sm font-bold mb-2">存入角色</p>
            <p className="text-dnd-text-muted text-xs mb-2">当前：{displayName(list[depositIndex])} × {list[depositIndex].qty}</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-dnd-text-muted text-xs shrink-0">选择角色</label>
                <select
                  value={depositCharId}
                  onChange={(e) => setDepositCharId(e.target.value)}
                  className={inputClass + ' h-10 w-full mt-1'}
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-dnd-text-muted text-xs shrink-0">数量</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, Number(list[depositIndex]?.qty) ?? 1)}
                  value={depositQty}
                  onChange={(e) => {
                    const max = Math.max(1, Number(list[depositIndex]?.qty) ?? 1)
                    const v = parseInt(e.target.value, 10)
                    setDepositQty(Number.isNaN(v) ? 1 : Math.max(1, Math.min(max, v)))
                  }}
                  className={inputClass + ' h-10 w-24'}
                />
                <span className="text-dnd-text-muted text-xs">/ {list[depositIndex].qty}</span>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDepositIndex(null)} className="h-10 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm">取消</button>
              <button type="button" onClick={confirmDeposit} disabled={!depositCharId} className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">确认存入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
