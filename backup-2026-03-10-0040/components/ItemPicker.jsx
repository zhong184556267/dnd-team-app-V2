import { useState, useMemo, useEffect } from 'react'
import { getItemListGrouped, getItemDisplayName, getItemById } from '../data/itemDatabase'

/**
 * 多层级物品选择器：类型 → 子类型 → 物品，便于查找。
 * value: 当前选中的物品 id；onChange: (id) => void
 */
export default function ItemPicker({ value, onChange, className = '', placeholder = '— 从物品表选择 —' }) {
  const grouped = useMemo(() => getItemListGrouped(), [])
  const [type, setType] = useState('')
  const [subType, setSubType] = useState('')

  useEffect(() => {
    if (value && grouped.length) {
      const item = getItemById(value)
      if (item?.类型 && grouped.some((g) => g.type === item.类型)) {
        setType(item.类型)
        setSubType(item.子类型?.trim() || '')
      }
    }
  }, [value, grouped.length])

  const typeGroup = grouped.find((g) => g.type === type)
  const subTypeGroups = typeGroup?.subTypes ?? []
  const currentSub = subTypeGroups.find((s) => (s.subType === '全部' ? '' : s.subType) === subType) ?? subTypeGroups[0]
  const items = currentSub?.items ?? []

  const handleTypeChange = (t) => {
    setType(t)
    setSubType('')
    onChange('')
  }
  const handleSubTypeChange = (st) => {
    setSubType(st)
    onChange('')
  }
  const handleItemChange = (id) => {
    onChange(id)
  }

  return (
    <div className={`flex flex-wrap gap-2 items-center ${className}`}>
      <select
        value={type}
        onChange={(e) => handleTypeChange(e.target.value)}
        className="h-12 min-w-[6rem] rounded-lg bg-gray-800 border border-gray-600 text-white px-3 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-sm"
        style={{ color: '#fff' }}
      >
        <option value="">— 类型 —</option>
        {grouped.map((g) => (
          <option key={g.type} value={g.type}>{g.type}</option>
        ))}
      </select>
      {type && subTypeGroups.length > 1 && (
        <select
          value={subType}
          onChange={(e) => handleSubTypeChange(e.target.value)}
          className="h-12 min-w-[7rem] rounded-lg bg-gray-800 border border-gray-600 text-white px-3 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-sm"
          style={{ color: '#fff' }}
        >
          {subTypeGroups.map((s) => (
            <option key={s.subType} value={s.subType === '全部' ? '' : s.subType}>
              {s.subType}
            </option>
          ))}
        </select>
      )}
      <select
        value={value}
        onChange={(e) => handleItemChange(e.target.value)}
        className="h-12 flex-1 min-w-[10rem] rounded-lg bg-gray-800 border border-gray-600 text-white px-3 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-sm"
        style={{ color: '#fff' }}
      >
        <option value="">{placeholder}</option>
        {items.map((x) => (
          <option key={x.id} value={x.id}>
            {x._display || getItemDisplayName(x) || x.类别}
          </option>
        ))}
      </select>
    </div>
  )
}
