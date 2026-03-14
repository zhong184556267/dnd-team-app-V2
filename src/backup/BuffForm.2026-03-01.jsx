import { useState, useEffect } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { BUFF_TYPES, getCategories, DAMAGE_TYPES, CONDITION_OPTIONS, ABILITY_KEYS, ADVANTAGE_OPTIONS } from '../data/buffTypes'
import { SAVE_NAMES, SKILLS } from '../data/dndSkills'
import { inputClass, textareaClass } from '../lib/inputStyles'

const ABILITY_LABELS = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

/** 从 initial 归一化为 effects 数组（兼容旧单条与新版 effects[]） */
function normalizeInitialEffects(initial) {
  if (Array.isArray(initial?.effects) && initial.effects.length) {
    return initial.effects.map((e) => ({
      id: 'e_' + Math.random().toString(36).slice(2),
      category: e.category ?? 'attack',
      effectType: e.effectType ?? '',
      value: e.value ?? 0,
      customText: typeof e.value === 'string' ? e.value : '',
    }))
  }
  if (initial?.category != null || initial?.effectType != null) {
    return [{
      id: 'e_' + Math.random().toString(36).slice(2),
      category: initial.category ?? 'attack',
      effectType: initial.effectType ?? '',
      value: initial.value ?? 0,
      customText: typeof initial.value === 'string' ? initial.value : '',
    }]
  }
  return [{ id: 'e_' + Math.random().toString(36).slice(2), category: 'attack', effectType: '', value: 0, customText: '' }]
}

/** 根据效果类型把 value 转为保存用的最终值 */
function normalizeValueForSave(module, currentEffect) {
  const { value, customText } = module
  if (!currentEffect) return value
  const isBoolean = currentEffect.dataType === 'boolean'
  const isCustom = currentEffect.key?.startsWith('custom_')
  const needsSubSelect = currentEffect.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect.dataType === 'array'
  if (isBoolean) return true
  if (isCustom) return customText
  if (needsSubSelect === 'damageType' && !isDamageTypeArray) return value
  if (isDamageTypeArray) return Array.isArray(value) ? value : []
  if (needsSubSelect === 'abilityScores') return value
  if (needsSubSelect === 'condition') return Array.isArray(value) ? value : []
  if (needsSubSelect === 'numberAndAdvantage' || needsSubSelect === 'flightSpeed' || needsSubSelect === 'abilityScoresAndAdvantage' || needsSubSelect === 'skillsAndAdvantage') return value
  return value
}

/** 是否需单独一行的复杂数值（多选/网格等） */
function isComplexValueType(currentEffect) {
  if (!currentEffect) return false
  const needsSubSelect = currentEffect.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect.dataType === 'array'
  return isDamageTypeArray || needsSubSelect === 'abilityScores' || needsSubSelect === 'condition' || needsSubSelect === 'abilityScoresAndAdvantage' || needsSubSelect === 'skillsAndAdvantage'
}

/** 单条效果的数值/选项编辑区；inline 时仅渲染紧凑控件（同一行用），无 label */
function EffectValueEditor({ module, onChange, catData, inline }) {
  const effects = catData?.effects ?? []
  const currentEffect = effects.find((e) => e.key === module.effectType)
  const isBoolean = currentEffect?.dataType === 'boolean'
  const isCustom = currentEffect?.key?.startsWith('custom_')
  const isNumber = currentEffect?.dataType === 'number'
  const needsSubSelect = currentEffect?.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect?.dataType === 'array'
  const value = module.value
  const customText = module.customText ?? ''

  const compactClass = inputClass + ' h-8 text-xs'
  if (isBoolean) return inline ? <span className="text-gray-500 text-xs">优势</span> : null
  if (inline) {
    if (isCustom) {
      return (
        <input
          type="text"
          value={customText}
          onChange={(e) => onChange({ ...module, customText: e.target.value })}
          placeholder="描述..."
          className={compactClass + ' min-w-[8rem] flex-1'}
        />
      )
    }
    if (isNumber) {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange({ ...module, value: parseInt(e.target.value, 10) || 0 })}
          className={compactClass + ' w-16'}
        />
      )
    }
    if (needsSubSelect === 'damageType' && !isDamageTypeArray) {
      return (
        <div className="flex items-center gap-1">
          <select
            value={(typeof value === 'object' && value?.type) || 'bludgeoning'}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), type: e.target.value } })}
            className={compactClass + ' min-w-[5rem]'}
          >
            {DAMAGE_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <input
            type="number"
            value={(typeof value === 'object' && value?.val) ?? 0}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), val: parseInt(e.target.value, 10) || 0 } })}
            className={compactClass + ' w-14 text-center'}
          />
        </div>
      )
    }
    const numAdvVal = typeof value === 'object' && value && !Array.isArray(value) ? value : { val: typeof value === 'number' ? value : 0, advantage: '' }
    if (needsSubSelect === 'numberAndAdvantage') {
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={numAdvVal.val ?? 0}
            onChange={(e) => onChange({ ...module, value: { ...numAdvVal, val: parseInt(e.target.value, 10) || 0 } })}
            className={compactClass + ' w-14 text-center'}
          />
          <select
            value={numAdvVal.advantage ?? ''}
            onChange={(e) => onChange({ ...module, value: { ...numAdvVal, advantage: e.target.value } })}
            className={compactClass + ' min-w-[4.5rem]'}
          >
            {ADVANTAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )
    }
    if (needsSubSelect === 'flightSpeed') {
      const fs = typeof value === 'object' && value && !Array.isArray(value) ? value : { speed: typeof value === 'number' ? value : 0, hover: false }
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={fs.speed ?? 0}
            onChange={(e) => onChange({ ...module, value: { ...fs, speed: parseInt(e.target.value, 10) || 0 } })}
            className={compactClass + ' w-14 text-center'}
            title="尺"
          />
          <span className="text-gray-500 text-xs">尺</span>
          <label className="flex items-center gap-1 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={!!fs.hover}
              onChange={(e) => onChange({ ...module, value: { ...fs, hover: e.target.checked } })}
              className="rounded border-gray-600 bg-gray-800 text-dnd-red"
            />
            <span className="text-xs text-gray-400">悬浮</span>
          </label>
        </div>
      )
    }
    if (isComplexValueType(currentEffect)) return null
    return null
  }

  return (
    <div>
      <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">
        {isCustom ? '效果描述' : '数值/选项'}
      </label>
      {isCustom ? (
        <textarea
          value={customText}
          onChange={(e) => onChange({ ...module, customText: e.target.value })}
          placeholder="自由填写规则描述..."
          rows={2}
          className={textareaClass}
        />
      ) : isNumber ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange({ ...module, value: parseInt(e.target.value, 10) || 0 })}
          className={inputClass}
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
                    onChange({ ...module, value: next })
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
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), type: e.target.value } })}
            className={inputClass + ' min-w-[8rem]'}
          >
            {DAMAGE_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <input
            type="number"
            value={(typeof value === 'object' && value?.val) ?? 0}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), val: parseInt(e.target.value, 10) || 0 } })}
            className={inputClass + ' w-20 text-center'}
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
                onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), [k]: parseInt(e.target.value, 10) || 0 } })}
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
                    onChange({ ...module, value: next })
                  }}
                  className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                />
                <span className="text-sm text-gray-300">{c.label}</span>
              </label>
            )
          })}
        </div>
      ) : needsSubSelect === 'numberAndAdvantage' ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={(typeof value === 'object' && value && 'val' in value ? value.val : (typeof value === 'number' ? value : 0)) ?? 0}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), val: parseInt(e.target.value, 10) || 0 } })}
            className={inputClass + ' w-20 text-center'}
          />
          <select
            value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
            className={inputClass + ' min-w-[6rem]'}
          >
            {ADVANTAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ) : needsSubSelect === 'flightSpeed' ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={(typeof value === 'object' && value && 'speed' in value ? value.speed : (typeof value === 'number' ? value : 0)) ?? 0}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), speed: parseInt(e.target.value, 10) || 0 } })}
              className={inputClass + ' w-20 text-center'}
            />
            <span className="text-gray-500 text-sm">尺</span>
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={!!(typeof value === 'object' && value && value.hover)}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), hover: e.target.checked } })}
              className="rounded border-gray-600 bg-gray-800 text-dnd-red"
            />
            <span className="text-sm text-gray-300">是否悬浮</span>
          </label>
        </div>
      ) : needsSubSelect === 'abilityScoresAndAdvantage' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {ABILITY_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-1">
                <span className="text-gray-400 text-xs w-8">{(module.effectType === 'save_bonus' ? SAVE_NAMES[k] : ABILITY_LABELS[k]) ?? k}</span>
                <input
                  type="number"
                  value={(typeof value === 'object' && value && value[k] != null ? value[k] : 0) ?? 0}
                  onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), [k]: parseInt(e.target.value, 10) || 0 } })}
                  className="h-8 w-14 rounded bg-gray-900 border border-gray-600 text-white text-center text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">优势/劣势</span>
            <select
              value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
              className={inputClass + ' min-w-[6rem]'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      ) : needsSubSelect === 'skillsAndAdvantage' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SKILLS.map((sk) => (
              <div key={sk.id} className="flex items-center gap-1">
                <span className="text-gray-400 text-xs truncate w-12" title={sk.name}>{sk.name}</span>
                <input
                  type="number"
                  value={(typeof value === 'object' && value && value[sk.id] != null ? value[sk.id] : 0) ?? 0}
                  onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), [sk.id]: parseInt(e.target.value, 10) || 0 } })}
                  className="h-8 w-14 rounded bg-gray-900 border border-gray-600 text-white text-center text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">优势/劣势</span>
            <select
              value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
              className={inputClass + ' min-w-[6rem]'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function BuffForm({ initial, onSave, onCancel }) {
  const [source, setSource] = useState(initial?.source ?? '')
  const [duration, setDuration] = useState(initial?.duration ?? '')
  const [effectModules, setEffectModules] = useState(() => normalizeInitialEffects(initial))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!source.trim()) return
    const catDataByKey = BUFF_TYPES
    const effects = effectModules.map((mod) => {
      const catData = catDataByKey[mod.category]
      const effList = catData?.effects ?? []
      const effectType = effList.some((e) => e.key === mod.effectType) ? mod.effectType : (effList[0]?.key ?? '')
      const currentEffect = effList.find((x) => x.key === effectType)
      const val = normalizeValueForSave(mod, currentEffect)
      return { category: mod.category, effectType, value: val }
    }).filter((ef) => ef.effectType)
    if (!effects.length) return
    onSave({
      ...initial,
      source: source.trim(),
      duration: duration.trim() || undefined,
      effects,
      enabled: true,
    })
  }

  const addModule = () => {
    setEffectModules((prev) => [...prev, {
      id: 'e_' + Math.random().toString(36).slice(2),
      category: 'attack',
      effectType: '',
      value: 0,
      customText: '',
    }])
  }

  const updateModule = (id, next) => {
    setEffectModules((prev) => prev.map((m) => (m.id === id ? (typeof next === 'function' ? next(m) : next) : m)))
  }

  const removeModule = (id) => {
    setEffectModules((prev) => (prev.length <= 1 ? prev : prev.filter((m) => m.id !== id)))
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
          className={inputClass}
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
          className={inputClass}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider">效果（可多条）</label>
          <button type="button" onClick={addModule} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-500 text-amber-400 hover:bg-amber-500/20 text-xs font-medium">
            <Plus className="w-3.5 h-3.5" />
            添加效果
          </button>
        </div>
        <div className="space-y-2">
          {effectModules.map((mod) => {
            const catData = BUFF_TYPES[mod.category]
            const effects = catData?.effects ?? []
            const effectTypeValid = effects.some((e) => e.key === mod.effectType)
            const effectiveEffectType = effectTypeValid ? mod.effectType : (effects[0]?.key ?? '')
            const currentEffect = effects.find((e) => e.key === effectiveEffectType)
            const complexValue = isComplexValueType(currentEffect)
            return (
              <div key={mod.id} className="rounded-lg border border-gray-600 bg-gray-700/30 p-2 space-y-1.5">
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="shrink-0">
                    <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5 leading-none">效果大类</label>
                    <select
                      value={mod.category}
                      onChange={(e) => {
                        const newCat = e.target.value
                        const newEffects = BUFF_TYPES[newCat]?.effects ?? []
                        updateModule(mod.id, { ...mod, category: newCat, effectType: newEffects[0]?.key ?? '' })
                      }}
                      className={inputClass + ' h-8 text-xs min-w-[7rem]'}
                    >
                      {getCategories().map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="shrink-0">
                    <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5 leading-none">具体效果</label>
                    <select
                      value={effectiveEffectType}
                      onChange={(e) => updateModule(mod.id, { ...mod, effectType: e.target.value })}
                      className={inputClass + ' h-8 text-xs min-w-[7rem]'}
                    >
                      {(BUFF_TYPES[mod.category]?.effects ?? []).map((e) => (
                        <option key={e.key} value={e.key}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="shrink-0 min-w-[5rem] flex-1 flex items-end">
                    <label className="sr-only">数值/选项</label>
                    <EffectValueEditor
                      module={{ ...mod, effectType: effectiveEffectType }}
                      onChange={(next) => updateModule(mod.id, next)}
                      catData={catData}
                      inline
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeModule(mod.id)}
                    className="h-8 w-8 rounded-lg border border-gray-600 text-gray-400 hover:bg-red-900/40 hover:text-red-400 hover:border-red-600 flex items-center justify-center shrink-0"
                    title="删除此效果"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {complexValue && (
                  <div className="pt-1 border-t border-gray-600/80">
                    <EffectValueEditor
                      module={{ ...mod, effectType: effectiveEffectType }}
                      onChange={(next) => updateModule(mod.id, next)}
                      catData={catData}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
