/**
 * 战斗状态（重写版）
 * 显示：HP、AC、先攻、死亡豁免、状态效果、力竭、其它职业资源
 */
import { useState, useEffect } from 'react'
import { Plus, Minus, Trash2, Dices } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
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

const EXHAUSTION_DESC = ['', '1：d20 检定 -2，速度 -5 尺', '2：d20 检定 -4，速度 -10 尺', '3：d20 检定 -6，速度 -15 尺', '4：d20 检定 -8，速度 -20 尺', '5：d20 检定 -10，速度 -25 尺', '6：死亡']
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
  const { openForCheck } = useRoll()
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
  const [tempInputVal, setTempInputVal] = useState('')
  const [conditions, setConditions] = useState(() => Array.isArray(char?.conditions) ? [...char.conditions] : [])
  const [exhaustion, setExhaustion] = useState(() => Math.max(0, Math.min(6, Number(char?.exhaustionLevel) || 0)))
  const [deathSaves, setDeathSaves] = useState(() => normalizeDeathSaves(char?.deathSaves))
  const [classResources, setClassResources] = useState(() => {
    const arr = Array.isArray(char?.classResources) ? char.classResources : []
    return arr.map((r) => ({ id: r.id ?? 'r_' + Math.random().toString(36).slice(2), name: r.name || '—', current: Math.max(0, Number(r.current) ?? 0), max: Math.max(1, Number(r.max) ?? 1) }))
  })
  const [addResourceName, setAddResourceName] = useState('')
  const [addResourceMax, setAddResourceMax] = useState(2)
  const [isAddingResource, setIsAddingResource] = useState(false)

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
    const arr = Array.isArray(char?.classResources) ? char.classResources : []
    setClassResources(arr.map((r) => ({ id: r.id ?? 'r_' + Math.random().toString(36).slice(2), name: r.name || '—', current: Math.max(0, Number(r.current) ?? 0), max: Math.max(1, Number(r.max) ?? 1) })))
  }, [char?.id, char?.classResources])

  useEffect(() => {
    if (hpCurrent > maxHp) setHpCurrent(maxHp)
  }, [maxHp, hpCurrent])

  const saveHp = (c, t) => {
    setHpCurrent(c)
    setHpTemp(t)
    onSave({ hp: { current: c, max: maxHp, temp: t } })
  }

  const handleDeduct = () => {
    const n = parseInt(deductVal, 10)
    if (isNaN(n) || n <= 0) return
    const fromTemp = Math.min(n, hpTemp)
    const fromCur = n - fromTemp
    const newTemp = Math.max(0, hpTemp - fromTemp)
    const newCur = hpCurrent - fromCur
    saveHp(newCur, newTemp)
    setDeductVal('')
  }

  const handleAddTemp = () => {
    const n = parseInt(tempInputVal, 10)
    if (isNaN(n) || n <= 0) return
    saveHp(hpCurrent, hpTemp + n)
    setTempInputVal('')
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

  const saveClassResources = (next) => {
    setClassResources(next)
    onSave({ classResources: next.map((r) => ({ id: r.id, name: r.name, current: r.current, max: r.max })) })
  }

  const addClassResource = () => {
    const name = (addResourceName?.trim() || '未命名')
    const max = Math.max(1, Number(addResourceMax) || 1)
    const next = [...classResources, { id: 'r_' + Date.now(), name, current: max, max }]
    saveClassResources(next)
    setAddResourceName('')
    setAddResourceMax(2)
    setIsAddingResource(false)
  }

  const removeClassResource = (id) => {
    saveClassResources(classResources.filter((r) => r.id !== id))
  }

  const adjustClassResource = (id, delta) => {
    const next = classResources.map((r) => {
      if (r.id !== id) return r
      const cur = Math.max(0, Math.min(r.max, r.current + delta))
      return { ...r, current: cur }
    })
    saveClassResources(next)
  }

  const dexMod = abilityModifier(abilities?.dex ?? 10)
  const init = dexMod + (buffStats?.initBonus ?? 0)
  const perception = 10 + abilityModifier(abilities?.wis ?? 10) + Math.floor(proficiencyBonus(level) * skillProfFactor(char?.skills?.perception || 'none'))
  const speedBase = (char?.speed ?? 30) + (buffStats?.speedBonus ?? 0)
  const speedPenalty = buffStats?.speedExhaustionPenalty ?? 0
  const speed = Math.max(0, Math.floor(speedBase * (buffStats?.speedMultiplier ?? 1)) - speedPenalty)

  const dsResults = deathSaves.results?.length === DEATH_SAVE_COUNT ? deathSaves.results : getDefaultDeathSaves().results
  const deathFailures = dsResults.filter((r) => r === 'failure').length
  const displayCurrent = hpCurrent + hpTemp
  const pct = maxHp > 0 ? (hpCurrent / maxHp) * 100 : 0
  const hasTempHp = hpTemp > 0

  let barColor = 'bg-gray-600'
  if (deathFailures >= 3 || hpCurrent <= -maxHp) {
    barColor = 'bg-gray-500'
  } else if (hasTempHp) {
    barColor = 'bg-blue-600'
  } else if (pct >= 80) {
    barColor = 'bg-green-600'
  } else if (pct >= 50) {
    barColor = 'bg-yellow-600'
  } else if (pct > 0) {
    barColor = 'bg-red-600'
  } else {
    barColor = 'bg-red-900'
  }

  const barWidth = maxHp > 0 ? Math.max(0, Math.min(100, (displayCurrent / maxHp) * 100)) : 0

  return (
    <div className="rounded-xl border border-gray-600 bg-gray-800/30 p-4 space-y-4">
      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
        <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">生命值</h3>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white font-bold text-xl font-mono">
            {displayCurrent} / {maxHp}
            {hasTempHp && <span className="text-blue-400 text-sm font-normal ml-1">（含 {hpTemp} 临时）</span>}
          </span>
        </div>
        <div className="h-4 rounded bg-gray-900 overflow-hidden">
          <div className={`h-full rounded transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        {canEdit && (
          <div className="grid grid-cols-3 gap-3 mt-3">
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
            <div>
              <label className="text-gray-500 text-xs block mb-1">临时血量</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={tempInputVal}
                  onChange={(e) => setTempInputVal(e.target.value)}
                  placeholder="数值"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                  min={0}
                />
                <button type="button" onClick={handleAddTemp} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium">
                  加入
                </button>
                {hpTemp > 0 && (
                  <button type="button" onClick={() => saveHp(hpCurrent, 0)} className="px-3 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-5 min-h-[5rem] flex items-center justify-center gap-3">
          <span className="text-gray-400 text-2xl font-medium">AC</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{acTotal}</span>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-5 min-h-[5rem] flex items-center justify-center gap-3">
          <span className="text-gray-400 text-2xl font-medium">先攻</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{init}</span>
          <button type="button" onClick={() => openForCheck('先攻', init)} title="投掷先攻" className="p-2 rounded bg-dnd-red hover:bg-dnd-red-hover text-white shrink-0">
            <Dices className="w-4 h-4" aria-hidden />
          </button>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-5 min-h-[5rem] flex items-center justify-center gap-3">
          <span className="text-gray-400 text-2xl font-medium">被动察觉</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{perception}</span>
        </div>
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-5 min-h-[5rem] flex items-center justify-center gap-3">
          <span className="text-gray-400 text-2xl font-medium">速度</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{speed} 尺</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3">
          <h3 className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-1.5">状态效果</h3>
          <div className="flex flex-wrap gap-1.5 items-center">
            {canEdit ? (
              <div className="flex flex-col gap-0.5 shrink-0">
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 text-[10px]">力竭</span>
                  <select
                    value={exhaustion}
                    onChange={(e) => setExhaustionLevel(Number(e.target.value))}
                    className={`h-6 px-1.5 rounded border border-gray-600 bg-gray-700 text-[11px] font-medium focus:border-dnd-red focus:ring-1 focus:ring-dnd-red ${getExhaustionColor(exhaustion)}`}
                  >
                    <option value={0}>无</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>等级{n}</option>
                    ))}
                  </select>
                </div>
                {exhaustion > 0 && EXHAUSTION_DESC[exhaustion] && (
                  <span className="text-gray-500 text-[9px]">{EXHAUSTION_DESC[exhaustion]}</span>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 shrink-0">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${exhaustion > 0 ? 'bg-red-900/20 ' + getExhaustionColor(exhaustion) : 'text-gray-400'}`}>
                  力竭 {exhaustion > 0 ? exhaustion : '无'}
                </span>
                {exhaustion > 0 && EXHAUSTION_DESC[exhaustion] && (
                  <span className="text-gray-500 text-[9px]">{EXHAUSTION_DESC[exhaustion]}</span>
                )}
              </div>
            )}
            {conditions.map((c) => (
              <span key={c} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-red-900/40 text-red-200">
                {CONDITION_LABELS[c] ?? c}
                {canEdit && (
                  <button type="button" onClick={() => removeCondition(c)} className="hover:bg-red-800/50 rounded px-0.5">
                    ×
                  </button>
                )}
              </span>
            ))}
            {canEdit && CONDITION_OPTIONS.filter((o) => o.value !== 'exhaustion' && !conditions.includes(o.value)).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => addCondition(o.value)}
                className="px-1.5 py-0.5 rounded text-[10px] border border-gray-600 text-gray-400 hover:bg-gray-700"
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3">
          <h3 className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-1.5">死亡豁免</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {dsResults.map((r, i) => (
                <span
                  key={i}
                  className={`w-5 h-5 rounded-full border flex-shrink-0 ${
                    r === 'success' ? 'bg-emerald-600 border-emerald-500' : r === 'failure' ? 'bg-red-600 border-red-500' : 'bg-gray-700 border-gray-600'
                  }`}
                />
              ))}
            </div>
            {deathSaves.lastRoll != null && (
              <span className="text-gray-500 text-[10px]">d20={deathSaves.lastRoll.roll}</span>
            )}
            <div className="flex gap-1.5">
              <button type="button" onClick={rollDeathSave} title="投掷死亡豁免" className="p-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white">
                <Dices className="w-3.5 h-3.5" aria-hidden />
              </button>
              <button type="button" onClick={resetDeathSaves} className="px-2 py-1 rounded text-[11px] border border-gray-500 text-gray-400">
                重置
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-3">
        <h3 className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-1.5">其它职业资源</h3>
        {canEdit ? (
          <div className="flex flex-wrap gap-2 items-center">
            {classResources.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-800/80 border border-gray-600 shrink-0">
                <span className="text-dnd-text-body text-xs font-medium shrink-0">{r.name}</span>
                <span className="text-white font-mono text-sm tabular-nums shrink-0">{r.current}/{r.max}</span>
                <button type="button" onClick={() => adjustClassResource(r.id, -1)} className="p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="减少">
                  <Minus size={14} />
                </button>
                <button type="button" onClick={() => adjustClassResource(r.id, 1)} className="p-0.5 rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="增加">
                  <Plus size={14} />
                </button>
                <button type="button" onClick={() => removeClassResource(r.id)} className="p-0.5 rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {isAddingResource ? (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-500 shrink-0">
                <input
                  type="text"
                  value={addResourceName}
                  onChange={(e) => setAddResourceName(e.target.value)}
                  placeholder="名称"
                  className={inputClass + ' h-8 flex-1 min-w-[4rem] text-xs'}
                  autoFocus
                />
                <input
                  type="number"
                  min={1}
                  value={addResourceMax}
                  onChange={(e) => setAddResourceMax(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="上限"
                  className={inputClass + ' h-8 w-12 text-xs text-center'}
                />
                <button type="button" onClick={addClassResource} className="h-8 px-2 rounded bg-dnd-red text-white text-xs font-medium hover:bg-dnd-red-hover inline-flex items-center gap-1 shrink-0">
                  保存
                </button>
                <button type="button" onClick={() => { setIsAddingResource(false); setAddResourceName(''); setAddResourceMax(2) }} className="text-gray-400 hover:text-white text-xs">
                  取消
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setIsAddingResource(true)} className="text-white text-xs font-bold uppercase tracking-wider hover:underline">
                + 添加
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {classResources.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-800/80 border border-gray-600">
                <span className="text-dnd-text-body text-xs font-medium shrink-0">{r.name}</span>
                <span className="text-white font-mono text-sm tabular-nums shrink-0">{r.current}/{r.max}</span>
              </div>
            ))}
            {classResources.length === 0 && <span className="text-gray-500 text-xs">—</span>}
          </div>
        )}
      </div>
    </div>
  )
}

