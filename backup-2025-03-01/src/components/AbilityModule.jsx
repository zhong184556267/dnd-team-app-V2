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

/** 技能行左边框颜色，与熟练度一致 */
function getProficiencyBorderClass(level) {
  switch (level) {
    case 'expertise':
      return 'border-l-[3px] border-l-[#B8860B]'
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

      <div className="grid grid-cols-3 max-[500px]:grid-cols-2 gap-2">
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
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-700 min-h-[2rem]">
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

              {/* B. 核心区：2×3 网格，调整值/豁免各占两行高；格子内轻质感 */}
              <div className="px-2 py-1">
                <div className={`rounded-lg py-1.5 px-2 grid grid-cols-3 grid-rows-2 gap-0 min-w-0 border ${saveProfLevel === 'prof' ? 'border-[#B8860B]' : 'border-gray-500'}`} style={{ background: 'linear-gradient(180deg, rgba(55,65,81,0.5) 0%, rgba(45,55,72,0.6) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                  {/* 左列第1列：调整值 +0，占两行 */}
                  <div className="col-start-1 row-span-2 flex items-center justify-center gap-1 min-w-0 pr-1 border-r border-gray-500">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">调整值</span>
                    <span className="text-[1.35rem] font-bold text-white font-mono tabular-nums leading-none whitespace-nowrap">
                      {mod >= 0 ? '+' : ''}{mod}
                    </span>
                  </div>
                  {/* 中列第2列上：基础 10，居中，数值与下行垂直对齐、字号正常 */}
                  <div className="col-start-2 row-start-1 flex items-center justify-center gap-1 min-w-0 px-1 border-r border-gray-500">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-9 text-left">基础</span>
                    {canEdit ? (
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={baseScore}
                        onChange={(e) => updateAbility(key, e.target.value)}
                        className="w-10 h-6 rounded border border-gray-500 bg-gray-700/80 text-white text-center font-mono text-sm font-medium focus:border-dnd-gold-light focus:ring-1 focus:ring-dnd-gold-light/50 focus:outline-none"
                      />
                    ) : (
                      <span className="w-10 text-sm font-medium font-mono text-white tabular-nums text-center">{baseScore}</span>
                    )}
                  </div>
                  {/* 中列第2列下：总值 10，居中，数值与上行垂直对齐、字号正常 */}
                  <div className="col-start-2 row-start-2 flex items-center justify-center gap-1 min-w-0 px-1 border-r border-gray-500">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-9 text-left">总值</span>
                    <span className="w-10 text-sm font-medium font-mono text-white tabular-nums text-center">{effectiveScore}</span>
                  </div>
                  {/* 右列第3列：豁免 +0 按钮右对齐，占两行，与其它卡片按钮垂直对齐 */}
                  <div className="col-start-3 row-span-2 flex items-center justify-end gap-1.5 min-w-0 pl-1">
                    <span className="text-xs font-semibold text-dnd-gold-light uppercase tracking-wide shrink-0">豁免</span>
                    <span className={`text-[1.35rem] font-bold font-mono tabular-nums leading-none whitespace-nowrap ${saveProfLevel === 'prof' ? 'text-[#D4AF37]' : 'text-white'}`}>
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
                          <span className={`font-mono text-xs tabular-nums shrink-0 w-7 text-right font-bold ${getProficiencyColor(current)}`}>
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
