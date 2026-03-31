import { useState, useEffect, useRef } from 'react'
import { Trash2, Plus, ChevronDown } from 'lucide-react'
import { BUFF_TYPES, getCategories, normalizeEffectCategory, DAMAGE_TYPES, CONDITION_OPTIONS, ABILITY_KEYS, ADVANTAGE_OPTIONS, PIERCING_DAMAGE_OPTIONS, DAMAGE_DICE_ARROW_OPTIONS, DICE_SIDES_OPTIONS, parseDamageString } from '../data/buffTypes'
import { SAVE_NAMES, SKILLS } from '../data/dndSkills'
import { SPELLS, getWandScrollSpellPower } from '../data/spellDatabase'
import { inputClass, inputClassInline, textareaClass } from '../lib/inputStyles'
import DragHandleIcon from './DragHandleIcon'
import {
  BUFF_SOURCE_KIND_OPTIONS_EDITABLE,
  normalizeBuffSourceKindKey,
  getBuffSourceKindLabel,
} from '../lib/buffSourceKind'

const ABILITY_LABELS = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

function resolveInitialSourceKind(initial, defaultSourceKind) {
  if (initial?.sourceKind != null && String(initial.sourceKind).trim() !== '') {
    return normalizeBuffSourceKindKey(initial.sourceKind)
  }
  return normalizeBuffSourceKindKey(defaultSourceKind ?? 'adventure')
}

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
  if (isCustom) return typeof customText === 'string' ? customText : ''
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
  if (needsSubSelect === 'initBonusAndProficiency') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { bonus: Number(value.bonus) || 0, proficient: !!value.proficient }
    }
    return { bonus: typeof value === 'number' && !Number.isNaN(value) ? value : 0, proficient: false }
  }
  if (needsSubSelect === 'numberAndAdvantage' || needsSubSelect === 'flightSpeed' || needsSubSelect === 'abilityScoresAndAdvantage' || needsSubSelect === 'skillsAndAdvantage' || needsSubSelect === 'attackAreaSize') return value
  if (needsSubSelect === 'containedSpell') {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
    return { spellId: '', spellName: '', level: 0, hitResolution: 'dex_save', range: '', area: '', damageDice: '', damageDiceCount: 1, damageDiceSides: 6, damageType: '', charges: 0 }
  }
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
    needsSubSelect === 'damagePiercingTraits' ||
    needsSubSelect === 'containedSpell'
  )
}

/** 从 plus 如 "1d6"、"2d6+5"、"13d6-2" 解析骰数、面数、固定加值（加值步进器用） */
function parseDiceFromPlus(plus) {
  if (!plus || typeof plus !== 'string') return { count: 1, sides: 6, flatMod: 0 }
  const m = plus.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/i)
  if (!m) return { count: 1, sides: 6, flatMod: 0 }
  const count = Math.max(1, parseInt(m[1], 10) || 1)
  const sides = parseInt(m[2], 10) || 6
  const flatMod = m[3] ? parseInt(m[3], 10) : 0
  const allowedSides = [4, 6, 8, 10, 12]
  const sidesNorm = allowedSides.includes(sides) ? sides : 6
  return { count, sides: sidesNorm, flatMod: Number.isFinite(flatMod) ? flatMod : 0 }
}

function buildPlusFromDiceParts(count, sides, flatMod) {
  const c = Math.max(1, Number(count) || 1)
  const s = Number(sides) || 6
  const base = c >= 1 && s >= 4 ? `${c}d${s}` : ''
  if (!base) return ''
  const fm = Number(flatMod) || 0
  if (fm === 0) return base
  return `${base}${fm > 0 ? '+' : ''}${fm}`
}

/** 伤害模块一行：narrowBlocks 更窄块宽；evenSpacing 统一间隔；unifiedColor 同色基线对齐；evenSpread 时占满宽度且模块内均分平铺 */
function DamageDiceInlineRow({ value, onChange, module, compact, minusStepper, trailing, leftLabel, narrowBlocks, evenSpacing, unifiedColor, evenSpread }) {
  const isLegacy = typeof value === 'string'
  const parsed = isLegacy && value ? parseDamageString(value) : {}
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const plus = raw.plus ?? parsed.plus ?? ''
  const type = raw.type ?? parsed.type ?? ''
  const o3 = raw.o3 ?? parsed.o3 ?? ''
  const { count: diceCount, sides: diceSides, flatMod: diceFlatMod } = parseDiceFromPlus(plus)
  const update = (part, v) => {
    const base = isLegacy ? parseDamageString(value || '') : { ...raw }
    const next = { ...base, [part]: v, minus: '' }
    onChange({ ...module, value: next })
  }
  const setDice = (count, sides) => {
    const fm = parseDiceFromPlus(plus).flatMod
    update('plus', buildPlusFromDiceParts(count, sides, fm))
  }
  const setFlatMod = (fm) => {
    update('plus', buildPlusFromDiceParts(diceCount, diceSides, fm))
  }
  const rowH = compact ? 'h-7' : 'h-8'
  const selCls = compact ? (inputClass + ' h-7 text-xs px-1 pr-4') : (inputClass + ' h-8 text-sm px-1 pr-4')
  const noteInputCls =
    inputClassInline.replace(/\bh-10\b/, rowH).replace(/\brounded-lg\b/, 'rounded-md') +
    ' shrink-0 min-w-[3rem] w-[5rem] max-w-[9rem] px-2 py-0 border-gray-500/60 bg-gray-800/90 focus:ring-amber-500/40 ' +
    (compact ? 'text-xs' : 'text-sm')
  const labelCls = unifiedColor ? 'text-gray-200 shrink-0 text-xs' : ('text-dnd-text-muted shrink-0 ' + (compact ? 'text-[11px]' : 'text-xs'))
  const selColorCls = unifiedColor ? ' text-gray-200' : ''
  const sidesValue = DICE_SIDES_OPTIONS.some((o) => o.value === diceSides) ? diceSides : (diceSides || 6)
  const blockW = narrowBlocks ? { width: '5rem', minWidth: '5rem' } : { width: '7.5rem', minWidth: '7.5rem' }
  const blockGap = evenSpacing ? 'gap-1' : (narrowBlocks ? 'gap-2' : 'gap-5')
  const stepperBlockStyle = narrowBlocks ? { width: 'fit-content', minWidth: 'fit-content' } : blockW
  const selectBlockStyle = narrowBlocks ? { width: '5.25rem', minWidth: '5.25rem' } : blockW
  const selCenter = ' text-center'
  const selectPad = evenSpacing ? 'pl-2 pr-7' : 'pl-6 pr-7'
  const selectWrapperCls = evenSpacing ? 'shrink-0 w-[5.5rem] min-w-[5rem]' : 'shrink-0'
  const damageBlockFlex = evenSpread ? 'min-w-0 flex-1 justify-evenly' : (evenSpacing ? 'min-w-0' : 'min-w-0 flex-1')
  const damageBlock = (
    <div className={`flex items-stretch ${blockGap} flex-nowrap ${damageBlockFlex}`}>
      {/* 骰子数：narrowBlocks 时仅够数字+箭头 */}
      <div className={`flex items-center shrink-0 ${rowH}`} style={stepperBlockStyle}>
        <NumberStepper
          value={diceCount}
          onChange={(c) => setDice(c, diceSides)}
          min={1}
          max={99}
          step={1}
          compact={compact}
          narrow={narrowBlocks}
          unifiedColor={unifiedColor}
        />
      </div>
      {/* 骰子面数 d4～d12 */}
      <div className={`flex items-center ${selectWrapperCls} ${rowH}`} style={!evenSpacing ? selectBlockStyle : undefined}>
        <select
          value={String(sidesValue)}
          onChange={(e) => setDice(diceCount, parseInt(e.target.value, 10) || 6)}
          className={selCls + selCenter + selColorCls + ' w-full min-w-0 h-full ' + selectPad}
          title="骰子大小"
        >
          {DICE_SIDES_OPTIONS.map((o) => (
            <option key={o.value} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </div>
      {/* 固定加值（XdY+N），在 dX 与伤害类型之间；与项目「数字输入」NumberStepper 一致 */}
      <div className={`flex items-center shrink-0 ${rowH}`} style={stepperBlockStyle} title="伤害加值（如 +5，与骰子合计为总伤害骰部分）">
        <NumberStepper
          value={diceFlatMod}
          onChange={setFlatMod}
          min={-99}
          max={99}
          step={1}
          compact={compact}
          narrow={narrowBlocks}
          unifiedColor={unifiedColor}
        />
      </div>
      {/* 伤害类型：evenSpacing 时缩小左右内边距以完整显示二字类型 */}
      <div className={`flex items-center ${selectWrapperCls} ${rowH}`} style={!evenSpacing ? selectBlockStyle : undefined}>
        <select value={type} onChange={(e) => update('type', e.target.value)} className={selCls + selCenter + selColorCls + ' w-full min-w-0 h-full ' + selectPad} title="伤害类型">
          <option value="">类型</option>
          {DAMAGE_TYPES.map((d) => (
            <option key={d.value} value={d.label}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className={`flex items-center shrink-0 min-w-0 ${rowH}`} title="附注（写入攻击字段末尾「 #…」）">
        <input
          type="text"
          value={o3}
          onChange={(e) => update('o3', e.target.value)}
          className={noteInputCls + selColorCls}
          placeholder="附注"
          maxLength={80}
        />
      </div>
    </div>
  )
  const labelGap = evenSpacing ? 'gap-1' : 'gap-3'
  const alignCls = unifiedColor ? 'items-baseline' : 'items-stretch'
  if (trailing != null) {
    return (
      <div className={`flex ${alignCls} ${evenSpacing ? 'gap-3' : 'gap-6'} flex-nowrap w-full min-w-0 ${rowH}`}>
        <div className={`flex ${alignCls} ${labelGap} flex-1 min-w-0 justify-start ${rowH}`}>
          {leftLabel != null && leftLabel !== '' && <span className={labelCls}>{leftLabel}</span>}
          {damageBlock}
        </div>
        <div className={`flex items-center gap-1.5 shrink-0 justify-end ${rowH}`}>
          {trailing}
        </div>
      </div>
    )
  }
  const rootCls = evenSpread ? 'w-full min-w-0 flex-1' : (evenSpacing ? 'shrink-0 max-w-full' : 'w-full min-w-0')
  const rootJustify = evenSpread ? 'justify-evenly' : ''
  return (
    <div className={`flex ${alignCls} ${labelGap} ${rootJustify} flex-nowrap text-left ${rootCls} ${rowH}`}>
      {leftLabel != null && leftLabel !== '' && <span className={labelCls}>{leftLabel}</span>}
      {damageBlock}
    </div>
  )
}

/** 数字输入：统一使用「中间数字 + 上下箭头」设计。narrow 时容器仅够数字与箭头；unifiedColor 时与行内标签同色；pill 为胶囊样式（左减右加） */
function NumberStepper({ value, onChange, min = -999, max = 999, step = 1, compact, narrow, unifiedColor, pill, disabled }) {
  const rowH = pill ? 'h-7' : 'h-7'
  const textSize = compact || pill ? 'text-xs' : 'text-sm'
  const colorCls = disabled
    ? 'text-gray-600 cursor-not-allowed'
    : unifiedColor
      ? 'text-gray-200 hover:text-gray-100'
      : 'text-gray-400 hover:text-white'
  const inputColorCls = disabled ? 'text-gray-500' : unifiedColor ? 'text-gray-200' : 'text-white'
  const num = typeof value === 'number' ? value : (parseInt(value, 10) || 0)
  const clamp = (v) => Math.min(max, Math.max(min, v))
  const handleInputChange = (e) => {
    if (disabled) return
    const s = e.target.value
    if (s === '' || s === '-') onChange(clamp(0))
    else { const v = parseInt(s, 10); if (!Number.isNaN(v)) onChange(clamp(v)) }
  }
  const padX = pill ? 'pl-1.5 pr-1.5' : (narrow ? 'px-5' : 'px-7')
  const inputWidth = pill ? 'min-w-[1.5rem] w-8 flex-1' : (narrow ? 'min-w-[2rem] w-11' : compact ? 'min-w-[2rem] flex-1' : 'min-w-[3.5rem] w-20')
  /** compact 默认拉满父级；若同时 narrow（如属性卡、伤害骰行），用固定最小宽度，避免三列网格把步进器压扁导致箭头与数字重叠 */
  const compactWidthCls =
    compact && narrow
      ? 'w-[6.75rem] min-w-[6.5rem] max-w-[min(100%,7.5rem)] shrink-0'
      : compact && !narrow
        ? 'w-full min-w-0 max-w-full'
        : ''
  const wrapperCls = pill
    ? `relative flex items-center border border-gray-600 rounded-full bg-gray-700 shadow-sm ${padX} ${rowH} max-w-full ${disabled ? 'opacity-60' : ''}`
    : `relative flex items-center border border-gray-500/60 rounded-md bg-gray-800/90 shadow-sm ${padX} ${rowH} ${compactWidthCls} ${disabled ? 'opacity-60' : ''}`
  return (
    <div className={wrapperCls}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(clamp(num - step))}
        className={`shrink-0 flex items-center justify-center ${colorCls} ${textSize} ${pill ? 'w-6 h-6 rounded-full hover:bg-gray-600/50' : 'absolute left-1'} disabled:pointer-events-none`}
        aria-label="减少"
      >
        <ChevronDown className={`w-3.5 h-3.5 ${compact && !pill ? '' : 'w-3.5 h-3.5'}`} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={num}
        disabled={disabled}
        onChange={handleInputChange}
        className={`flex-1 min-w-0 ${inputWidth} text-center ${inputColorCls} bg-transparent border-0 focus:outline-none focus:ring-0 ${rowH} ${textSize} tabular-nums ${pill ? 'px-0' : ''} disabled:cursor-not-allowed`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(clamp(num + step))}
        className={`shrink-0 flex items-center justify-center ${colorCls} ${textSize} ${pill ? 'w-6 h-6 rounded-full hover:bg-gray-600/50' : 'absolute right-1'} disabled:pointer-events-none`}
        aria-label="增加"
      >
        <ChevronDown className={`w-3.5 h-3.5 rotate-180 ${compact && !pill ? '' : 'w-3.5 h-3.5'}`} />
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

/** 单条效果的数值/选项编辑区；inline 时仅渲染紧凑控件（同一行用），无 label。可选 spellDC/spellAttackBonus 用于内含法术命中判断旁显示实际数值；useWandScrollTable 为真时改用魔杖/卷轴法强表按环阶显示 */
function EffectValueEditor({
  module,
  onChange,
  catData,
  inline,
  spellDC,
  spellAttackBonus,
  useWandScrollTable,
  /** 内含法术：仅第一行（法术名 / 环位 / 充能），隐藏命中、距离、伤害；用于制作队列新建等场景，细项在入库后背包编辑 */
  containedSpellPrimaryOnly = false,
  /** 内含法术第一行不显示「充能数」步进器（充能由表单其它控件统一提供，如制作工厂的「充能次数」） */
  containedSpellHideChargesInPrimary = false,
  /** 内含法术第一行「内含法术」文案前的序号（与内含法术同一 flex 行），如 "1." */
  containedSpellRowPrefix,
  /** 为真时不显示顶部的「选项」等区块标题（制作工厂等场景） */
  hideSectionLabel = false,
}) {
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

  useEffect(() => {
    if (!['abilityScores', 'abilityScoresAndAdvantage'].includes(needsSubSelect)) return
    if (!(value && typeof value === 'object' && !Array.isArray(value))) return
    const preferred = ABILITY_KEYS.find((k) => value[k] != null && Number(value[k]) !== 0) || ABILITY_KEYS.find((k) => value[k] != null)
    if (preferred && preferred !== selectedAbilityId) setSelectedAbilityId(preferred)
  }, [module.id, module.effectType, needsSubSelect])

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
          <div className="min-w-0 w-full">
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
            className={compactClass + ' w-full min-w-0'}
          />
        </>
      )
    }
    if (needsSubSelect === 'abilityScores') {
      return (
        <>
          <select
            value={selectedAbilityId}
            onChange={(e) => {
              const nextKey = e.target.value
              const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
              const currentVal = selectedAbilityId === 'all'
                ? (Number(obj[ABILITY_KEYS.find((k) => obj[k] != null) || ABILITY_KEYS[0]]) || 0)
                : (Number(obj[selectedAbilityId]) || 0)
              const base = {}
              if (nextKey === 'all') ABILITY_KEYS.forEach((k) => { base[k] = currentVal })
              else base[nextKey] = currentVal
              setSelectedAbilityId(nextKey)
              onChange({ ...module, value: base })
            }}
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
                // 单行单属性：选中单属性时清空其它属性，避免残留导致外层摘要与表单不一致
                const base = {}
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
        </>
      )
    }
    if (needsSubSelect === 'abilityScoresAndAdvantage') {
      return (
        <div className="flex min-h-7 w-full min-w-0 flex-nowrap items-stretch gap-1">
          <div className="min-w-0 basis-0 flex-[2.5]">
            <select
              value={selectedAbilityId}
              onChange={(e) => {
                const nextKey = e.target.value
                const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
                const currentVal = selectedAbilityId === 'all'
                  ? (Number(obj[ABILITY_KEYS.find((k) => obj[k] != null) || ABILITY_KEYS[0]]) || 0)
                  : (Number(obj[selectedAbilityId]) || 0)
                const base = {}
                if (obj.advantage != null) base.advantage = obj.advantage
                if (nextKey === 'all') ABILITY_KEYS.forEach((k) => { base[k] = currentVal })
                else base[nextKey] = currentVal
                setSelectedAbilityId(nextKey)
                onChange({ ...module, value: base })
              }}
              className={compactClass + ' h-7 w-full min-w-0 max-w-full'}
            >
              <option value="all">全属性</option>
              {ABILITY_KEYS.map((k) => (
                <option key={k} value={k}>{(module.effectType === 'save_bonus' ? SAVE_NAMES[k] : ABILITY_LABELS[k]) ?? k}</option>
              ))}
            </select>
          </div>
          <div className="flex shrink-0 items-center">
            <NumberStepper
              value={(typeof value === 'object' && value && selectedAbilityId !== 'all' && value[selectedAbilityId] != null ? value[selectedAbilityId] : 0) ?? 0}
              onChange={(v) => {
                // 单行单属性；保留 advantage 字段
                const base = {}
                if (typeof value === 'object' && value && !Array.isArray(value) && value.advantage != null) base.advantage = value.advantage
                if (selectedAbilityId === 'all') {
                  ABILITY_KEYS.forEach((k) => { base[k] = v })
                } else {
                  base[selectedAbilityId] = v
                }
                onChange({ ...module, value: base })
              }}
              compact
              narrow
            />
          </div>
          <div className="min-w-0 basis-0 flex-[2]">
            <select
              value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
              className={compactClass + ' h-7 w-full min-w-0 max-w-full'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )
    }
    if (needsSubSelect === 'skillsAndAdvantage') {
      return (
        <div className="flex min-h-7 w-full min-w-0 flex-nowrap items-stretch gap-1">
          <div className="min-w-0 basis-0 flex-[2.5]">
            <select
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value)}
              className={compactClass + ' h-7 w-full min-w-0 max-w-full'}
            >
              {SKILLS.map((sk) => (
                <option key={sk.id} value={sk.id}>{sk.name}</option>
              ))}
            </select>
          </div>
          <div className="flex shrink-0 items-center">
            <NumberStepper
              value={(typeof value === 'object' && value && value[selectedSkillId] != null ? value[selectedSkillId] : 0) ?? 0}
              onChange={(v) => {
                const base = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
                base[selectedSkillId] = v
                onChange({ ...module, value: base })
              }}
              compact
              narrow
            />
          </div>
          <div className="min-w-0 basis-0 flex-[2]">
            <select
              value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
              className={compactClass + ' h-7 w-full min-w-0 max-w-full'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
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
    if (needsSubSelect === 'initBonusAndProficiency') {
      const ib = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : { bonus: typeof value === 'number' ? value : 0, proficient: false }
      const bon = typeof ib.bonus === 'number' ? ib.bonus : (parseInt(ib.bonus, 10) || 0)
      return (
        <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5">
          <NumberStepper
            value={bon}
            onChange={(v) => onChange({ ...module, value: { ...ib, bonus: v } })}
            compact
          />
          <label className="flex items-center gap-1 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={!!ib.proficient}
              onChange={(e) => onChange({ ...module, value: { ...ib, proficient: e.target.checked } })}
              className="rounded border-gray-600 bg-gray-800 text-dnd-red"
            />
            <span className="text-xs text-gray-400">先攻熟练</span>
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
      {!hideSectionLabel && (
        <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5 leading-none">
          {isCustom ? '效果描述' : isText ? '填写内容' : isBoolean ? '开关' : isNumber ? '数字输入' : '选项'}
        </label>
      )}
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
      ) : needsSubSelect === 'initBonusAndProficiency' ? (
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const ib = value && typeof value === 'object' && !Array.isArray(value)
              ? value
              : { bonus: typeof value === 'number' ? value : 0, proficient: false }
            const bon = typeof ib.bonus === 'number' ? ib.bonus : (parseInt(ib.bonus, 10) || 0)
            return (
              <>
                <NumberStepper
                  value={bon}
                  onChange={(v) => onChange({ ...module, value: { ...ib, bonus: v } })}
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!ib.proficient}
                    onChange={(e) => onChange({ ...module, value: { ...ib, proficient: e.target.checked } })}
                    className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                  />
                  <span className="text-sm text-gray-300">先攻获得熟练加值（PB）</span>
                </label>
              </>
            )
          })()}
        </div>
      ) : needsSubSelect === 'abilityScoresAndAdvantage' ? (
        <div className="flex items-center gap-2 flex-nowrap">
          <select
            value={selectedAbilityId}
            onChange={(e) => {
              const nextKey = e.target.value
              const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
              const currentVal = selectedAbilityId === 'all'
                ? (Number(obj[ABILITY_KEYS.find((k) => obj[k] != null) || ABILITY_KEYS[0]]) || 0)
                : (Number(obj[selectedAbilityId]) || 0)
              const base = {}
              if (obj.advantage != null) base.advantage = obj.advantage
              if (nextKey === 'all') ABILITY_KEYS.forEach((k) => { base[k] = currentVal })
              else base[nextKey] = currentVal
              setSelectedAbilityId(nextKey)
              onChange({ ...module, value: base })
            }}
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
      ) : needsSubSelect === 'containedSpell' ? (
        (() => {
          const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { spellId: '', spellName: '', level: 0, hitResolution: 'dex_save', range: '', area: '', damageDice: '', damageDiceCount: 1, damageDiceSides: 6, damageType: '', charges: 0 }
          const spellId = obj.spellId ?? ''
          const spellName = obj.spellName ?? ''
          const level = typeof obj.level === 'number' ? obj.level : (parseInt(obj.level, 10) || 0)
          const charges = typeof obj.charges === 'number' ? Math.max(0, obj.charges) : (parseInt(obj.charges, 10) || 0)
          const hitResolutionList = ['dex_save', 'str_save', 'con_save', 'wis_save', 'int_save', 'cha_save', 'spell_attack']
          const hitResolution = hitResolutionList.includes(obj.hitResolution) ? obj.hitResolution : 'dex_save'
          const spell = spellId ? SPELLS.find((s) => s.id === spellId) : null
          const rangeValue = obj.range ?? spell?.range ?? ''
          const sidesOpts = [4, 6, 8, 10, 12]
          let damageDiceCount = typeof obj.damageDiceCount === 'number' ? Math.max(0, obj.damageDiceCount) : (parseInt(obj.damageDiceCount, 10) || 0)
          let damageDiceSides = sidesOpts.includes(Number(obj.damageDiceSides)) ? Number(obj.damageDiceSides) : 6
          if ((damageDiceCount === 0 || damageDiceSides === 6) && obj.damageDice && typeof obj.damageDice === 'string') {
            const parsed = parseDamageString(obj.damageDice.trim())
            const m = (parsed.plus || '').match(/^(\d*)d(\d+)$/i)
            if (m) {
              const c = parseInt(m[1], 10) || 1
              const s = parseInt(m[2], 10)
              if (sidesOpts.includes(s)) { damageDiceSides = s; if (damageDiceCount === 0) damageDiceCount = Math.max(1, c) }
            }
          }
          const damageType = obj.damageType ?? ''
          const HIT_RESOLUTION_OPTIONS = [
            { value: 'dex_save', label: '敏捷豁免' },
            { value: 'str_save', label: '力量豁免' },
            { value: 'con_save', label: '体质豁免' },
            { value: 'wis_save', label: '感知豁免' },
            { value: 'int_save', label: '智力豁免' },
            { value: 'cha_save', label: '魅力豁免' },
            { value: 'spell_attack', label: '法术攻击加值' },
          ]
          const wandScrollPower = useWandScrollTable ? getWandScrollSpellPower(level) : null
          const hitValueDisplay = useWandScrollTable && wandScrollPower
            ? (hitResolution === 'spell_attack' ? (wandScrollPower.attackBonus >= 0 ? '+' : '') + wandScrollPower.attackBonus : String(wandScrollPower.dc))
            : (hitResolution === 'spell_attack' && spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : (spellDC != null ? String(spellDC) : null))
          const sep = <span className="text-dnd-text-muted shrink-0">|</span>
          return (
            <div className="flex flex-col gap-y-1 text-xs w-full">
              {/* 第一行：宽度 5 份 — 内含法术 3 份 | 释放环位 1 份 | 充能数 1 份 */}
              <div className="flex items-center gap-x-2 flex-nowrap min-w-0 whitespace-nowrap w-full overflow-hidden">
                <div className="flex-[3] min-w-0 flex items-center gap-x-2">
                  {containedSpellRowPrefix != null && String(containedSpellRowPrefix).trim() !== '' && (
                    <span className="text-dnd-text-muted shrink-0 tabular-nums select-none">{containedSpellRowPrefix}</span>
                  )}
                  <span className="text-dnd-text-muted shrink-0">内含法术</span>
                  <input
                    type="text"
                    value={spellName}
                    onChange={(e) => {
                      const name = e.target.value
                      const match = name.trim() ? SPELLS.find((s) => s.name === name.trim()) : null
                      const prevSpellId = (obj.spellId ?? '').trim()
                      const nextSpellId = match ? match.id : ''
                      let nextLevel = level
                      if (match) {
                        if (nextSpellId !== prevSpellId) {
                          // 换了一道法术：用新法术默认环位；若刚从「未识别名」补全且玩家已填过环位则保留（避免重打字丢升环）
                          nextLevel = prevSpellId === '' && level > 0 ? level : match.level
                        }
                        // 同一法术：不碰环位，玩家可自由改升环/戏法等
                      }
                      onChange({
                        ...module,
                        value: {
                          ...obj,
                          spellName: name,
                          spellId: nextSpellId,
                          range: match ? (match.range ?? '') : obj.range,
                          area: match ? (match.range ?? '') : obj.area,
                          level: nextLevel,
                        },
                      })
                    }}
                    placeholder="输入法术名称搜索"
                    className={inputClass + ' h-7 text-xs flex-1 min-w-0 rounded-md border-2 border-gray-500 bg-gray-700/80 placeholder:text-gray-400 focus:border-amber-500/80'}
                    list={'contained-spell-datalist-' + (module.id ?? '')}
                    title="法术名称"
                  />
                  <datalist id={'contained-spell-datalist-' + (module.id ?? '')}>
                    {SPELLS.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </div>
                {sep}
                <div className={containedSpellHideChargesInPrimary ? 'flex-[2] min-w-0 flex items-center gap-x-2' : 'flex-[1] min-w-0 flex items-center gap-x-2'}>
                  <span className="text-dnd-text-muted shrink-0">释放环位</span>
                  <NumberStepper
                    value={Math.max(0, Math.min(9, level))}
                    onChange={(v) =>
                      onChange({
                        ...module,
                        value: { ...obj, level: Math.max(0, Math.min(9, v)) },
                      })
                    }
                    min={0}
                    max={9}
                    compact
                  />
                </div>
                {!containedSpellHideChargesInPrimary && (
                  <>
                    {sep}
                    <div className="flex-[1] min-w-0 flex items-center gap-x-2">
                      <span className="text-dnd-text-muted shrink-0">充能数</span>
                      <NumberStepper
                        value={charges}
                        onChange={(v) => onChange({ ...module, value: { ...obj, charges: Math.max(0, v) } })}
                        min={0}
                        max={99}
                        compact
                      />
                    </div>
                  </>
                )}
              </div>
              {!containedSpellPrimaryOnly && (
                <>
                  {/* 第二行：宽度 5 份 — 命中判断 1 份 | 施法距离（可修改）1 份 | 伤害 3 份 */}
                  <div className="flex items-center gap-x-2 flex-nowrap min-w-0 whitespace-nowrap w-full overflow-hidden">
                    <div className="flex-[1] min-w-0 flex items-center gap-x-2">
                      <span className="text-dnd-text-muted shrink-0">命中判断</span>
                      <select
                        value={hitResolution}
                        onChange={(e) => onChange({ ...module, value: { ...obj, hitResolution: e.target.value } })}
                        className={inputClass + ' h-7 text-xs flex-1 min-w-0'}
                      >
                        {HIT_RESOLUTION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {hitValueDisplay != null && (
                        <span className="text-white font-mono tabular-nums shrink-0">{hitValueDisplay}</span>
                      )}
                    </div>
                    {sep}
                    <div className="flex-[1] min-w-0 flex items-center gap-x-2">
                      <span className="text-dnd-text-muted shrink-0">施法距离</span>
                      <input
                        type="text"
                        value={rangeValue}
                        onChange={(e) => onChange({ ...module, value: { ...obj, range: e.target.value } })}
                        placeholder="如 自身、60尺"
                        className={inputClass + ' h-7 text-xs flex-1 min-w-0'}
                      />
                    </div>
                    {sep}
                    <div className="flex-[3] min-w-0 flex items-center gap-x-2">
                      <span className="text-dnd-text-muted shrink-0">伤害</span>
                      <NumberStepper
                        value={damageDiceCount}
                        onChange={(v) => onChange({ ...module, value: { ...obj, damageDiceCount: Math.max(0, Math.min(99, v)) } })}
                        min={0}
                        max={99}
                        compact
                      />
                      <select
                        value={damageDiceSides}
                        onChange={(e) => onChange({ ...module, value: { ...obj, damageDiceSides: Number(e.target.value) } })}
                        className={inputClass + ' h-7 text-xs min-w-0 text-white bg-[var(--input-bg)]'}
                      >
                        {DICE_SIDES_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value} className="bg-gray-800 text-white">{o.label}</option>
                        ))}
                      </select>
                      <div className="flex-1 min-w-[5rem] relative flex items-center rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] h-7 px-2">
                        <span className="text-white text-xs flex-1 min-w-0 truncate pointer-events-none">
                          {damageType ? (DAMAGE_TYPES.find((d) => d.value === damageType)?.label ?? damageType) : '— 类型 —'}
                        </span>
                        <select
                          value={damageType}
                          onChange={(e) => onChange({ ...module, value: { ...obj, damageType: e.target.value } })}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title="伤害类型"
                        >
                          <option value="">— 类型 —</option>
                          {DAMAGE_TYPES.map((d) => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })()
      ) : null}
    </div>
  )
}

export default function BuffForm({ initial, onSave, onCancel, defaultSourceKind, spellDC, spellAttackBonus, useWandScrollTable }) {
  const sourceKindLocked = !!(initial?.fromFeat || initial?.fromItem)
  const [source, setSource] = useState(initial?.source ?? '')
  const [duration, setDuration] = useState(initial?.duration ?? '')
  const [sourceKind, setSourceKind] = useState(() =>
    sourceKindLocked ? normalizeBuffSourceKindKey('adventure') : resolveInitialSourceKind(initial, defaultSourceKind),
  )
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
      let val = normalizeValueForSave(mod, currentEffect)
      // 自由填写类：统一用 customText 写入 value，保证持久化与外层展示
      if (currentEffect?.key?.startsWith('custom_')) {
        val = typeof mod.customText === 'string' ? mod.customText : (typeof val === 'string' ? val : '')
      }
      return { category: mod.category, effectType, value: val }
    }).filter((ef) => ef.effectType)
    if (!effects.length && !initial?.fromFeat) return
    const payload = {
      ...initial,
      source: source.trim(),
      duration: duration.trim() || undefined,
      effects,
      enabled: initial?.enabled !== false,
    }
    if (!initial?.fromFeat && !initial?.fromItem) {
      payload.sourceKind = normalizeBuffSourceKindKey(sourceKind)
    }
    onSave(payload)
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
        <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">来源归类</label>
        {sourceKindLocked ? (
          <div
            className={
              inputClass +
              ' flex items-center h-10 cursor-default bg-gray-900/50 text-gray-300 border-gray-600/80'
            }
            title="专长与装备由系统自动归类，不可修改"
          >
            <span>{getBuffSourceKindLabel(initial)}</span>
            <span className="ml-2 text-[10px] font-normal text-gray-500 tracking-normal">自动</span>
          </div>
        ) : (
          <select
            value={sourceKind}
            onChange={(e) => setSourceKind(normalizeBuffSourceKindKey(e.target.value))}
            className={inputClass + ' cursor-pointer'}
            title="Buff 在列表中的小标签归类"
          >
            {BUFF_SOURCE_KIND_OPTIONS_EDITABLE.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}
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
                <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1 w-full min-w-0">
                  <div className="flex items-center justify-center shrink-0 w-5 pointer-events-none select-none" aria-hidden>
                    <DragHandleIcon className="w-3.5 h-3.5 text-dnd-text-muted opacity-70" />
                  </div>
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
                      onChange={(e) => {
                        const nextType = e.target.value
                        const patch = { ...mod, effectType: nextType }
                        if (nextType === 'initiative_buff') patch.value = { bonus: 0, proficient: false }
                        updateModule(mod.id, patch)
                      }}
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
                    <div className="col-span-2 min-w-0 flex flex-nowrap items-center gap-1 overflow-hidden">
                      <EffectValueEditor
                        module={{ ...mod, effectType: effectiveEffectType }}
                        onChange={(next) => updateModule(mod.id, next)}
                        catData={catData}
                        inline
                        spellDC={spellDC}
                        spellAttackBonus={spellAttackBonus}
                        useWandScrollTable={useWandScrollTable}
                      />
                    </div>
                  )}
                  {complexValue && <div className="col-span-2" />}
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
                      spellDC={spellDC}
                      spellAttackBonus={spellAttackBonus}
                      useWandScrollTable={useWandScrollTable}
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
