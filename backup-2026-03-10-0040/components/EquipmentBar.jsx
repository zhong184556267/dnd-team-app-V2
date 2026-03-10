/**
 * 身穿装备栏：分两列
 * 左：手持（主手、副手等，可增可减，选背包任意物品）
 * 右：身穿（身体等，可增可减，仅选盔甲/衣服，显示 AC + 敏捷调整）
 */
import { Plus, Trash2 } from 'lucide-react'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { parseArmorNote } from '../lib/formulas'

const HELD_LABELS = ['主手', '副手']
const WORN_LABELS = ['身体']

function getEntryDisplayName(entry) {
  if (!entry) return '—'
  const customName = entry.name?.trim()
  if (customName) return customName
  const proto = entry?.itemId ? getItemById(entry.itemId) : null
  return getItemDisplayName(proto) || '—'
}

function getSlotLabel(index, labels, fallbackPrefix) {
  return index < labels.length ? labels[index] : `${fallbackPrefix}${index + 1}`
}

/** 迁移旧 equippedSlots 到 equippedHeld */
function migrateSlots(character) {
  const old = character?.equippedSlots
  if (!Array.isArray(old) || old.length === 0) return null
  const held = old.map((s, i) => ({
    id: s.id || 'held_' + i,
    inventoryId: s.inventoryId ?? null,
  }))
  return { held, worn: [{ id: 'body_0', inventoryId: null }] }
}

export default function EquipmentBar({ character, canEdit, onSave }) {
  const inv = character?.inventory ?? []

  const migrated = migrateSlots(character)
  const heldSlots = character?.equippedHeld ?? migrated?.held ?? [
    { id: 'main', inventoryId: null },
    { id: 'off', inventoryId: null },
  ]
  const wornSlots = character?.equippedWorn ?? migrated?.worn ?? [
    { id: 'body', inventoryId: null },
  ]

  /** 身穿：盔甲（非盾牌）+ 衣服 */
  const wornOptions = inv.filter((e) => {
    const proto = e.itemId ? getItemById(e.itemId) : null
    const t = proto?.类型 ?? ''
    const sub = proto?.子类型 ?? ''
    if (t === '衣服') return true
    if (t === '盔甲' && sub !== '盾牌') return true
    return false
  })

  /** 主手：武器 + 枪械 + 法器 */
  const mainHandOptions = inv.filter((e) => {
    const proto = e.itemId ? getItemById(e.itemId) : null
    const t = proto?.类型 ?? ''
    return t === '武器' || t === '枪械' || t === '法器'
  })

  /** 副手：盾牌 + 武器 + 枪械 */
  const offHandOptions = inv.filter((e) => {
    const proto = e.itemId ? getItemById(e.itemId) : null
    const t = proto?.类型 ?? ''
    const sub = proto?.子类型 ?? ''
    if (t === '盔甲' && sub === '盾牌') return true
    if (t === '武器' || t === '枪械') return true
    return false
  })

  const getHeldOptions = (slotIndex) => (slotIndex === 0 ? mainHandOptions : slotIndex === 1 ? offHandOptions : mainHandOptions)

  const setHeld = (next) => onSave({ equippedHeld: next, equippedWorn: wornSlots })
  const setWorn = (next) => onSave({ equippedHeld: heldSlots, equippedWorn: next })

  const HELD_FIXED_COUNT = 2
  const WORN_FIXED_COUNT = 1

  const addHeldSlot = () => {
    setHeld([...heldSlots, { id: 'held_' + Date.now(), inventoryId: null }])
  }
  const removeHeldSlot = (i) => {
    if (i < HELD_FIXED_COUNT || heldSlots.length <= HELD_FIXED_COUNT) return
    setHeld(heldSlots.filter((_, j) => j !== i))
  }
  const canRemoveHeld = (i) => i >= HELD_FIXED_COUNT && heldSlots.length > HELD_FIXED_COUNT
  const setHeldEquip = (i, inventoryId) => {
    const next = [...heldSlots]
    next[i] = { ...next[i], inventoryId: inventoryId || null }
    setHeld(next)
  }

  const addWornSlot = () => {
    setWorn([...wornSlots, { id: 'worn_' + Date.now(), inventoryId: null }])
  }
  const removeWornSlot = (i) => {
    if (i < WORN_FIXED_COUNT || wornSlots.length <= WORN_FIXED_COUNT) return
    setWorn(wornSlots.filter((_, j) => j !== i))
  }
  const canRemoveWorn = (i) => i >= WORN_FIXED_COUNT && wornSlots.length > WORN_FIXED_COUNT
  const setWornEquip = (i, inventoryId) => {
    const next = [...wornSlots]
    next[i] = { ...next[i], inventoryId: inventoryId || null }
    setWorn(next)
  }

  const setWornMagicBonus = (wornSlotIndex, value) => {
    const slot = wornSlots[wornSlotIndex]
    if (!slot?.inventoryId) return
    const entryIdx = inv.findIndex((e) => e.id === slot.inventoryId)
    if (entryIdx < 0) return
    const n = Math.max(0, parseInt(value, 10) || 0)
    const nextInv = inv.map((e, i) => (i === entryIdx ? { ...e, magicBonus: n } : e))
    onSave({ inventory: nextInv })
  }

  const renderSlot = (slot, index, options, setEquip, removeSlot, isWorn, canRemove) => {
    const entry = slot.inventoryId ? inv.find((e) => e.id === slot.inventoryId) ?? null : null
    const proto = entry?.itemId ? getItemById(entry.itemId) : null
    const note = entry?.附注 ?? proto?.附注 ?? ''
    const parsed = parseArmorNote(note)
    const magicBonus = Number(entry?.magicBonus) || 0
    const isArmorOrShield = proto?.类型 === '盔甲'

    return (
      <div
        key={slot.id}
        className="flex flex-col gap-1 rounded-lg border border-gray-600 bg-gray-800/80 px-3 py-2 min-w-[10rem]"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-400 text-xs shrink-0 w-12">
            {isWorn ? getSlotLabel(index, WORN_LABELS, '身穿') : getSlotLabel(index, HELD_LABELS, '手持')}
          </span>
          {canEdit ? (
            <>
              <select
                value={slot.inventoryId || ''}
                onChange={(e) => setEquip(index, e.target.value)}
                className="flex-1 min-w-0 h-8 rounded bg-gray-700 border border-gray-600 text-white text-sm px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
              >
                <option value="">— 选择 —</option>
                {options.map((e) => (
                  <option key={e.id} value={e.id}>
                    {getEntryDisplayName(e)}
                  </option>
                ))}
              </select>
              {isWorn && isArmorOrShield && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-gray-500 text-[10px]">增强加值</span>
                  <input
                    type="number"
                    min={0}
                    value={magicBonus || ''}
                    onChange={(e) => setWornMagicBonus(index, e.target.value)}
                    placeholder="0"
                    className="w-12 h-7 rounded bg-gray-700 border border-gray-600 text-white text-xs text-center tabular-nums focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
                  />
                </div>
              )}
              {canRemove && (
                <button
                  type="button"
                  onClick={() => removeSlot(index)}
                  title="移除槽位"
                  className="p-1 rounded text-gray-500 hover:text-dnd-red hover:bg-red-900/20 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-white text-sm flex-1">{getEntryDisplayName(entry)}</span>
              {isWorn && entry && isArmorOrShield && (
                <span className="text-amber-200/90 text-xs font-mono shrink-0">{magicBonus > 0 ? `+${magicBonus}` : ''}</span>
              )}
            </>
          )}
        </div>
        {isWorn && entry && parsed && (
          <p className="text-amber-200/90 text-[10px]">
            {parsed.isShield ? `AC +${parsed.bonus}` : `AC ${parsed.baseAC ?? 10}${parsed.addDex ? (parsed.dexCap != null ? `+敏调(最大${parsed.dexCap})` : '+敏调') : ''}`}
            {magicBonus > 0 && <span className="ml-1">+{magicBonus}</span>}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 左：手持 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-dnd-gold-light text-sm font-bold">手持</h4>
            {canEdit && (
              <button
                type="button"
                onClick={addHeldSlot}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 border border-gray-600 hover:border-amber-500/50 rounded px-2 py-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                添加备选
              </button>
            )}
          </div>
          <p className="text-gray-500 text-[10px]">主手、副手不可删；可添加备选槽位。从背包选择物品</p>
          <div className="flex flex-col gap-2">
            {heldSlots.length === 0 ? (
              <p className="text-gray-500 text-xs py-1">暂无手持槽位</p>
            ) : (
              heldSlots.map((slot, i) => renderSlot(slot, i, getHeldOptions(i), setHeldEquip, removeHeldSlot, false, canRemoveHeld(i)))
            )}
          </div>
        </div>

        {/* 右：身穿 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-dnd-gold-light text-sm font-bold">身穿</h4>
            {canEdit && (
              <button
                type="button"
                onClick={addWornSlot}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 border border-gray-600 hover:border-amber-500/50 rounded px-2 py-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                添加
              </button>
            )}
          </div>
          <p className="text-gray-500 text-[10px]">身体不可删；可增删槽位。仅盔甲、衣服；显示 AC 与敏捷调整</p>
          <div className="flex flex-col gap-2">
            {wornSlots.length === 0 ? (
              <p className="text-gray-500 text-xs py-1">暂无身穿槽位</p>
            ) : (
              wornSlots.map((slot, i) => renderSlot(slot, i, wornOptions, setWornEquip, removeWornSlot, true, canRemoveWorn(i)))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
