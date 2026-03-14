import { useState, useEffect, useRef } from 'react'
import { Trash2, Plus, ChevronDown } from 'lucide-react'
import { BUFF_TYPES, getCategories, normalizeEffectCategory, DAMAGE_TYPES, CONDITION_OPTIONS, ABILITY_KEYS, ADVANTAGE_OPTIONS, PIERCING_DAMAGE_OPTIONS, DAMAGE_DICE_ARROW_OPTIONS, DAMAGE_DICE_OPTIONS, parseDamageString } from '../data/buffTypes'
import { SAVE_NAMES, SKILLS } from '../data/dndSkills'
import { inputClass, textareaClass } from '../lib/inputStyles'

const ABILITY_LABELS = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

/** 专注增强旧文案转对象（兼容历史数据） */
function normalizeConcentrationSaveEnhanceValue(value) {
  if (value != null && typeof value === 'object' && !Array.isArray(value) && 'val' in value) return value
  if (typeof value !== 'string') return typeof value === 'object' && value && !Array.isArray(value) ? value : { val: 0, advantage: '' }
  const val = (() => { const m = value.match(/[+＋](\d+)/); return m ? (parseInt(m[1], 10) || 0) : 0 })()
  const advantage = /优势/i.test(value) ? 'advantage' : /劣势/i.test(value) ? 'disadvantage' : ''
  return { val, advantage }
}

/** 从 initial 归一化为 effects 数组（兼容旧单条与新版 effects[]，旧 4 大类规范化为 6 大类） */
function normalizeInitialEffects(initial) {
  if (Array.isArray(initial?.effects) && initial.effects.length) {
    return initial.effects.map((e) => {
      let value = e.value ?? 0
      if (e.effectType === 'concentration_save_enhance') value = normalizeConcentrationSaveEnhanceValue(value)
      return {
        id: 'e_' + Math.random().toString(36).slice(2),
        category: normalizeEffectCategory(e.effectType ?? '', e.category),
        effectType: e.effectType ?? '',
        value,
        customText: typeof e.value === 'string' && e.effectType !== 'concentration_save_enhance' ? e.value : '',
      }
    })
  }
  if (initial?.category != null || initial?.effectType != null) {
    let value = initial.value ?? 0
    if (initial.effectType === 'concentration_save_enhance') value = normalizeConcentrationSaveEnhanceValue(value)
    return [{
      id: 'e_' + Math.random().toString(36).slice(2),
      category: normalizeEffectCategory(initial.effectType ?? '', initial.category),
      effectType: initial.effectType ?? '',
      value,
      customText: typeof initial.value === 'string' && initial.effectType !== 'concentration_save_enhance' ? initial.value : '',
    }]
  }
  return [{ id: 'e_' + Math.random().toString(36).slice(2), category: '', effectType: '', value: 0, customText: '' }]
}

/** 根据效果类型把 value 转为保存用的最终值 */
function normalizeValueForSave(module, currentEffect) {
  const { value, customText } = module
  if (!currentEffect) return value
  const isBoolean = currentEffect.dataType === 'boolean'
  const isText = currentEffect.dataType === 'text'
  const isCustom = currentEffect.key?.startsWith('custom_')
  const needsSubSelect = currentEffect.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect.dataType === 'array'
  if (isBoolean) return value === true || value === 'true' || value === 1
  if (isText && !needsSubSelect) return typeof value === 'string' ? value : (customText ?? '')
  if (isCustom) return customText
  if (needsSubSelect === 'damageType' && !isDamageTypeArray) return value
  if (isDamageTypeArray) return Array.isArray(value) ? value : []
  if (needsSubSelect === 'abilityScores') return value
  if (needsSubSelect === 'condition') return Array.isArray(value) ? value : []
  if (needsSubSelect === 'damagePiercingTraits') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const selected = value.selected ?? []
      const pierce = Array.isArray(value.pierce) ? value.pierce : [...(Array.isArray(value.element) ? value.element : []), ...(Array.isArray(value.alignment) ? value.alignment : [])]
      const hasPierce = selected.includes('pierce') || selected.includes('element') || selected.includes('alignment')
      const base = selected.filter((x) => x !== 'pierce' && x !== 'element' && x !== 'alignment')
      const normSelected = hasPierce ? [...base, 'pierce'] : base
      return { selected: normSelected, pierce }
    }
    const selected = Array.isArray(value) ? value : []
    return { selected, pierce: [] }
  }
  if (needsSubSelect === 'numberAndAdvantage' || needsSubSelect === 'flightSpeed' || needsSubSelect === 'abilityScoresAndAdvantage' || needsSubSelect === 'skillsAndAdvantage' || needsSubSelect === 'attackAreaSize') return value
  if (currentEffect.key === 'extra_damage_dice') {
    if (typeof value === 'string') return value.trim()
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const { minus = '', plus = '', type = '' } = value
      return [' - ', minus, ' + ', plus, ' ', type].join('').replace(/\s+/g, ' ').trim()
    }
    return ''
  }
  return value
}

/** 是否需单独一行的复杂数值（多选/网格等） */
function isComplexValueType(currentEffect) {
  if (!currentEffect) return false
  const needsSubSelect = currentEffect.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect.dataType === 'array'
  return (
    isDamageTypeArray ||
    needsSubSelect === 'condition' ||
    needsSubSelect === 'damagePiercingTraits'
  )
}

/** 从 plus 字符串如 "1d6"、"2d6" 解析出骰数 count 与面数 sides；minusStepper 时步进器显示 count */
function parseDiceFromPlus(plus) {
  if (!plus || typeof plus !== 'string') return { count: 1, sides: 6 }
  const m = plus.trim().match(/^(\d*)d(\d+)$/i)
  if (!m) return { count: 1, sides: 6 }
  const count = Math.max(1, parseInt(m[1], 10) || 1)
  const sides = parseInt(m[2], 10) || 6
  const allowedSides = [4, 6, 8, 10, 12]
  const sidesNorm = allowedSides.includes(sides) ? sides : 6
  return { count, sides: sidesNorm }
}

/** 伤害模块一行：可选 leftLabel（如「伤害」）；[骰子▼] [伤害类型▼]；可选 trailing 为精通模块（已去掉 modifier/步进器 − 0 +） */
function DamageDiceInlineRow({ value, onChange, module, compact, minusStepper, trailing, leftLabel }) {
  const isLegacy = typeof value === 'string'
  const parsed = isLegacy && value ? parseDamageString(value) : {}
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const plus = raw.plus ?? parsed.plus ?? ''
  const type = raw.type ?? parsed.type ?? ''
  const update = (part, v) => {
    const base = isLegacy ? parseDamageString(value || '') : { ...raw }
    const next = { ...base, [part]: v, minus: '' }
    onChange({ ...module, value: next })
  }
  const rowH = compact ? 'h-7' : 'h-8'
  const selCls = compact ? (inputClass + ' h-7 text-xs px-1 pr-4') : (inputClass + ' h-8 text-sm px-1 pr-4')
  const labelCls = 'text-dnd-text-muted shrink-0 ' + (compact ? 'text-[11px]' : 'text-xs')
  const diceDropdownValue = DAMAGE_DICE_OPTIONS.some((o) => o.value === plus) ? plus : (plus || '')
  const damageBlock = (
    <>
      {/* 骰子下拉（1d4～2d8） */}
      <div className={`flex items-center min-w-0 flex-1 basis-0 ${rowH}`}>
        <select
          value={diceDropdownValue}
          onChange={(e) => update('plus', e.target.value)}
          className={selCls + ' w-full min-w-0 h-full'}
          title="骰子"
        >
          <option value="">骰</option>
          {DAMAGE_DICE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {/* 伤害类型下拉 */}
      <div className={`flex items-center min-w-0 flex-1 basis-0 ${rowH}`}>
        <select value={type} onChange={(e) => update('type', e.target.value)} className={selCls + ' w-full min-w-0 h-full'} title="伤害类型">
          <option value="">类型</option>
          {DAMAGE_TYPES.map((d) => (
            <option key={d.value} value={d.label}>{d.label}</option>
          ))}
        </select>
      </div>
    </>
  )
  if (trailing != null) {
    return (
      <div className={`flex items-stretch gap-6 flex-nowrap w-full min-w-0 ${rowH}`}>
        {/* 伤害模块：左对齐 */}
        <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-start ${rowH}`}>
          {leftLabel != null && leftLabel !== '' && <span className={labelCls}>{leftLabel}</span>}
          {damageBlock}
        </div>
        {/* 精通模块：右对齐 */}
        <div className={`flex items-center gap-1.5 shrink-0 justify-end ${rowH}`}>
          {trailing}
        </div>
      </div>
    )
  }
  return (
    <div className={`flex items-stretch gap-1.5 flex-nowrap text-left w-full min-w-0 ${rowH}`}>
      {leftLabel != null && leftLabel !== '' && <span className={labelCls}>{leftLabel}</span>}
      {damageBlock}
    </div>
  )
}

/** 数字输入：统一使用「中间数字 + 上下箭头」设计；用户对话中「数字输入」即指此组件 */
function NumberStepper({ value, onChange, min = -999, max = 999, step = 1, compact }) {
  // 高度统一为 h-7，与前方下拉/输入条一致，仅文本大小随 compact 变化
  const rowH = 'h-7'
  const textSize = compact ? 'text-xs' : 'text-sm'
  const num = typeof value === 'number' ? value : (parseInt(value, 10) || 0)
  const clamp = (v) => Math.min(max, Math.max(min, v))
  const handleInputChange = (e) => {
    const s = e.target.value
    if (s === '' || s === '-') onChange(clamp(0))
    else { const v = parseInt(s, 10); if (!Number.isNaN(v)) onChange(clamp(v)) }
  }
  return (
    <div className={`relative flex items-center border border-gray-500/60 rounded-md bg-gray-800/90 shadow-sm px-7 ${rowH}`}>
      <button
        type="button"
        onClick={() => onChange(clamp(num - step))}
        className={`absolute left-1.5 flex items-center justify-center text-gray-300 hover:text-white ${textSize}`}
        aria-label="减少"
      >
        <ChevronDown className={`w-3 h-3 ${compact ? '' : 'w-3.5 h-3.5'}`} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={num}
        onChange={handleInputChange}
        className={`flex-1 min-w-[3.5rem] w-20 text-center text-white bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:bg-gray-700/60 ${rowH} ${textSize}`}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(num + step))}
        className={`absolute right-1.5 flex items-center justify-center text-gray-300 hover:text-white ${textSize}`}
        aria-label="增加"
      >
        <ChevronDown className={`w-3 h-3 rotate-180 ${compact ? '' : 'w-3.5 h-3.5'}`} />
      </button>
    </div>
  )
}

/** 多选下拉：点击显示已选，展开后为复选框列表，选择感强 */
function MultiSelectDropdown({ options, selected, onChange, placeholder, id }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const labels = selected.map((v) => options.find((o) => o.value === v)?.label ?? v).filter(Boolean)
  const display = labels.length > 0 ? labels.join('、') : placeholder
  return (
    <div ref={ref} className="relative min-w-0 max-w-[12rem]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={inputClass + ' h-8 w-full flex items-center justify-between gap-1 text-left pr-7'}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate text-sm">{display}</span>
        <ChevronDown className={'w-4 h-4 shrink-0 absolute right-2 top-1/2 -translate-y-1/2 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 py-1.5 px-2 rounded-md border border-gray-600 bg-gray-800 shadow-lg" role="listbox">
          {options.map((o) => {
            const checked = selected.includes(o.value)
            return (
              <label
                key={o.value}
                role="option"
                aria-selected={checked}
                className="flex items-center gap-2 cursor-pointer py-1 px-1.5 rounded hover:bg-gray-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value)
                    onChange(next)
                  }}
                  className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                />
                <span className="text-sm text-gray-300">{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 单条效果的数值/选项编辑区；inline 时仅渲染紧凑控件（同一行用），无 label */
function EffectValueEditor({ module, onChange, catData, inline }) {
  const [selectedSkillId, setSelectedSkillId] = useState(SKILLS[0]?.id ?? 'acrobatics')
  const [selectedAbilityId, setSelectedAbilityId] = useState(ABILITY_KEYS[0] ?? 'str')
  const effects = catData?.effects ?? []
  const currentEffect = effects.find((e) => e.key === module.effectType)
  const isBoolean = currentEffect?.dataType === 'boolean'
  const isText = currentEffect?.dataType === 'text'
  const isCustom = currentEffect?.key?.startsWith('custom_')
  const isNumber = currentEffect?.dataType === 'number'
  const needsSubSelect = currentEffect?.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect?.dataType === 'array'
  const value = module.value
  const customText = module.customText ?? ''
  const textDisplay = typeof value === 'string' ? value : (isCustom ? customText : '')

  const compactClass = inputClass + ' h-8 text-xs'
  if (isBoolean) {
    if (inline) {
      return (
        <label className="flex items-center gap-1 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange({ ...module, value: e.target.checked })}
            className="rounded border-gray-600 bg-gray-800 text-dnd-red"
          />
          <span className="text-xs text-gray-400">启用</span>
        </label>
      )
    }
    return null
  }
  if (inline) {
    if (currentEffect?.key === 'attack_distance_range' || currentEffect?.key === 'spell_range_extension' || currentEffect?.key === 'base_speed_increment') {
      const n = typeof value === 'number' ? value : (parseInt(value, 10) || 0)
      return (
        <>
          <div className="flex items-center gap-1.5 min-w-0">
            <NumberStepper
              value={n}
              onChange={(v) => onChange({ ...module, value: v })}
              step={5}
              compact
            />
            <span className="text-xs text-gray-400 shrink-0">尺</span>
          </div>
          <div />
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'attack_area' || needsSubSelect === 'attackAreaSize') {
      const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { kind: 'radius', size: 0 }
      const sizeNum = typeof obj.size === 'number' ? obj.size : (parseInt(obj.size, 10) || 0)
      return (
        <>
          <select
            value={obj.kind || 'radius'}
            onChange={(e) => onChange({ ...module, value: { ...obj, kind: e.target.value || 'radius' } })}
            className={compactClass + ' w-full min-w-0 pr-4'}
          >
            <option value="radius">半径</option>
            <option value="diameter">直径</option>
          </select>
          <div className="flex items-center gap-1 min-w-0">
            <NumberStepper
              value={sizeNum}
              onChange={(v) => onChange({ ...module, value: { ...obj, size: v } })}
              step={5}
              compact
            />
            <span className="text-xs text-gray-400 shrink-0">尺</span>
          </div>
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'crit_range_expand') {
      const options = ['', '19-20', '18-20', '17-20', '16-20']
      return (
        <>
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange({ ...module, value: e.target.value })}
            className={compactClass + ' w-full min-w-0'}
          >
            <option value="">{'20'}</option>
            {options.filter((o) => o).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <div />
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'extra_damage_dice' || needsSubSelect === 'damageDiceInline') {
      return (
        <>
          <div className="min-w-0 col-span-3">
            <DamageDiceInlineRow value={value} onChange={onChange} module={module} compact />
          </div>
        </>
      )
    }
    if (isText || isCustom) {
      return (
        <>
          <input
            type="text"
            value={isCustom ? customText : textDisplay}
            onChange={(e) => onChange(isCustom ? { ...module, customText: e.target.value } : { ...module, value: e.target.value })}
            placeholder={isCustom ? '描述...' : '填写...'}
            className={compactClass + ' w-full min-w-0 col-span-3'}
          />
        </>
      )
    }
    if (needsSubSelect === 'abilityScores') {
      return (
        <>
          <select
            value={selectedAbilityId}
            onChange={(e) => setSelectedAbilityId(e.target.value)}
            className={compactClass + ' w-full min-w-0 h-7'}
          >
            <option value="all">全属性</option>
            {ABILITY_KEYS.map((k) => (
              <option key={k} value={k}>{ABILITY_LABELS[k]}</option>
            ))}
          </select>
          <div className="min-w-0">
            <NumberStepper
              value={(typeof value === 'object' && value && selectedAbilityId !== 'all' && value[selectedAbilityId] != null ? value[selectedAbilityId] : 0) ?? 0}
              onChange={(v) => {
                const base = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
                if (selectedAbilityId === 'all') {
                  ABILITY_KEYS.forEach((k) => { base[k] = v })
                } else {
                  base[selectedAbilityId] = v
                }
                onChange({ ...module, value: base })
              }}
              compact
            />
          </div>
          <div />
        </>
      )
    }
    if (needsSubSelect === 'abilityScoresAndAdvantage') {
      return (
        <>
          <select
            value={selectedAbilityId}
            onChange={(e) => setSelectedAbilityId(e.target.value)}
            className={compactClass + ' w-full min-w-0 h-7'}
          >
            <option value="all">全属性</option>
            {ABILITY_KEYS.map((k) => (
              <option key={k} value={k}>{(module.effectType === 'save_bonus' ? SAVE_NAMES[k] : ABILITY_LABELS[k]) ?? k}</option>
            ))}
          </select>
          <div className="min-w-0">
            <NumberStepper
              value={(typeof value === 'object' && value && selectedAbilityId !== 'all' && value[selectedAbilityId] != null ? value[selectedAbilityId] : 0) ?? 0}
              onChange={(v) => {
                const base = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
                if (selectedAbilityId === 'all') {
                  ABILITY_KEYS.forEach((k) => { base[k] = v })
                } else {
                  base[selectedAbilityId] = v
                }
                onChange({ ...module, value: base })
              }}
              compact
            />
          </div>
          <select
            value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
            className={compactClass + ' w-full min-w-0 h-7'}
          >
            {ADVANTAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </>
      )
    }
    if (needsSubSelect === 'skillsAndAdvantage') {
      return (
        <>
          <select
            value={selectedSkillId}
            onChange={(e) => setSelectedSkillId(e.target.value)}
            className={compactClass + ' w-full min-w-0 h-7'}
          >
            {SKILLS.map((sk) => (
              <option key={sk.id} value={sk.id}>{sk.name}</option>
            ))}
          </select>
          <div className="min-w-0">
            <NumberStepper
              value={(typeof value === 'object' && value && value[selectedSkillId] != null ? value[selectedSkillId] : 0) ?? 0}
              onChange={(v) => {
                const base = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
                base[selectedSkillId] = v
                onChange({ ...module, value: base })
              }}
              compact
            />
          </div>
          <select
            value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
            className={compactClass + ' w-full min-w-0 h-7'}
          >
            {ADVANTAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </>
      )
    }
    if (isNumber) {
      return (
        <>
          <div className="min-w-0">
            <NumberStepper
              value={typeof value === 'number' ? value : (parseInt(value, 10) || 0)}
              onChange={(v) => onChange({ ...module, value: v })}
              compact
            />
          </div>
          <div />
          <div />
        </>
      )
    }
    if (needsSubSelect === 'damageType' && !isDamageTypeArray) {
      const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { type: 'bludgeoning', val: 0 }
      const n = typeof obj.val === 'number' ? obj.val : (parseInt(obj.val, 10) || 0)
      return (
        <>
          <select
            value={obj.type || 'bludgeoning'}
            onChange={(e) => onChange({ ...module, value: { ...obj, type: e.target.value } })}
            className={compactClass + ' w-full min-w-0'}
          >
            {DAMAGE_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <div className="min-w-0">
            <NumberStepper
              value={n}
              onChange={(v) => onChange({ ...module, value: { ...obj, val: v } })}
              compact
            />
          </div>
          <div />
        </>
      )
    }
    const numAdvVal = typeof value === 'object' && value && !Array.isArray(value) ? value : { val: typeof value === 'number' ? value : 0, advantage: '' }
    if (needsSubSelect === 'numberAndAdvantage') {
      return (
        <div className="flex items-center gap-1.5 flex-nowrap">
          <NumberStepper
            value={numAdvVal.val ?? 0}
            onChange={(v) => onChange({ ...module, value: { ...numAdvVal, val: v } })}
            compact
          />
          <div className="relative shrink-0">
            <select
              value={numAdvVal.advantage ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...numAdvVal, advantage: e.target.value } })}
              className={compactClass + ' min-w-[5.5rem] w-auto pr-6'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )
    }
    if (needsSubSelect === 'flightSpeed') {
      const fs = typeof value === 'object' && value && !Array.isArray(value) ? value : { speed: typeof value === 'number' ? value : 0, hover: false }
      const n = typeof fs.speed === 'number' ? fs.speed : (parseInt(fs.speed, 10) || 0)
      return (
        <div className="flex items-center gap-1.5">
          <NumberStepper
            value={n}
            onChange={(v) => onChange({ ...module, value: { ...fs, speed: v } })}
            step={5}
            compact
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

  if (currentEffect?.key === 'crit_range_expand') {
    const options = ['', '19-20', '18-20', '17-20', '16-20']
    return (
      <div className="flex items-center gap-2">
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange({ ...module, value: e.target.value })}
          className={inputClass + ' min-w-[7rem]'}
        >
          <option value="">{'20'}</option>
          {options.filter((o) => o).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    )
  }

  if (currentEffect?.key === 'extra_damage_dice' || needsSubSelect === 'damageDiceInline') {
    return (
      <div className="space-y-0.5">
        <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5 leading-none">伤害骰</label>
        <DamageDiceInlineRow value={value} onChange={onChange} module={module} compact={false} />
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5 leading-none">
        {isCustom ? '效果描述' : isText ? '填写内容' : isBoolean ? '开关' : isNumber ? '数字输入' : '技能下拉选项'}
      </label>
      {isBoolean ? (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange({ ...module, value: e.target.checked })}
            className="rounded border-gray-600 bg-gray-800 text-dnd-red"
          />
          <span className="text-sm text-gray-300">启用</span>
        </label>
      ) : isText && !isCustom ? (
        <input
          type="text"
          value={textDisplay}
          onChange={(e) => onChange({ ...module, value: e.target.value })}
          placeholder="按说明填写..."
          className={inputClass}
        />
      ) : isCustom ? (
        <textarea
          value={customText}
          onChange={(e) => onChange({ ...module, customText: e.target.value })}
          placeholder="自由填写规则描述..."
          rows={2}
          className={textareaClass}
        />
      ) : isNumber ? (
        <NumberStepper
          value={typeof value === 'number' ? value : (parseInt(value, 10) || 0)}
          onChange={(v) => onChange({ ...module, value: v })}
          compact={false}
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
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={(typeof value === 'object' && value?.type) || 'bludgeoning'}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), type: e.target.value } })}
            className={inputClass + ' min-w-[8rem]'}
          >
            {DAMAGE_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <NumberStepper
            value={(typeof value === 'object' && value?.val) ?? 0}
            onChange={(v) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), val: v } })}
          />
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
      ) : needsSubSelect === 'damagePiercingTraits' ? (
        (() => {
          const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { selected: Array.isArray(value) ? value : [], element: [], alignment: [] }
          const selected = obj.selected ?? []
          const pierceArr = Array.isArray(obj.pierce)
            ? obj.pierce
            : [...(Array.isArray(obj.element) ? obj.element : []), ...(Array.isArray(obj.alignment) ? obj.alignment : [])]
          const hasPierce = selected.includes('pierce') || selected.includes('element') || selected.includes('alignment')
          const sel = (k) => selected.includes(k)
          const toggle = (k, checked) => (checked ? [...selected, k] : selected.filter((x) => x !== k))
          const rowClass = 'grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-0 min-w-0'
          const labelClass = 'flex items-center gap-1.5 cursor-pointer whitespace-nowrap'
          return (
            <div className="flex flex-col gap-1">
              <div className={rowClass}>
                <label className={labelClass}>
                  <input
                    type="checkbox"
                    checked={sel('magic')}
                    onChange={(e) => onChange({ ...module, value: { ...obj, selected: toggle('magic', e.target.checked) } })}
                    className="rounded border-gray-600 bg-gray-800 text-dnd-red shrink-0"
                  />
                  <span className="text-sm text-gray-300">视为魔法</span>
                </label>
                <label className={labelClass}>
                  <input
                    type="checkbox"
                    checked={hasPierce}
                    onChange={(e) => {
                      const next = e.target.checked ? [...selected.filter((x) => x !== 'element' && x !== 'alignment'), 'pierce'] : selected.filter((x) => x !== 'pierce' && x !== 'element' && x !== 'alignment')
                      onChange({ ...module, value: { ...obj, selected: next, pierce: e.target.checked ? pierceArr : [] } })
                    }}
                    className="rounded border-gray-600 bg-gray-800 text-dnd-red shrink-0"
                  />
                  <span className="text-sm text-gray-300">忽略伤害抗性</span>
                </label>
                {hasPierce ? (
                  <MultiSelectDropdown
                    id="pierce"
                    options={PIERCING_DAMAGE_OPTIONS}
                    selected={pierceArr}
                    onChange={(next) => onChange({ ...module, value: { ...obj, pierce: next } })}
                    placeholder="选择忽视抗性"
                  />
                ) : (
                  <span />
                )}
              </div>
              <div className={rowClass}>
                <label className={labelClass}>
                  <input
                    type="checkbox"
                    checked={sel('silver')}
                    onChange={(e) => onChange({ ...module, value: { ...obj, selected: toggle('silver', e.target.checked) } })}
                    className="rounded border-gray-600 bg-gray-800 text-dnd-red shrink-0"
                  />
                  <span className="text-sm text-gray-300">视为银质</span>
                </label>
                <span />
                <span />
              </div>
            </div>
          )
        })()
      ) : needsSubSelect === 'numberAndAdvantage' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <NumberStepper
            value={(typeof value === 'object' && value && 'val' in value ? value.val : (typeof value === 'number' ? value : 0)) ?? 0}
            onChange={(v) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), val: v } })}
            compact
          />
          <div className="relative">
            <select
              value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
              className={inputClass + ' min-w-[6rem] pr-6'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      ) : needsSubSelect === 'flightSpeed' ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <NumberStepper
              value={(typeof value === 'object' && value && 'speed' in value ? value.speed : (typeof value === 'number' ? value : 0)) ?? 0}
              onChange={(v) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), speed: v } })}
              step={5}
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
        <div className="flex items-center gap-2 flex-nowrap">
          <select
            value={selectedAbilityId}
            onChange={(e) => setSelectedAbilityId(e.target.value)}
            className={inputClass + ' h-8 min-w-[6.5rem]'}
          >
            <option value="all">全属性</option>
            {ABILITY_KEYS.map((k) => (
              <option key={k} value={k}>{(module.effectType === 'save_bonus' ? SAVE_NAMES[k] : ABILITY_LABELS[k]) ?? k}</option>
            ))}
          </select>
          <NumberStepper
            value={(typeof value === 'object' && value && selectedAbilityId !== 'all' && value[selectedAbilityId] != null ? value[selectedAbilityId] : 0) ?? 0}
            onChange={(v) => {
              const base = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
              if (selectedAbilityId === 'all') {
                ABILITY_KEYS.forEach((k) => { base[k] = v })
              } else {
                base[selectedAbilityId] = v
              }
              onChange({ ...module, value: base })
            }}
            compact
          />
          <span className="text-gray-400 text-xs shrink-0">优势/劣势</span>
          <select
            value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
            className={inputClass + ' h-8 min-w-[6rem]'}
          >
            {ADVANTAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ) : needsSubSelect === 'skillsAndAdvantage' ? (
        <div className="flex items-center gap-2 flex-nowrap">
          <select
            value={selectedSkillId}
            onChange={(e) => setSelectedSkillId(e.target.value)}
            className={inputClass + ' h-8 min-w-[7rem]'}
          >
            {SKILLS.map((sk) => (
              <option key={sk.id} value={sk.id}>{sk.name}</option>
            ))}
          </select>
          <NumberStepper
            value={(typeof value === 'object' && value && value[selectedSkillId] != null ? value[selectedSkillId] : 0) ?? 0}
            onChange={(v) => {
              const valueObj = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
              valueObj[selectedSkillId] = v
              onChange({ ...module, value: valueObj })
            }}
            compact
          />
          <span className="text-gray-400 text-xs shrink-0">优势/劣势</span>
          <select
            value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
            className={inputClass + ' h-8 min-w-[6rem]'}
          >
            {ADVANTAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
    // 保存为统一 Effect 结构（与 src/lib/effects/effectModel 一致），供 useBuffCalculator 与物品效果共用
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
      category: '',
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
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-gray-800 rounded-xl border border-gray-600">
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
        <div className="flex items-center justify-between mb-0.5">
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">效果（可多条）</label>
          <button type="button" onClick={addModule} className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500 text-amber-400 hover:bg-amber-500/20 text-[10px] font-medium">
            <Plus className="w-3 h-3" />
            添加效果
          </button>
        </div>
        <div className="space-y-1">
          {effectModules.map((mod) => {
            const catData = BUFF_TYPES[mod.category]
            const effects = catData?.effects ?? []
            const visibleEffects = effects.filter((e) => !e.hidden)
            const hasCategory = !!mod.category && !!catData
            const effectTypeValid = hasCategory && effects.some((e) => e.key === mod.effectType)
            const effectiveEffectType = hasCategory && effectTypeValid ? mod.effectType : ''
            const currentEffect = effects.find((e) => e.key === effectiveEffectType)
            const complexValue = isComplexValueType(currentEffect)
            return (
              <div key={mod.id} className="rounded border border-gray-600 bg-gray-700/30 p-1.5 space-y-1">
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] items-center gap-2 w-full min-w-0">
                  <div className="min-w-0">
                    <select
                      value={mod.category || ''}
                      onChange={(e) => {
                        const newCat = e.target.value
                        const newEffects = BUFF_TYPES[newCat]?.effects ?? []
                        updateModule(mod.id, { ...mod, category: newCat, effectType: newCat ? (newEffects[0]?.key ?? '') : '' })
                      }}
                      className={inputClass + ' h-7 text-xs w-full min-w-0'}
                    >
                      <option value="">&lt;效果大类&gt;</option>
                      {getCategories().map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <select
                      value={effectiveEffectType}
                      onChange={(e) => updateModule(mod.id, { ...mod, effectType: e.target.value })}
                      className={inputClass + ' h-7 text-xs w-full min-w-0'}
                      disabled={!hasCategory}
                    >
                      <option value="">&lt;具体效果&gt;</option>
                      {visibleEffects.map((e) => (
                        <option key={e.key} value={e.key}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                  {!complexValue && (
                    <div className="col-span-3 min-w-0 flex items-center gap-1.5 flex-wrap">
                      <EffectValueEditor
                        module={{ ...mod, effectType: effectiveEffectType }}
                        onChange={(next) => updateModule(mod.id, next)}
                        catData={catData}
                        inline
                      />
                    </div>
                  )}
                  {complexValue && <div className="col-span-3" />}
                  <button
                    type="button"
                    onClick={() => removeModule(mod.id)}
                    className="h-7 w-7 rounded border border-gray-600 text-gray-400 hover:bg-red-900/40 hover:text-red-400 hover:border-red-600 flex items-center justify-center shrink-0"
                    title="删除此效果"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {complexValue && (
                  <div className="pt-0.5 border-t border-gray-600/80">
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

      <div className="flex gap-1.5 justify-end pt-1.5">
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

export { EffectValueEditor, isComplexValueType, DamageDiceInlineRow, NumberStepper }
