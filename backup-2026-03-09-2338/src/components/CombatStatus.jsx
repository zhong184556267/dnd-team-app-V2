/**
 * 战斗状态（重写版）
 * 显示：HP、AC、先攻、死亡豁免、状态效果、力竭
 */
import { useState, useEffect } from 'react'
import { abilityModifier, proficiencyBonus, getAC, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { skillProfFactor } from '../data/dndSkills'
import { CONDITION_OPTIONS } from '../data/buffTypes'
import { inputClass } from '../lib/inputStyles'

const EXHAUSTION_LEVELS = [0, 1, 2, 3, 4, 5, 6]

function getExhaustionColor(level) {
  if (level <= 0) return 'text-gray-400'
  const colors = ['text-red-400', 'text-red-500', 'text-red-600', 'text-red-700', 'text-red-800', 'text-red-900']
  return colors[Math.min(level - 1, 5)] ?? 'text-red-900'
}
const DEATH_SAVE_COUNT = 6

function getDefaultDeathSaves() {
  return { results: Array(DEATH_SAVE_COUNT).fill(null), lastRoll: null }
}

function normalizeDeathSaves(ds) {
  if (!ds) return getDefaultDeathSaves()
  if (Array.isArray(ds.results) && ds.results.length >= DEATH_SAVE_COUNT) {
    const results = ds.results.slice(0, DEATH_SAVE_COUNT).map((r) =>
      r === 'success' || r === 'failure' ? r : null
    )
    return { results, lastRoll: ds.lastRoll ?? null }
  }
  const s = Math.min(3, Number(ds.success) || 0)
  const f = Math.min(3, Number(ds.failure) || 0)
  const results = [
    ...Array(s).fill('success'),
    ...Array(f).fill('failure'),
    ...Array(DEATH_SAVE_COUNT - s - f).fill(null),
  ].slice(0, DEATH_SAVE_COUNT)
  return { results, lastRoll: ds.lastRoll ?? null }
}

const CONDITION_LABELS = Object.fromEntries(
  CONDITION_OPTIONS.filter((o) => o.value !== 'exhaustion').map((o) => [o.value, o.label])
)

export default function CombatStatus({ char, hp, abilities, level, canEdit, onSave }) {
  const buffStats = useBuffCalculator(char, char?.buffs)
  const acResult = getAC(char)
  const acTotal = acResult.total + (buffStats?.acBonus ?? 0)
  const maxHpBase = calcMaxHP(char) + getHPBuffSum(char) + (buffStats?.maxHpBonus ?? 0)
  const maxHpMult = buffStats?.maxHpMultiplier ?? 1
  const maxHp = Math.max(1, Math.floor(maxHpBase * maxHpMult))

  const [hpCurrent, setHpCurrent] = useState(hp?.current ?? 0)
  const [hpTemp, setHpTemp] = useState(hp?.temp ?? 0)
  const [deductVal, setDeductVal] = useState('')
  const [healVal, setHealVal] = useState('')
  const [conditions, setConditions] = useState(() => Array.isArray(char?.conditions) ? [...char.conditions] : [])
  const [exhaustion, setExhaustion] = useState(() => Math.max(0, Math.min(6, Number(char?.exhaustionLevel) || 0)))
  const [deathSaves, setDeathSaves] = useState(() => normalizeDeathSaves(char?.deathSaves))

  useEffect(() => {
    setHpCurrent(hp?.current ?? 0)
    setHpTemp(hp?.temp ?? 0)
  }, [hp?.current, hp?.temp])

  useEffect(() => {
    setConditions(Array.isArray(char?.conditions) ? [...char.conditions] : [])
  }, [char?.id, char?.conditions])

  useEffect(() => {
    setExhaustion(Math.max(0, Math.min(6, Number(char?.exhaustionLevel) || 0)))
  }, [char?.id, char?.exhaustionLevel])

  useEffect(() => {
    setDeathSaves(normalizeDeathSaves(char?.deathSaves))
  }, [char?.id, char?.deathSaves])

  useEffect(() => {
    if (hpCurrent > maxHp) setHpCurrent(maxHp)
  }, [maxHp, hpCurrent])

  const saveHp = (c, t) => {
    const clamped = Math.max(0, Math.min(maxHp, c))
    setHpCurrent(clamped)
    setHpTemp(t)
    onSave({ hp: { current: clamped, max: maxHp, temp: t } })
  }

  const handleDeduct = () => {
    const n = parseInt(deductVal, 10)
    if (isNaN(n) || n <= 0) return
    const effTemp = Math.max(hpTemp, buffStats?.tempHp ?? 0)
    const fromTemp = Math.min(n, effTemp)
    const fromCur = n - fromTemp
    saveHp(Math.max(0, hpCurrent - fromCur), Math.max(0, effTemp - fromTemp))
    setDeductVal('')
  }

  const handleHeal = () => {
    const n = parseInt(healVal, 10)
    if (isNaN(n)) return
    saveHp(Math.min(maxHp, hpCurrent + n), hpTemp)
    setHealVal('')
  }

  const addCondition = (val) => {
    if (conditions.includes(val)) return
    const next = [...conditions, val]
    setConditions(next)
    onSave({ conditions: next })
  }

  const removeCondition = (val) => {
    const next = conditions.filter((c) => c !== val)
    setConditions(next)
    onSave({ conditions: next })
  }

  const setExhaustionLevel = (n) => {
    const v = Math.max(0, Math.min(6, Number(n) || 0))
    setExhaustion(v)
    onSave({ exhaustionLevel: v })
  }

  const rollDeathSave = () => {
    const results = [...(deathSaves.results ?? getDefaultDeathSaves().results)]
    const emptyIdx = results.findIndex((r) => r == null)
    if (emptyIdx < 0) return
    const roll = Math.floor(Math.random() * 20) + 1
    let isCrit = false
    let isFumble = false
    if (roll === 20) {
      results[emptyIdx] = 'success'
      if (emptyIdx + 1 < results.length) results[emptyIdx + 1] = 'success'
      isCrit = true
    } else if (roll === 1) {
      results[emptyIdx] = 'failure'
      if (emptyIdx + 1 < results.length) results[emptyIdx + 1] = 'failure'
      isFumble = true
    } else {
      results[emptyIdx] = roll >= 10 ? 'success' : 'failure'
    }
    const next = { results, lastRoll: { roll, isCritical: isCrit, isFumble } }
    setDeathSaves(next)
    onSave({ deathSaves: next })
  }

  const resetDeathSaves = () => {
    const next = getDefaultDeathSaves()
    setDeathSaves(next)
    onSave({ deathSaves: next })
  }

  const dexMod = abilityModifier(abilities?.dex ?? 10)
  const init = dexMod + (buffStats?.initBonus ?? 0)
  const perception = 10 + abilityModifier(abilities?.wis ?? 10) + Math.floor(proficiencyBonus(level) * skillProfFactor(char?.skills?.perception || 'none'))
  const speedBase = (char?.speed ?? 30) + (buffStats?.speedBonus ?? 0)
  const speedPenalty = buffStats?.speedExhaustionPenalty ?? 0
  const speed = Math.max(0, Math.floor(speedBase * (buffStats?.speedMultiplier ?? 1)) - speedPenalty)

  const dsResults = deathSaves.results?.length === DEATH_SAVE_COUNT ? deathSaves.results : getDefaultDeathSaves().results
  const pct = maxHp > 0 ? Math.min(100, (hpCurrent / maxHp) * 100) : 0
  const barColor = pct > 50 ? 'bg-green-600' : pct > 25 ? 'bg-yellow-600' : 'bg-red-600'

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
        <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">生命值</h3>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white font-bold text-xl font-mono">
            {hpCurrent} / {maxHp}
          </span>
          {hpTemp > 0 && (
            <span className="text-blue-400 text-sm">+{hpTemp} 临时</span>
          )}
        </div>
        <div className="h-4 rounded bg-gray-900 overflow-hidden">
          <div className={`h-full rounded transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        {canEdit && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-gray-500 text-xs block mb-1">扣除伤害</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={deductVal}
                  onChange={(e) => setDeductVal(e.target.value)}
                  placeholder="数值"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                />
                <button type="button" onClick={handleDeduct} className="px-3 py-1.5 rounded bg-dnd-red text-white text-sm font-medium">
                  扣除
                </button>
              </div>
            </div>
            <div>
              <label className="text-gray-500 text-xs block mb-1">恢复</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={healVal}
                  onChange={(e) => setHealVal(e.target.value)}
                  placeholder="数值"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                />
                <button type="button" onClick={handleHeal} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-medium">
                  恢复
                </button>
                <button type="button" onClick={() => saveHp(maxHp, hpTemp)} className="px-3 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">
                  满血
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3 flex items-center justify-center gap-2">
          <span className="text-gray-400 text-base font-medium">AC</span>
          <span className="text-gray-600">|</span>
          <span className="text-white font-bold text-xl font-mono">{acTotal}</span>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3 flex items-center justify-center gap-2">
          <span className="text-gray-400 text-base font-medium">先攻</span>
          <span className="text-gray-600">|</span>
          <span className="text-white font-bold text-xl font-mono">{init}</span>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3 flex items-center justify-center gap-2">
          <span className="text-gray-400 text-base font-medium">被动察觉</span>
          <span className="text-gray-600">|</span>
          <span className="text-white font-bold text-xl font-mono">{perception}</span>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3 flex items-center justify-center gap-2">
          <span className="text-gray-400 text-base font-medium">速度</span>
          <span className="text-gray-600">|</span>
          <span className="text-white font-bold text-xl font-mono">{speed} 尺</span>
        </div>
      </div>

      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
        <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">状态效果</h3>
        <div className="flex flex-wrap gap-2 items-center">
          {canEdit ? (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs shrink-0">力竭</span>
              <select
                value={exhaustion}
                onChange={(e) => setExhaustionLevel(Number(e.target.value))}
                className={`h-8 px-2 rounded border border-gray-600 bg-gray-700 text-sm font-medium focus:border-dnd-red focus:ring-1 focus:ring-dnd-red ${getExhaustionColor(exhaustion)}`}
              >
                <option value={0}>无</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>等级{n}</option>
                ))}
              </select>
            </div>
          ) : (
            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${exhaustion > 0 ? 'bg-red-900/20 ' + getExhaustionColor(exhaustion) : 'text-gray-400'}`}>
              力竭 {exhaustion > 0 ? exhaustion : '无'}
            </span>
          )}
          {conditions.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-900/40 text-red-200">
              {CONDITION_LABELS[c] ?? c}
              {canEdit && (
                <button type="button" onClick={() => removeCondition(c)} className="hover:bg-red-800/50 rounded px-0.5">
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="mt-2 flex flex-wrap gap-1">
            {CONDITION_OPTIONS.filter((o) => o.value !== 'exhaustion' && !conditions.includes(o.value)).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => addCondition(o.value)}
                className="px-2 py-1 rounded text-xs border border-gray-600 text-gray-400 hover:bg-gray-700"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
        <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">死亡豁免</h3>
        <div className="flex gap-2 mb-2">
          {dsResults.map((r, i) => (
            <span
              key={i}
              className={`w-6 h-6 rounded-full border-2 flex-shrink-0 ${
                r === 'success' ? 'bg-emerald-600 border-emerald-500' : r === 'failure' ? 'bg-red-600 border-red-500' : 'bg-gray-700 border-gray-600'
              }`}
            />
          ))}
        </div>
        {deathSaves.lastRoll != null && (
          <p className="text-gray-500 text-xs mb-2">d20={deathSaves.lastRoll.roll}</p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={rollDeathSave} className="px-3 py-1.5 rounded bg-dnd-red text-white text-sm">
            投掷
          </button>
          <button type="button" onClick={resetDeathSaves} className="px-3 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">
            重置
          </button>
        </div>
      </div>
    </div>
  )
}
