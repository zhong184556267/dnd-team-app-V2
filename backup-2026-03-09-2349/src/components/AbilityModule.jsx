import { useState, useMemo, useCallback } from 'react'
import { Dices, Circle, Shield, ShieldHalf } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
import { abilityModifier, proficiencyBonus } from '../lib/characterStore'
import { SAVE_NAMES, SKILLS, SKILL_PROF_OPTIONS, skillProfFactor } from '../data/dndSkills'

const ABILITY_NAMES_ZH = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/**
 * 根据熟练度等级返回文字颜色类名（写死完整类名，避免 Tailwind  purge 掉）
 * expertise=精通(暗金+光晕), prof=熟练(红), half=半熟练(天蓝), none=无(灰)
 */
function getProficiencyColor(level) {
  switch (level) {
    case 'expertise':
      return 'text-[#A67C2D] drop-shadow-[0_0_5px_rgba(166,124,45,0.42)]'
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
      return 'text-[#A67C2D] drop-shadow-[0_0_5px_rgba(166,124,45,0.42)]'
    default:
      return 'text-gray-500'
  }
}

/** 技能行左边框颜色，与熟练度一致 */
function getProficiencyBorderClass(level) {
  switch (level) {
    case 'expertise':
      return 'border-l-[3px] border-l-[#A67C2D]'
    case 'prof':
      return 'border-l-[3px] border-l-[#E01C2F]'
    case 'half':
      return 'border-l-[3px] border-l-[#38BDF8]'
    default:
      return 'border-l-[3px] border-l-gray-500'
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
  const prof = proficiencyBonus(level ?? 1)
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
    <div className="space-y-2">
      <div className="flex items-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-800 border border-dnd-gold/50 text-dnd-gold-light font-mono font-bold text-base">
          熟练值 +{prof}
        </span>
      </div>

      <div className="grid grid-cols-2 max-[400px]:grid-cols-1 gap-2">
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
              className={`rounded-xl overflow-hidden bg-dnd-card border shadow-dnd-card flex flex-col min-w-0 transition-colors ${saveProfLevel === 'prof' ? 'border-[#A67C2D]' : 'border-gray-500'}`}
            >
              {/* A. 顶部栏：属性名 + 熟练按钮在名称右侧 */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-700 min-h-[2rem]">
                <span className="text-base font-bold text-white font-sans">{ABILITY_NAMES_ZH[key]}</span>
                <span className={`text-[10px] font-medium ${saveProfLevel === 'prof' ? 'text-[#C79A42]' : 'text-gray-500'}`}>
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

              {/* B. 核心区：调整值 + 豁免值 */}
              <div className="px-2 py-1.5">
                <div className={`rounded-lg py-2 px-3 flex justify-around items-center gap-2 bg-gray-800/50 border ${saveProfLevel === 'prof' ? 'border-[#A67C2D]' : 'border-gray-500'}`}>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400">调整值</span>
                    <span className="text-2xl font-bold text-white font-mono tabular-nums leading-none">
                      {mod >= 0 ? '+' : ''}{mod}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-gray-500">基础值</span>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={baseScore}
                        onChange={(e) => updateAbility(key, e.target.value)}
                        className="w-12 h-8 rounded border border-gray-500 bg-gray-700 text-white text-center font-mono text-sm focus:border-dnd-gold-light focus:ring-1 focus:ring-dnd-gold-light/50 focus:outline-none mt-0.5"
                      />
                    </div>
                  )}
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-500">属性总值</span>
                    <span className="text-lg font-mono font-semibold text-white h-8 flex items-center mt-0.5">{effectiveScore}</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] text-dnd-gold-light font-semibold">豁免</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-2xl font-bold font-mono tabular-nums leading-none ${saveProfLevel === 'prof' ? 'text-[#C79A42]' : 'text-white'}`}>
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
                          className={`flex items-center gap-1.5 px-2 py-1 bg-gray-800/50 hover:bg-gray-800/70 transition-colors ${getProficiencyBorderClass(current)}`}
                        >
                          {/* 熟练度标记：竖线/图标 + 可选下拉 */}
                          {canEdit ? (
                            <select
                              value={current}
                              onChange={(e) => setSkill(skill.id, e.target.value)}
                              className="h-5 min-w-0 w-12 rounded border border-gray-600 bg-gray-800 text-gray-300 text-[10px] px-0.5 focus:border-dnd-gold-light focus:ring-1 focus:ring-dnd-gold-light"
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
                          <span className="text-gray-300 text-xs truncate flex-1 min-w-0">{skill.name}</span>
                          <span className={`font-mono text-xs tabular-nums shrink-0 w-6 text-right font-bold ${getProficiencyColor(current)}`}>
                            {total >= 0 ? '+' : ''}{total}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSkillRoll(skill, total)}
                            className={`shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all duration-200 ${
                              isRolling
                                ? 'bg-white text-dnd-red scale-110'
                                : 'bg-dnd-red hover:bg-dnd-red-hover text-white'
                            }`}
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
