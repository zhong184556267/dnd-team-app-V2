import { useState, useEffect, useRef } from 'react'
import { abilityModifier, proficiencyBonus, getAC, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { skillProfFactor } from '../data/dndSkills'

/** 属性卡片：icon + 标签，value 为主数值（粗体），深色 RPG 风 */
function StatCard({ label, value, icon, unit }) {
  const displayValue = unit != null && unit !== '' ? `${value} ${unit}` : String(value)

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 flex items-center justify-between border border-white">
      <div className="flex items-center gap-2">
        {icon && <span className="text-4xl" aria-hidden>{icon}</span>}
        <span className="text-gray-400 text-2xl">{label}</span>
      </div>
      <div className="text-white font-bold text-3xl font-mono tabular-nums">
        {displayValue}
      </div>
    </div>
  )
}

export default function CombatStatus({ char, hp, abilities, level, canEdit, onSave }) {
  const buffStats = useBuffCalculator(char, char?.buffs)
  const ac = getAC(char)
  const acBase = ac.total + (buffStats?.acBonus ?? 0)
  const computedMax = calcMaxHP(char) + getHPBuffSum(char) + (buffStats?.maxHpBonus ?? 0)
  const maxHp = Math.max(1, computedMax)
  const [hpCurrent, setHpCurrent] = useState(hp.current ?? 0)
  const [hpTemp, setHpTemp] = useState(hp.temp ?? 0)
  const [deduct, setDeduct] = useState('')
  const [heal, setHeal] = useState('')
  const appliedBuffTempRef = useRef(false)

  const tempHpDisplay = hpTemp

  useEffect(() => {
    setHpCurrent(hp.current ?? 0)
    setHpTemp(hp.temp ?? 0)
  }, [hp.current, hp.temp])
  useEffect(() => {
    if (hpCurrent > maxHp) setHpCurrent(maxHp)
  }, [maxHp])
  useEffect(() => {
    if ((buffStats?.tempHp ?? 0) === 0) appliedBuffTempRef.current = false
    else if (!appliedBuffTempRef.current && (hp.temp ?? 0) === 0) {
      appliedBuffTempRef.current = true
      const newTemp = buffStats.tempHp
      onSave({ hp: { ...hp, current: hp.current ?? 0, max: maxHp, temp: newTemp } })
      setHpTemp(newTemp)
    }
  }, [buffStats?.tempHp, hp.temp])

  const persistHp = (c, t) => {
    const clamped = Math.max(0, Math.min(maxHp, c))
    setHpCurrent(clamped)
    setHpTemp(t)
    onSave({ hp: { current: clamped, max: maxHp, temp: t } })
  }

  const handleDeduct = () => {
    const n = parseInt(deduct, 10)
    if (isNaN(n) || n <= 0) return
    const effectiveTemp = Math.max(hpTemp, buffStats?.tempHp ?? 0)
    const fromTemp = Math.min(n, effectiveTemp)
    const fromCurrent = n - fromTemp
    const newTemp = Math.max(0, effectiveTemp - fromTemp)
    const newCurrent = Math.max(0, hpCurrent - fromCurrent)
    persistHp(newCurrent, newTemp)
    setDeduct('')
  }

  const handleHeal = () => {
    const n = parseInt(heal, 10)
    if (isNaN(n)) return
    persistHp(Math.min(maxHp, hpCurrent + n), hpTemp)
    setHeal('')
  }

  const handleFullHeal = () => {
    persistHp(maxHp, hpTemp)
    setHeal('')
  }

  const pct = Math.max(0, Math.min(100, maxHp > 0 ? (hpCurrent / maxHp) * 100 : 0))
  const hpBarColor = pct > 50 ? 'bg-green-600' : pct > 25 ? 'bg-yellow-600' : 'bg-red-600'
  const tempPct = maxHp > 0 ? Math.min(100, (tempHpDisplay / maxHp) * 100) : 0
  const cumulativeDamage = maxHp - hpCurrent

  const acSubtext = [
    ac.base,
    ac.dexContrib !== 0 && (ac.dexContrib >= 0 ? `+${ac.dexContrib}(敏)` : `−${-ac.dexContrib}(敏)`),
    ac.shield > 0 && `+${ac.shield}(盾)`,
    ac.other > 0 && `+${ac.other}`,
    ac.buff > 0 && `+${ac.buff}`,
    (buffStats?.acBonus ?? 0) !== 0 && `+${buffStats.acBonus}(Buff)`,
  ]
    .filter(Boolean)
    .join(' ')

  const initComputed = abilityModifier(abilities?.dex ?? 10) + (buffStats?.initBonus ?? 0)
  const perceptionComputed = 10 + abilityModifier(abilities?.wis ?? 10) + Math.floor(proficiencyBonus(level) * skillProfFactor(char?.skills?.perception || 'none'))
  const speedComputed = (char?.speed ?? 30) + (buffStats?.speedBonus ?? 0)
  const saveDcComputed = 8 + Math.max(
    abilityModifier(abilities?.int ?? 10),
    abilityModifier(abilities?.wis ?? 10),
    abilityModifier(abilities?.cha ?? 10)
  ) + proficiencyBonus(level) + (buffStats?.saveDcBonus ?? 0)

  const initMod = initComputed
  const totalInit = initMod
  const acMod = buffStats?.acBonus ?? 0
  const totalAC = acBase
  const perceptionMod = abilityModifier(abilities?.wis ?? 10) + Math.floor(proficiencyBonus(level) * skillProfFactor(char?.skills?.perception || 'none'))
  const totalPerception = perceptionComputed
  const speedMod = buffStats?.speedBonus ?? 0
  const totalSpeed = speedComputed
  const saveDCMod = buffStats?.saveDcBonus ?? 0
  const totalSaveDC = saveDcComputed

  return (
    <div className="space-y-6">
      {/* 生命值区域 */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-center mb-2">
          <span className="text-white font-bold text-xl">{hpCurrent}/{maxHp + tempHpDisplay}（{tempHpDisplay}）</span>
          <span className="text-gray-400 text-sm ml-1">现有/满血（临时）</span>
        </div>
        <div className="relative h-6 rounded-lg bg-black/40 overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-lg transition-all duration-300 ${hpBarColor}`}
            style={{ width: `${pct}%` }}
          />
          {tempPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-lg bg-blue-500/50 pointer-events-none"
              style={{ width: `${tempPct}%` }}
            />
          )}
        </div>
        <p className="text-gray-500 text-xs text-center mt-2">
          上限: {maxHp} | 临时: {tempHpDisplay}（在上限之上，不叠加取最高；扣伤先扣临时）
        </p>
        {cumulativeDamage > 0 && (
          <p className="text-gray-500 text-xs text-center">累计伤害: {cumulativeDamage}</p>
        )}

        {canEdit && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1 block">一键扣除 X 点</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={deduct}
                  onChange={(e) => setDeduct(e.target.value)}
                  placeholder="伤害值"
                  className="flex-1 h-9 rounded bg-gray-900 border border-gray-600 text-white text-sm px-2 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red placeholder:text-gray-500"
                />
                <button
                  type="button"
                  onClick={handleDeduct}
                  className="px-3 py-1 rounded font-bold text-sm bg-dnd-red hover:bg-dnd-red-hover text-white transition-transform hover:scale-105"
                >
                  扣除
                </button>
              </div>
            </div>
            <div>
              <label className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1 block">恢复 Y 点</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={heal}
                  onChange={(e) => setHeal(e.target.value)}
                  placeholder="恢复值"
                  className="flex-1 h-9 rounded bg-gray-900 border border-gray-600 text-white text-sm px-2 focus:border-green-500 focus:ring-1 focus:ring-green-500 placeholder:text-gray-500"
                />
                <button
                  type="button"
                  onClick={handleHeal}
                  className="px-3 py-1 rounded font-bold text-sm bg-green-600 hover:bg-green-500 text-white transition-transform hover:scale-105"
                >
                  恢复
                </button>
                <button
                  type="button"
                  onClick={handleFullHeal}
                  className="px-3 py-1 rounded font-bold text-sm bg-green-700 hover:bg-green-600 text-white transition-transform hover:scale-105 whitespace-nowrap"
                >
                  恢复上限
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 关键属性网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <StatCard label="先攻" value={totalInit} icon="⚡" />
        <StatCard label="AC" value={totalAC} icon="🛡️" />
        <StatCard label="被动察觉" value={totalPerception} icon="👁️" />
        <StatCard label="移动速度" value={totalSpeed} unit="尺" icon="👟" />
        <StatCard label="豁免 DC" value={totalSaveDC} icon="🌀" />
      </div>
      {(buffStats?.reachBonus ?? 0) > 0 && (
        <p className="text-gray-500 text-xs text-center mt-2">
          触及：5 + {buffStats.reachBonus} 尺
        </p>
      )}
    </div>
  )
}
