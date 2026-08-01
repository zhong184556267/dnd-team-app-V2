import { useEffect, useMemo, useState } from 'react'
import { Search, X, Star, Check } from 'lucide-react'
import { FEATS, FEATS_BY_CATEGORY, formatFeatDescriptionForDisplay } from '../data/feats'
import {
  getFeatBuffSchema,
  buildDefaultChoiceState,
  validateChoiceState,
  buildFeatBuffEffects,
  abilityOptions,
} from '../data/featBuffChoices'
import { ABILITY_NAMES_ZH, DAMAGE_TYPES } from '../data/buffTypes'
import { resolveRuleText, buildFeatNameKey, buildFeatDescriptionKey } from '../lib/ruleTextOverrides'
import { inputClass } from '../lib/inputStyles'

const CATEGORY_ORDER = Object.keys(FEATS_BY_CATEGORY)

function AbilitySelect({ value, options, onChange, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass + ' h-9 text-sm'}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function ChoicePanel({ schema, state, onChange }) {
  if (!schema) return null

  switch (schema.kind) {
    case 'abilitySingle': {
      const options = abilityOptions(schema.abilities)
      return (
        <div className="space-y-2">
          <label className="block text-dnd-text-muted text-xs">{schema.label}：选择属性（+{schema.value ?? 1}）</label>
          <AbilitySelect
            value={state.ability}
            options={options}
            onChange={(ability) => onChange({ ...state, ability })}
          />
        </div>
      )
    }

    case 'abilityAsi': {
      const allOptions = abilityOptions(Object.keys(ABILITY_NAMES_ZH))
      return (
        <div className="space-y-3">
          <label className="block text-dnd-text-muted text-xs">{schema.label}</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm text-white cursor-pointer">
              <input
                type="radio"
                name="asi-mode"
                checked={state.mode === 'single'}
                onChange={() => onChange({ ...state, mode: 'single' })}
                className="text-dnd-red focus:ring-dnd-red"
              />
              一项属性 +2
            </label>
            <label className="flex items-center gap-1.5 text-sm text-white cursor-pointer">
              <input
                type="radio"
                name="asi-mode"
                checked={state.mode === 'double'}
                onChange={() => onChange({ ...state, mode: 'double' })}
                className="text-dnd-red focus:ring-dnd-red"
              />
              两项属性各 +1
            </label>
          </div>

          {state.mode === 'single' ? (
            <AbilitySelect
              value={state.single}
              options={allOptions}
              onChange={(single) => onChange({ ...state, single })}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <AbilitySelect
                value={state.double?.[0] ?? ''}
                options={allOptions}
                onChange={(v) => onChange({ ...state, double: [v, state.double?.[1] ?? ''] })}
              />
              <AbilitySelect
                value={state.double?.[1] ?? ''}
                options={allOptions}
                onChange={(v) => onChange({ ...state, double: [state.double?.[0] ?? '', v] })}
              />
            </div>
          )}
        </div>
      )
    }

    case 'damageTypeSingle': {
      const options = schema.options
        .map((value) => {
          const cfg = DAMAGE_TYPES.find((d) => d.value === value)
          return { value, label: cfg?.label ?? value }
        })
      return (
        <div className="space-y-2">
          <label className="block text-dnd-text-muted text-xs">{schema.label}</label>
          <select
            value={state.type}
            onChange={(e) => onChange({ ...state, type: e.target.value })}
            className={inputClass + ' h-9 text-sm'}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )
    }

    case 'choice': {
      return (
        <div className="space-y-2">
          <label className="block text-dnd-text-muted text-xs">{schema.label}</label>
          <div className="space-y-1.5">
            {schema.options.map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  state.optionId === opt.id
                    ? 'border-dnd-gold/60 bg-dnd-gold/10'
                    : 'border-gray-600 bg-gray-800/40 hover:bg-gray-800/70'
                }`}
              >
                <input
                  type="radio"
                  name="feat-choice"
                  checked={state.optionId === opt.id}
                  onChange={() => onChange({ ...state, optionId: opt.id })}
                  className="text-dnd-red focus:ring-dnd-red shrink-0"
                />
                <span className="text-sm text-white">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }

    default:
      return null
  }
}

export default function FeatPickerModal({ isOpen, onClose, onConfirm, overridesMap, selectedIds }) {
  const [category, setCategory] = useState(CATEGORY_ORDER[0])
  const [query, setQuery] = useState('')
  const [selectedFeatId, setSelectedFeatId] = useState(null)
  const [choiceState, setChoiceState] = useState({})

  useEffect(() => {
    if (!isOpen) return
    setCategory(CATEGORY_ORDER[0])
    setQuery('')
    setSelectedFeatId(null)
    setChoiceState({})
  }, [isOpen])

  const featById = useMemo(() => new Map(FEATS.map((x) => [x.id, x])), [])

  const availableFeats = useMemo(() => {
    const set = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || [])
    return FEATS.filter((f) => !set.has(f.id))
  }, [selectedIds])

  const filteredFeats = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FEATS_BY_CATEGORY[category] ?? []
    return availableFeats.filter((f) => {
      const name = resolveRuleText(overridesMap, buildFeatNameKey(f.id), f.name).toLowerCase()
      return name.includes(q) || f.id.toLowerCase().includes(q)
    })
  }, [query, category, availableFeats, overridesMap])

  useEffect(() => {
    const schema = selectedFeatId ? getFeatBuffSchema(selectedFeatId) : null
    setChoiceState(buildDefaultChoiceState(schema))
  }, [selectedFeatId])

  const selectedFeat = selectedFeatId ? featById.get(selectedFeatId) : null
  const schema = selectedFeatId ? getFeatBuffSchema(selectedFeatId) : null
  const canConfirm = selectedFeatId && validateChoiceState(schema, choiceState)

  const handleConfirm = () => {
    if (!selectedFeatId) return
    const effects = buildFeatBuffEffects(selectedFeatId, choiceState)
    onConfirm({ featId: selectedFeatId, effects })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-black/65">
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border border-white/15 bg-[#1b2738] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-dnd-gold-light/95">选择专长</h2>
            <p className="text-[11px] text-dnd-text-muted">左侧切换分类，右侧预览描述并配置相关 BUFF。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Categories */}
          <div className="w-36 sm:w-44 border-r border-white/10 bg-[#141f2e]/60 overflow-y-auto p-2 space-y-1">
            {CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat)
                  setQuery('')
                  setSelectedFeatId(null)
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                  category === cat && !query.trim()
                    ? 'bg-dnd-red/20 text-dnd-red font-medium'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                {cat === '星辰专长' ? '★ 星辰专长' : cat}
              </button>
            ))}
          </div>

          {/* Feat list */}
          <div className="flex-1 min-w-0 flex flex-col border-r border-white/10">
            <div className="p-3 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索专长名称…"
                  className={inputClass + ' h-9 pl-9 text-sm w-full'}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredFeats.length === 0 ? (
                <p className="text-dnd-text-muted text-xs text-center py-6">未找到可添加的专长。</p>
              ) : (
                filteredFeats.map((feat) => {
                  const name = resolveRuleText(overridesMap, buildFeatNameKey(feat.id), feat.name)
                  const active = selectedFeatId === feat.id
                  return (
                    <button
                      key={feat.id}
                      type="button"
                      onClick={() => setSelectedFeatId(feat.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                        active
                          ? 'bg-dnd-gold/15 border border-dnd-gold/40'
                          : 'bg-gray-800/30 border border-transparent hover:bg-gray-800/60'
                      }`}
                    >
                      <span className="text-sm text-white truncate">{name}</span>
                      {feat.category === '星辰专长' && (
                        <Star className="w-3.5 h-3.5 text-dnd-gold-light shrink-0 fill-current" />
                      )}
                      {query.trim() && feat.category && (
                        <span className="text-[10px] text-gray-500 shrink-0">{feat.category}</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="w-72 sm:w-80 flex flex-col bg-[#141f2e]/40 overflow-y-auto">
            {selectedFeat ? (
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {resolveRuleText(overridesMap, buildFeatNameKey(selectedFeat.id), selectedFeat.name)}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {selectedFeat.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-600 text-gray-400">
                        {selectedFeat.category === '星辰专长' ? '★ 星辰专长' : selectedFeat.category}
                      </span>
                    )}
                    {selectedFeat.prerequisite && (
                      <span className="text-[10px] text-dnd-text-muted">先决：{selectedFeat.prerequisite}</span>
                    )}
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3">
                  <h4 className="text-[11px] font-bold text-dnd-gold-light/90 mb-1.5">专长描述</h4>
                  <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                    {formatFeatDescriptionForDisplay(
                      resolveRuleText(
                        overridesMap,
                        buildFeatDescriptionKey(selectedFeat.id),
                        selectedFeat.description,
                      ),
                    )}
                  </p>
                </div>

                {schema ? (
                  <div className="border-t border-white/10 pt-3">
                    <h4 className="text-[11px] font-bold text-dnd-gold-light/90 mb-2">配置效果（自动加入 BUFF 栏）</h4>
                    {schema.description && (
                      <p className="text-[11px] text-dnd-text-muted mb-3">{schema.description}</p>
                    )}
                    <ChoicePanel schema={schema} state={choiceState} onChange={setChoiceState} />
                  </div>
                ) : (
                  <div className="border-t border-white/10 pt-3">
                    <p className="text-[11px] text-dnd-text-muted">本专长未预设自动 BUFF，确认后可在 Buff 栏手动补充。</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <p className="text-dnd-text-muted text-sm">在左侧选择一项专长以查看描述和配置。</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10 shrink-0 bg-[#141f2e]/60">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs border border-white/20 text-dnd-text-muted hover:bg-white/5"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dnd-red/90 text-white hover:bg-dnd-red disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            确认添加
          </button>
        </div>
      </div>
    </div>
  )
}
