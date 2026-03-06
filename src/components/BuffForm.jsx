import { useState, useEffect } from 'react'
import { BUFF_TYPES, getCategories, DAMAGE_TYPES, CONDITION_OPTIONS, ABILITY_KEYS } from '../data/buffTypes'

const ABILITY_LABELS = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

export default function BuffForm({ initial, onSave, onCancel }) {
  const [source, setSource] = useState(initial?.source ?? '')
  const [duration, setDuration] = useState(initial?.duration ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'attack')
  const [effectType, setEffectType] = useState(initial?.effectType ?? '')
  const [value, setValue] = useState(initial?.value ?? 0)
  const [customText, setCustomText] = useState(typeof initial?.value === 'string' ? initial.value : '')

  const catData = BUFF_TYPES[category]
  const effects = catData?.effects ?? []

  useEffect(() => {
    if (!effectType || !effects.some((e) => e.key === effectType)) {
      setEffectType(effects[0]?.key ?? '')
    }
  }, [category, effects, effectType])

  const currentEffect = effects.find((e) => e.key === effectType)
  const isBoolean = currentEffect?.dataType === 'boolean'
  const isCustom = currentEffect?.key?.startsWith('custom_')
  const isNumber = currentEffect?.dataType === 'number'
  const needsSubSelect = currentEffect?.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect?.dataType === 'array'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!source.trim()) return
    let val = value
    if (isBoolean) val = true
    else if (isCustom) val = customText
    else if (needsSubSelect === 'damageType' && !isDamageTypeArray) val = value
    else if (isDamageTypeArray) val = Array.isArray(value) ? value : []
    else if (needsSubSelect === 'abilityScores') val = value
    else if (needsSubSelect === 'condition') val = Array.isArray(value) ? value : []
    onSave({
      ...initial,
      source: source.trim(),
      duration: duration.trim() || undefined,
      category,
      effectType,
      value: val,
      enabled: true,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-800 rounded-xl border border-gray-600">
      <div>
        <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">来源名称 *</label>
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="牧师的祝福术、狂暴、法师护甲..."
          className="w-full h-10 rounded-lg bg-gray-900 border border-gray-600 text-white px-3 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
          required
        />
      </div>
      <div>
        <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">持续时间</label>
        <input
          type="text"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="1分钟、直到下次长休、专注..."
          className="w-full h-10 rounded-lg bg-gray-900 border border-gray-600 text-white px-3 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">效果大类</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full h-10 rounded-lg bg-gray-900 border border-gray-600 text-white px-3 focus:border-dnd-red"
          >
            {getCategories().map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">具体效果</label>
          <select
            value={effectType}
            onChange={(e) => setEffectType(e.target.value)}
            className="w-full h-10 rounded-lg bg-gray-900 border border-gray-600 text-white px-3 focus:border-dnd-red"
          >
            {effects.map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
        </div>
      </div>
      {!isBoolean && (
        <div>
          <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">
            {isCustom ? '效果描述' : '数值/选项'}
          </label>
          {isCustom ? (
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="自由填写规则描述..."
              rows={3}
              className="w-full rounded-lg bg-gray-900 border border-gray-600 text-white px-3 py-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red"
            />
          ) : isNumber ? (
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(parseInt(e.target.value, 10) || 0)}
              className="w-full h-10 rounded-lg bg-gray-900 border border-gray-600 text-white px-3 focus:border-dnd-red"
            />
          ) : isDamageTypeArray ? (
            <div className="flex flex-wrap gap-2">
              {DAMAGE_TYPES.map((d) => {
                const arr = Array.isArray(value) ? value : []
                const checked = arr.includes(d.value)
                return (
                  <label key={d.value} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked ? [...arr, d.value] : arr.filter((x) => x !== d.value)
                        setValue(next)
                      }}
                      className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                    />
                    <span className="text-sm text-gray-300">{d.label}</span>
                  </label>
                )
              })}
            </div>
          ) : needsSubSelect === 'damageType' ? (
            <div className="flex gap-2 flex-wrap">
              <select
                value={(typeof value === 'object' && value?.type) || 'bludgeoning'}
                onChange={(e) => setValue((v) => ({ ...(typeof v === 'object' && v && !Array.isArray(v) ? v : {}), type: e.target.value }))}
                className="h-10 rounded-lg bg-gray-900 border border-gray-600 text-white px-3 min-w-[8rem]"
              >
                {DAMAGE_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={(typeof value === 'object' && value?.val) ?? 0}
                onChange={(e) => setValue((v) => ({ ...(typeof v === 'object' && v && !Array.isArray(v) ? v : {}), val: parseInt(e.target.value, 10) || 0 }))}
                className="h-10 w-20 rounded-lg bg-gray-900 border border-gray-600 text-white px-2 text-center"
              />
            </div>
          ) : needsSubSelect === 'abilityScores' ? (
            <div className="grid grid-cols-3 gap-2">
              {ABILITY_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="text-gray-400 text-xs w-8">{ABILITY_LABELS[k]}</span>
                  <input
                    type="number"
                    value={(typeof value === 'object' && value?.[k]) ?? 0}
                    onChange={(e) => setValue((v) => ({ ...(typeof v === 'object' && v && !Array.isArray(v) ? v : {}), [k]: parseInt(e.target.value, 10) || 0 }))}
                    className="h-8 w-14 rounded bg-gray-900 border border-gray-600 text-white text-center text-sm"
                  />
                </div>
              ))}
            </div>
          ) : needsSubSelect === 'condition' ? (
            <div className="flex flex-wrap gap-2">
              {CONDITION_OPTIONS.map((c) => {
                const arr = Array.isArray(value) ? value : []
                const checked = arr.includes(c.value)
                return (
                  <label key={c.value} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked ? [...arr, c.value] : arr.filter((x) => x !== c.value)
                        setValue(next)
                      }}
                      className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                    />
                    <span className="text-sm text-gray-300">{c.label}</span>
                  </label>
                )
              })}
            </div>
          ) : null}
        </div>
      )}
      <div className="flex gap-2 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700">
          取消
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-medium">
          保存
        </button>
      </div>
    </form>
  )
}
