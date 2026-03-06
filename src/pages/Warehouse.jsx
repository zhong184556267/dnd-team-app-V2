import { useState, useEffect } from 'react'
import { getItemList, getItemById, getItemDisplayName, addCustomItem } from '../data/itemDatabase'
import { getWarehouse, addToWarehouse, removeFromWarehouse } from '../lib/warehouseStore'

export default function Warehouse() {
  const [list, setList] = useState([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [customName, setCustomName] = useState('')
  const [showAddCustom, setShowAddCustom] = useState(false)
  const itemList = getItemList()

  useEffect(() => {
    setList(getWarehouse())
  }, [])

  const refreshList = () => setList(getWarehouse())

  const handleAddFromList = () => {
    if (!selectedItemId) return
    addToWarehouse({ itemId: selectedItemId, qty: 1 })
    setSelectedItemId('')
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

      <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="h-12 flex-1 min-w-[12rem] rounded-lg bg-gray-800 border border-gray-600 text-white px-3 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
            style={{ color: '#fff' }}
          >
            <option value="">— 从物品表选择 —</option>
            {itemList.map((x) => (
              <option key={x.id} value={x.id}>{x._display || x.类别}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddFromList}
            disabled={!selectedItemId}
            className="h-12 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white font-bold text-sm shrink-0"
          >
            放入仓库
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustomName()}
            placeholder="或直接输入物品名"
            className="h-12 flex-1 rounded-lg bg-gray-800 border border-gray-600 text-white px-3 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500"
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
              className="flex items-center justify-between rounded-lg border border-gray-600 bg-gray-800 px-4 py-3"
            >
              <span className="text-white">{displayName(entry)} {entry.qty > 1 ? `×${entry.qty}` : ''}</span>
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="text-dnd-red text-sm font-bold hover:underline"
              >
                移除
              </button>
            </li>
          ))}
        </ul>
        {list.length === 0 && (
          <p className="text-gray-500 text-sm py-4">仓库暂无物品，可从上方下拉选择或输入名称添加。</p>
        )}

        <div className="border-t border-gray-600 pt-4 mt-4">
          <button
            type="button"
            onClick={() => setShowAddCustom(!showAddCustom)}
            className="text-dnd-gold-light text-sm font-bold"
          >
            {showAddCustom ? '收起' : '+ 新增自定义物品到资料表'}
          </button>
          {showAddCustom && (
            <AddCustomItemForm
              onSuccess={() => {
                setShowAddCustom(false)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function AddCustomItemForm({ onSuccess }) {
  const [类别, set类别] = useState('')
  const [名称, set名称] = useState('')
  const [攻击, set攻击] = useState('')
  const [附注, set附注] = useState('')
  const [伤害, set伤害] = useState('')
  const [重量, set重量] = useState('')
  const [价格, set价格] = useState('')
  const [详细介绍, set详细介绍] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!类别.trim()) return
    addCustomItem({
      类别: 类别.trim(),
      名称: 名称.trim(),
      攻击: 攻击.trim(),
      附注: 附注.trim(),
      伤害: 伤害.trim(),
      重量: 重量.trim(),
      价格: 价格.trim(),
      详细介绍: 详细介绍.trim(),
    })
    set类别('')
    set名称('')
    set攻击('')
    set附注('')
    set伤害('')
    set重量('')
    set价格('')
    set详细介绍('')
    onSuccess?.()
  }

  const inputCls = 'h-10 w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 text-sm focus:border-dnd-red focus:ring-1 focus:ring-dnd-red'
  const labelCls = 'block text-gray-400 text-xs font-bold mb-1'

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>类别 *</label>
        <input value={类别} onChange={(e) => set类别(e.target.value)} className={inputCls} placeholder="e.g. 长剑 (Longsword)" required />
      </div>
      <div>
        <label className={labelCls}>名称（选填，无则显示类别）</label>
        <input value={名称} onChange={(e) => set名称(e.target.value)} className={inputCls} placeholder="自定义显示名" />
      </div>
      <div>
        <label className={labelCls}>攻击</label>
        <input value={攻击} onChange={(e) => set攻击(e.target.value)} className={inputCls} placeholder="e.g. 1d8 挥砍" />
      </div>
      <div>
        <label className={labelCls}>附注</label>
        <input value={附注} onChange={(e) => set附注(e.target.value)} className={inputCls} placeholder="e.g. 多用 (1d10)" />
      </div>
      <div>
        <label className={labelCls}>伤害</label>
        <input value={伤害} onChange={(e) => set伤害(e.target.value)} className={inputCls} placeholder="e.g. 挥砍" />
      </div>
      <div>
        <label className={labelCls}>重量</label>
        <input value={重量} onChange={(e) => set重量(e.target.value)} className={inputCls} placeholder="e.g. 3磅" />
      </div>
      <div>
        <label className={labelCls}>价格</label>
        <input value={价格} onChange={(e) => set价格(e.target.value)} className={inputCls} placeholder="e.g. 15GP" />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>详细介绍</label>
        <textarea value={详细介绍} onChange={(e) => set详细介绍(e.target.value)} className={inputCls + ' min-h-[4rem]'} placeholder="物品描述、来历等" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" className="h-10 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-bold text-sm">
          添加到资料表
        </button>
      </div>
    </form>
  )
}
