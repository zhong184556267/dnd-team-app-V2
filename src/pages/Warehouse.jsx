import { useState, useEffect } from 'react'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getWarehouse, addToWarehouse, removeFromWarehouse } from '../lib/warehouseStore'
import { getAllCharacters, updateCharacter } from '../lib/characterStore'
import ItemPicker from '../components/ItemPicker'
import CurrencyPanel from '../components/CurrencyPanel'
import { inputClass, textareaClass } from '../lib/inputStyles'

export default function Warehouse() {
  const [list, setList] = useState([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [instanceQty, setInstanceQty] = useState(1)
  const [instance攻击, setInstance攻击] = useState('')
  const [instance伤害, setInstance伤害] = useState('')
  const [instance详细介绍, setInstance详细介绍] = useState('')
  const [instance附注, setInstance附注] = useState('')
  const [customName, setCustomName] = useState('')
  const [depositIndex, setDepositIndex] = useState(null)
  const [depositCharId, setDepositCharId] = useState('')
  const [depositQty, setDepositQty] = useState(1)

  const characters = getAllCharacters()
  const selectedPrototype = selectedItemId ? getItemById(selectedItemId) : null
  const itemType = selectedPrototype?.类型 ?? ''
  const showAttackDamage = itemType === '武器' || itemType === '枪械'
  const showArmorNote = itemType === '盔甲'

  useEffect(() => {
    setList(getWarehouse())
  }, [])

  const refreshList = () => setList(getWarehouse())

  const handleAddFromList = (overrides = {}) => {
    if (!selectedItemId) return
    const name = overrides.name != null ? String(overrides.name).trim() : ''
    const qty = Math.max(1, parseInt(overrides.qty, 10) || 1)
    const 攻击 = overrides.攻击 != null ? String(overrides.攻击).trim() : ''
    const 伤害 = overrides.伤害 != null ? String(overrides.伤害).trim() : ''
    const 详细介绍 = overrides.详细介绍 != null ? String(overrides.详细介绍).trim() : ''
    const 附注 = overrides.附注 != null ? String(overrides.附注).trim() : ''
    addToWarehouse({
      itemId: selectedItemId,
      ...(name ? { name } : {}),
      ...(攻击 ? { 攻击 } : {}),
      ...(伤害 ? { 伤害 } : {}),
      ...(详细介绍 ? { 详细介绍 } : {}),
      ...(附注 ? { 附注 } : {}),
      qty,
    })
    setSelectedItemId('')
    setInstanceName('')
    setInstanceQty(1)
    setInstance攻击('')
    setInstance伤害('')
    setInstance详细介绍('')
    setInstance附注('')
    refreshList()
  }

  const handleAddCustomName = () => {
    const n = customName.trim()
    if (!n) return
    addToWarehouse({ name: n, qty: 1 })
    setCustomName('')
    refreshList()
  }

  const handleRemove = (i) => {
    removeFromWarehouse(i)
    refreshList()
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
      重量: proto?.重量,
      qty: q,
      isAttuned: false,
      magicBonus: 0,
    }
    const inv = char.inventory ?? []
    updateCharacter(depositCharId, { inventory: [...inv, invEntry] })
    if (q >= (Number(entry.qty) ?? 1)) {
      removeFromWarehouse(depositIndex)
    } else {
      removeFromWarehouse(depositIndex, q)
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

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        团队仓库
      </h1>

      {/* 货币与金库 */}
      <section className="mb-6">
        <h2 className="text-dnd-text-muted text-sm font-medium mb-3 uppercase tracking-wider">货币与金库</h2>
        <CurrencyPanel />
      </section>

      <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 space-y-4">
        <p className="text-dnd-text-muted text-xs mb-1">从物品库选择原型，再基于该物品填写（可选）后放入仓库</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[18rem]">
            <ItemPicker
              value={selectedItemId}
              onChange={(id) => {
                setSelectedItemId(id)
                const proto = id ? getItemById(id) : null
                setInstanceName('')
                setInstanceQty(1)
                setInstance攻击(proto?.攻击 ?? '')
                setInstance伤害(proto?.伤害 ?? '')
                setInstance详细介绍(proto?.详细介绍 ?? '')
                setInstance附注(proto?.附注 ?? '')
              }}
              placeholder="— 选择物品（原型）—"
            />
          </div>
        </div>
        {selectedItemId && selectedPrototype && (
          <div className="rounded-lg border border-gray-600 bg-gray-800/60 p-3 space-y-3">
            <p className="text-dnd-text-muted text-xs">
              {showAttackDamage ? '基于「' + getItemDisplayName(selectedPrototype) + '」修改（选填，多数自定义需改伤害与描述）' : '基于「' + getItemDisplayName(selectedPrototype) + '」修改（选填）'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-dnd-text-muted text-xs mb-1">自定义名称</label>
                <input
                  type="text"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder={`不填则显示「${getItemDisplayName(selectedPrototype)}」`}
                  className={inputClass}
                />
              </div>
              {showArmorNote && (
                <div className="sm:col-span-2">
                  <label className="block text-dnd-text-muted text-xs mb-1">附注（护甲等级 AC、力量、隐匿）</label>
                  <input
                    type="text"
                    value={instance附注}
                    onChange={(e) => setInstance附注(e.target.value)}
                    placeholder="如：AC 12+敏捷；力量—；隐匿—"
                    className={inputClass}
                  />
                </div>
              )}
              {showAttackDamage && (
                <>
                  <div>
                    <label className="block text-dnd-text-muted text-xs mb-1">伤害骰与类型（攻击）</label>
                    <input
                      type="text"
                      value={instance攻击}
                      onChange={(e) => setInstance攻击(e.target.value)}
                      placeholder="如：1d8 挥砍"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-dnd-text-muted text-xs mb-1">伤害类型</label>
                    <input
                      type="text"
                      value={instance伤害}
                      onChange={(e) => setInstance伤害(e.target.value)}
                      placeholder="如：挥砍、穿刺、钝击"
                      className={inputClass}
                    />
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <label className="block text-dnd-text-muted text-xs mb-1">详细描述</label>
                <textarea
                  value={instance详细介绍}
                  onChange={(e) => setInstance详细介绍(e.target.value)}
                  placeholder="来历、附魔、特殊说明等"
                  rows={3}
                  className={textareaClass + ' min-h-[4rem]'}
                />
              </div>
              <div className="flex flex-wrap gap-2 items-end sm:col-span-2">
                <div className="w-24">
                  <label className="block text-dnd-text-muted text-xs mb-1">数量</label>
                  <input
                    type="number"
                    min={1}
                    value={instanceQty}
                    onChange={(e) => setInstanceQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddFromList({
                    name: instanceName,
                    攻击: instance攻击,
                    伤害: instance伤害,
                    详细介绍: instance详细介绍,
                    附注: instance附注,
                    qty: instanceQty,
                  })}
                  className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm shrink-0"
                >
                  放入仓库
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustomName()}
            placeholder="或直接输入物品名"
            className={inputClass + ' h-12 flex-1'}
          />
          <button
            type="button"
            onClick={handleAddCustomName}
            className="h-12 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm shrink-0"
          >
            添加
          </button>
        </div>

        <ul className="space-y-2 mt-4">
          {list.map((entry, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3"
            >
              <span className="text-white flex-1 min-w-0 truncate">{displayName(entry)} {entry.qty > 1 ? `×${entry.qty}` : ''}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openDeposit(i)}
                  className="text-sm font-bold text-amber-400 hover:text-amber-300 hover:underline"
                >
                  存入角色
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="text-dnd-red text-sm font-bold hover:underline"
                >
                  移除
                </button>
              </div>
            </li>
          ))}
        </ul>
        {list.length === 0 && (
          <p className="text-gray-500 text-sm py-4">仓库暂无物品，可从上方下拉选择或输入名称添加。</p>
        )}
      </div>

      {/* 存入角色弹窗 */}
      {depositIndex != null && list[depositIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setDepositIndex(null)}>
          <div
            className="rounded-xl bg-dnd-card border border-white/10 shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10">
              <h2 className="font-display font-semibold text-white">存入角色</h2>
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
                确认存入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
