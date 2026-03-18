import { useState, useMemo, useCallback } from 'react'
import { Dices, Circle, Shield, ShieldHalf } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
import { abilityModifier, proficiencyBonus } from '../lib/characterStore'
import { SAVE_NAMES, SKILLS, SKILL_PROF_OPTIONS, skillProfFactor } from '../data/dndSkills'
import { NumberStepper } from './BuffForm'

const ABILITY_NAMES_ZH = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/**
 * 根据熟练度等级返回文字颜色类名（写死完整类名，避免 Tailwind  purge 掉）
 * expertise=精通(暗金+光晕), prof=熟练(红), half=半熟练(天蓝), none=无(灰)
 */
function getProficiencyColor(level) {
  switch (level) {
    case 'expertise':
      return 'text-[#B8860B] drop-shadow-[0_0_5px_rgba(184,134,11,0.5)]'
    case 'prof':
      return 'text-[#E01C2F]'
    case 'half':
      return 'text-sky-400'
    default:
      return 'text-gray-500'
  }
}

/**
 * 豁免专用：熟练=暗金+光晕，未熟练=灰（与技能不同，豁免熟练用暗金）
 */
function getSaveProficiencyColor(level) {
  switch (level) {
    case 'prof':
      return 'text-[#B8860B] drop-shadow-[0_0_5px_rgba(184,134,11,0.5)]'
    default:
      return 'text-gray-500'
  }
}

/** 技能行：熟练→金色文案，精通→红色，半熟练→天蓝 */
function getSkillRowLabelClass(level) {
  switch (level) {
    case 'expertise':
      return 'text-[#E01C2F]'
    case 'prof':
      return 'text-[#D4AF37]'
    case 'half':
      return 'text-sky-400'
    default:
      return 'text-gray-300'
  }
}

/** 技能行左侧标识：熟练=金条；精通=金线+红条（参考图2）；半熟练=蓝；无=灰 */
function getSkillRowLeftBorderClass(level) {
  switch (level) {
    case 'prof':
      return 'border-l-[3px] border-l-[#D4AF37]'
    case 'half':
      return 'border-l-[3px] border-l-[#38BDF8]'
    default:
      return 'border-l-[3px] border-l-gray-500'
  }
}

function getSkillDiceButtonClass(level, isRolling) {
  if (isRolling) {
    if (level === 'prof') return 'bg-white text-[#B8860B] scale-110'
    if (level === 'expertise') return 'bg-white text-[#E01C2F] scale-110'
    if (level === 'half') return 'bg-white text-sky-600 scale-110'
    return 'bg-white text-gray-600 scale-110'
  }
  switch (level) {
    case 'expertise':
      return 'bg-[#E01C2F] hover:bg-[#C41828] text-white'
    case 'prof':
      return 'bg-[#B8860B] hover:bg-[#9A7209] text-white'
    case 'half':
      return 'bg-sky-600 hover:bg-sky-500 text-white'
    default:
      return 'bg-gray-600 hover:bg-gray-500 text-white'
  }
}

/** 熟练度图标：无=灰圈, 半=天蓝半盾, 熟练=红实心盾, 精通=金实心盾+光晕；className 用 getProficiencyColor 写死颜色 */
function ProficiencyIcon({ level, className = 'w-5 h-5' }) {
  const colorClass = getProficiencyColor(level)
  const common = `${className} ${colorClass}`.trim()
  if (level === 'none') {
    return <Circle className={common} strokeWidth={2} aria-hidden />
  }
  if (level === 'half') {
    return <ShieldHalf className={common} aria-hidden />
  }
  if (level === 'expertise') {
    return (
      <Shield
        className={common}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden
      />
    )
  }
  return (
    <Shield className={common} fill="currentColor" stroke="currentColor" strokeWidth={1.5} aria-hidden />
  )
}

/** 豁免仅两种状态：未熟练 / 熟练；熟练时用暗金色 */
function SaveProficiencyIcon({ level }) {
  const colorClass = getSaveProficiencyColor(level)
  const common = `w-5 h-5 ${colorClass}`.trim()
  if (level === 'none') {
    return <Circle className={common} strokeWidth={2} aria-hidden />
  }
  return (
    <Shield className={common} fill="currentColor" stroke="currentColor" strokeWidth={1.5} aria-hidden />
  )
}

/**
 * 属性与技能/豁免 — 暗金主色 + 熟练度四色系统 + MOD/SAVE 同大并排
 */
export default function AbilityModule({ char, abilities, buffStats, level, canEdit, onSave }) {
  const { openForCheck } = useRoll()
  const effectiveAbilities = buffStats?.abilities ?? abilities
  const [rollingId, setRollingId] = useState(null) // 正在播放投掷动画的 skill/save id
  const prof = buffStats?.proficiencyOverride != null ? buffStats.proficiencyOverride : proficiencyBonus(level ?? 1)
  const saves = char?.savingThrows ?? { str: false, dex: false, con: false, int: false, wis: false, cha: false }
  const skillsState = char?.skills ?? {}

  const updateAbility = useCallback((key, value) => {
    const next = { ...abilities, [key]: Math.max(1, Math.min(30, Number(value) || 10)) }
    onSave({ abilities: next })
  }, [abilities, onSave])

  const setSave = useCallback((key, checked) => {
    onSave({ savingThrows: { ...saves, [key]: checked } })
  }, [saves, onSave])

  const setSkill = useCallback((skillId, value) => {
    onSave({ skills: { ...skillsState, [skillId]: value } })
  }, [skillsState, onSave])

  const saveMod = useCallback((key) => {
    const mod = abilityModifier(effectiveAbilities[key] ?? 10)
    return mod + (saves[key] ? prof : 0)
  }, [effectiveAbilities, saves, prof])

  const skillMod = useCallback((skill) => {
    const mod = abilityModifier(effectiveAbilities[skill.ab] ?? 10)
    const factor = skillProfFactor(skillsState[skill.id] || 'none')
    return mod + Math.floor(prof * factor)
  }, [effectiveAbilities, skillsState, prof])

  const skillsByAb = useMemo(() => {
    const m = { str: [], dex: [], con: [], int: [], wis: [], cha: [] }
    SKILLS.forEach((s) => m[s.ab].push(s))
    return m
  }, [])

  const exhaustionPenalty = buffStats?.d20ExhaustionPenalty ?? 0
  const handleSaveRoll = useCallback((key) => {
    const saveBonus = saveMod(key) + exhaustionPenalty
    const adv = buffStats?.advantage?.save
    openForCheck(SAVE_NAMES[key], saveBonus, adv && adv !== 'normal' ? { advantage: adv } : undefined)
    setRollingId(`save-${key}`)
    setTimeout(() => setRollingId(null), 400)
  }, [saveMod, openForCheck, buffStats?.advantage?.save, exhaustionPenalty])

  const handleSkillRoll = useCallback((skill, total) => {
    const adv = buffStats?.advantage?.skill
    openForCheck(skill.name, total + exhaustionPenalty, adv && adv !== 'normal' ? { advantage: adv } : undefined)
    setRollingId(skill.id)
    setTimeout(() => setRollingId(null), 400)
  }, [openForCheck, buffStats?.advantage?.skill, exhaustionPenalty])

  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-800 border border-dnd-gold/50 text-dnd-gold-light font-mono font-bold text-base">
          熟练值 +{prof}
        </span>
      </div>

      <div className="grid grid-cols-3 max-[500px]:grid-cols-2 gap-1.5">
        {ABILITY_KEYS.map((key) => {
          const baseScore = abilities[key] ?? 10
          const effectiveScore = effectiveAbilities[key] ?? 10
          const mod = abilityModifier(effectiveScore)
          const saveBonus = saveMod(key)
          const skillList = skillsByAb[key] || []

          const saveProfLevel = saves[key] ? 'prof' : 'none'

          return (
            <div
              key={key}
              className={`rounded-xl overflow-hidden bg-dnd-card border shadow-dnd-card flex flex-col min-w-0 transition-colors ${saveProfLevel === 'prof' ? 'border-[#B8860B]' : 'border-gray-500'}`}
            >
              {/* A. 顶部栏：属性名 + 熟练按钮在名称右侧 */}
              <div className="flex items-center gap-1.5 px-1.5 py-1 border-b border-gray-700 min-h-[1.75rem]">
                <span className="text-base font-bold text-white font-sans">{ABILITY_NAMES_ZH[key]}</span>
                <span className={`text-[10px] font-medium ${saveProfLevel === 'prof' ? 'text-[#D4AF37]' : 'text-gray-500'}`}>
                  熟练
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setSave(key, !saves[key])}
                    className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-dnd-gold-light"
                    title={saves[key] ? '熟练（点击取消）' : '未熟练（点击设为熟练）'}
                  >
                    <SaveProficiencyIcon level={saveProfLevel} />
                  </button>
                ) : (
                  <span className="p-0.5"><SaveProficiencyIcon level={saveProfLevel} /></span>
                )}
              </div>

              {/* B. 核心区：3 列网格，紧凑排版 */}
              <div className="px-1.5 py-0.5">
                <div className={`rounded-lg py-1 px-1.5 grid grid-cols-[1fr_1fr_1fr] grid-rows-[auto_auto] gap-x-1.5 gap-y-1 min-w-0 border ${saveProfLevel === 'prof' ? 'border-[#B8860B]' : 'border-gray-500'}`} style={{ background: 'linear-gradient(180deg, rgba(55,65,81,0.5) 0%, rgba(45,55,72,0.6) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                  {/* 第一行：调整值文案 | 基础值输入 | 豁免文案 */}
                  <div className="col-start-1 row-start-1 flex items-center justify-center min-w-0 border-r border-gray-500 pr-1.5">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">调整值</span>
                  </div>
                  <div className="col-start-2 row-start-1 flex items-center justify-center min-w-0">
                    {canEdit ? (
                      <NumberStepper
                        value={typeof baseScore === 'number' ? baseScore : (parseInt(baseScore, 10) || 10)}
                        onChange={(v) => updateAbility(key, String(Math.max(1, Math.min(30, v))))}
                        min={1}
                        max={30}
                        compact
                      />
                    ) : (
                      <span className="text-sm font-medium font-mono text-white tabular-nums">{baseScore}</span>
                    )}
                  </div>
                  <div className="col-start-3 row-start-1 flex items-center justify-center min-w-0 border-l border-gray-500 pl-1.5">
                    <span className="text-[10px] font-semibold text-dnd-gold-light uppercase tracking-wide leading-tight">豁免</span>
                  </div>
                  {/* 第二行：调整值数字 | 总值（与基础值之间无分割线） | 豁免加值+投掷 */}
                  <div className="col-start-1 row-start-2 flex flex-col items-center justify-center min-w-0 border-r border-gray-500 pr-1.5">
                    <span className="text-[1.75rem] font-bold text-white font-mono tabular-nums leading-none tracking-tight">
                      {mod >= 0 ? '+' : ''}{mod}
                    </span>
                  </div>
                  <div className="col-start-2 row-start-2 flex flex-col items-center justify-center gap-0.5 min-w-0">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide leading-tight">总值</span>
                    <span className="text-sm font-medium font-mono text-white tabular-nums">{effectiveScore}</span>
                  </div>
                  <div className="col-start-3 row-start-2 flex items-center justify-center gap-2.5 min-w-0 pl-1.5 border-l border-gray-500">
                    <span className={`text-[1.75rem] font-bold font-mono tabular-nums leading-none tracking-tight ${saveProfLevel === 'prof' ? 'text-[#D4AF37]' : 'text-white'}`}>
                      {saveBonus >= 0 ? '+' : ''}{saveBonus}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSaveRoll(key)}
                      className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                        rollingId === `save-${key}`
                          ? 'bg-white text-[#E01C2F]'
                          : 'bg-[#E01C2F] hover:bg-[#C41828] text-white'
                      }`}
                      title={`投掷 ${SAVE_NAMES[key]}`}
                    >
                      <Dices className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>

              {/* D. 技能列表 */}
              <div className="flex-1 min-h-0">
                {skillList.length === 0 ? (
                  <div className="px-2 py-1 text-dnd-text-muted text-[10px]">无关联技能</div>
                ) : (
                  <ul className="divide-y divide-gray-700/80">
                    {skillList.map((skill) => {
                      const total = skillMod(skill)
                      const current = skillsState[skill.id] || 'none'
                      const isRolling = rollingId === skill.id

                      return (
                        <li
                          key={skill.id}
                          className={`relative flex items-center gap-2 py-1.5 pr-2 bg-gray-800/50 hover:bg-gray-800/70 transition-colors ${
                            current === 'expertise'
                              ? 'pl-[7px]'
                              : `pl-2 ${getSkillRowLeftBorderClass(current)}`
                          }`}
                        >
                          {current === 'expertise' && (
                            <>
                              <span className="pointer-events-none absolute left-0 top-0 bottom-0 w-px bg-[#D4AF37]" aria-hidden />
                              <span className="pointer-events-none absolute left-px top-0 bottom-0 w-[3px] bg-[#E01C2F]" aria-hidden />
                            </>
                          )}
                          {/* 熟练度：下拉或图标，留足宽度避免与箭头重叠 */}
                          {canEdit ? (
                            <select
                              value={current}
                              onChange={(e) => setSkill(skill.id, e.target.value)}
                              className={`h-5 min-w-[4.5rem] w-14 rounded border border-gray-600 bg-gray-800 text-[10px] pl-1.5 pr-5 font-medium focus:border-dnd-gold-light focus:ring-1 focus:ring-dnd-gold-light ${getSkillRowLabelClass(current)}`}
                            >
                              {SKILL_PROF_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="shrink-0 flex items-center justify-center w-5" title={current}>
                              <ProficiencyIcon level={current} className="w-4 h-4" />
                            </span>
                          )}
                          <span className={`text-xs truncate flex-1 min-w-0 font-medium ${getSkillRowLabelClass(current)}`}>{skill.name}</span>
                          <span className={`font-mono text-xs tabular-nums shrink-0 w-8 text-right font-bold ${getSkillRowLabelClass(current)}`}>
                            {total >= 0 ? '+' : ''}{total}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSkillRoll(skill, total)}
                            className={`shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all duration-200 ${getSkillDiceButtonClass(current, isRolling)}`}
                            title={`投掷 ${skill.name}`}
                          >
                            <Dices
                              className={`w-3 h-3 ${isRolling ? 'animate-dice-roll' : ''}`}
                              aria-hidden
                            />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
