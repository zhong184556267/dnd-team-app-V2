import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, User, BookOpen, Package, MoreHorizontal } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { useRoll } from '../contexts/RollContext'
import { getDefaultCharacterId, getLastEditedCharacterId } from '../lib/characterStore'

const tabs = [
  { key: 'home', to: '/', label: '首页', icon: Home },
  { key: 'characters', to: '/characters', label: '我的角色', icon: User, useLastEdited: true },
  { key: 'spells', to: '/character-spells', label: '角色法术', icon: BookOpen, useLastEditedForSpells: true },
  { key: 'warehouse', to: '/warehouse', label: '团队仓库', icon: Package },
  { key: 'more', to: '/more', label: '更多', icon: MoreHorizontal },
]

const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100]

function roll(sides) {
  return Math.floor(Math.random() * sides) + 1
}

function rollD20WithMode(mode) {
  if (mode === 'normal') {
    const r = roll(20)
    return { result: r, rolls: [r] }
  }
  const a = roll(20)
  const b = roll(20)
  if (mode === 'advantage') return { result: Math.max(a, b), rolls: [a, b] }
  return { result: Math.min(a, b), rolls: [a, b] }
}

function parseFormulaSegment(rawSegment) {
  const s = String(rawSegment || '').trim().replace(/\s+/g, '')
  if (!s) return null
  const dice = /^(\d+)[dD](\d+)([+-]\d+)?$/.exec(s)
  if (dice) {
    const count = Number.parseInt(dice[1], 10)
    const sides = Number.parseInt(dice[2], 10)
    const modifier = dice[3] ? Number.parseInt(dice[3], 10) : 0
    if (!Number.isFinite(count) || !Number.isFinite(sides) || !Number.isFinite(modifier)) return null
    if (count < 1 || count > 100) return null
    if (sides < 2 || sides > 1000) return null
    return { kind: 'dice', count, sides, modifier, raw: s }
  }
  const flat = /^[+-]?\d+$/.exec(s)
  if (flat) {
    const value = Number.parseInt(s, 10)
    if (!Number.isFinite(value)) return null
    return { kind: 'flat', value, raw: s }
  }
  return null
}

function parseFormula(raw) {
  const normalized = String(raw || '').replace(/，/g, ',')
  const parts = normalized.split(',').map((p) => p.trim())
  if (!parts.length) return null
  const segments = []
  for (const p of parts) {
    const seg = parseFormulaSegment(p)
    if (!seg) return null
    segments.push(seg)
  }
  return segments
}

/**
 * 高亮检定明细中的自然20（如 D20(20,4)+12=32）。
 * 仅高亮 d20 掷出的 20，不影响其它骰型/总值。
 */
function renderDetailsWithNat20Highlight(text) {
  const src = String(text || '')
  if (!src) return null
  const re = /([dD]20)\(([^)]*)\)/g
  const nodes = []
  let last = 0
  let m
  let key = 0
  while ((m = re.exec(src)) !== null) {
    const start = m.index
    const end = re.lastIndex
    if (start > last) nodes.push(<span key={`t-${key++}`}>{src.slice(last, start)}</span>)
    const tag = m[1]
    const body = m[2]
    const parts = body.split(',')
    nodes.push(<span key={`tag-${key++}`}>{tag}(</span>)
    parts.forEach((p, i) => {
      const raw = p.trim()
      const n = Number(raw)
      const isNat20 = Number.isFinite(n) && n === 20
      nodes.push(
        <span key={`r-${key++}`} className={isNat20 ? 'font-bold text-dnd-red' : ''}>
          {raw}
        </span>
      )
      if (i < parts.length - 1) nodes.push(<span key={`c-${key++}`}>,</span>)
    })
    nodes.push(<span key={`e-${key++}`}>)</span>)
    last = end
  }
  if (last < src.length) nodes.push(<span key={`tail-${key++}`}>{src.slice(last)}</span>)
  return nodes.length ? nodes : src
}

export default function BottomNav() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const { pendingCheck } = useRoll()
  const defaultId = getDefaultCharacterId(user?.name, currentModuleId)
  const lastEditedId = getLastEditedCharacterId(user?.name, isAdmin, currentModuleId)
  const preferredId = defaultId || lastEditedId
  const [d20Mode, setD20Mode] = useState('')
  const [formula, setFormula] = useState('1d20')
  const [formulaError, setFormulaError] = useState('')
  const [formulaMeta, setFormulaMeta] = useState(null) // { label, mode }
  const formulaInputRef = useRef(null)
  const [lastRoll, setLastRoll] = useState(null)
  const [checkResult, setCheckResult] = useState(null)
  const [rollHistory, setRollHistory] = useState([])
  const total = rollHistory.reduce((s, n) => s + n, 0)

  const runQuickCheckRoll = useCallback((label, modifier, modeRaw) => {
    const mode = modeRaw || 'normal'
    const mod = Number(modifier) || 0
    const { result, rolls } = rollD20WithMode(mode)
    const totalValue = result + mod
    const formula = `1d20${mod >= 0 ? '+' : ''}${mod}`
    setLastRoll({
      key: Date.now(),
      label,
      result: totalValue,
    })
    setCheckResult({
      key: Date.now(),
      label,
      formula,
      mode,
      total: totalValue,
      details: `D20(${rolls.join(',')})${mod >= 0 ? '+' : ''}${mod}=${totalValue}`,
    })
    setRollHistory((prev) => [...prev, totalValue])
  }, [])

  useEffect(() => {
    if (!pendingCheck) return
    const mod = Number(pendingCheck.modifier) || 0
    const nextFormula = `1d20${mod >= 0 ? '+' : ''}${mod}`
    setFormula(nextFormula)
    setFormulaMeta((prev) => ({ label: pendingCheck.label, mode: pendingCheck.advantage ?? prev?.mode ?? d20Mode ?? '' }))
    setFormulaError('')
    if (pendingCheck.quickRoll) {
      runQuickCheckRoll(pendingCheck.label, mod, pendingCheck.advantage ?? d20Mode ?? '')
      return
    }
    requestAnimationFrame(() => {
      const el = formulaInputRef.current
      if (!el) return
      el.focus()
      el.value = nextFormula
      const pos = nextFormula.length
      el.setSelectionRange(pos, pos)
    })
  }, [pendingCheck, d20Mode, runQuickCheckRoll])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onExternalRoll = (ev) => {
      const detail = ev?.detail
      if (!detail) return
      if (detail.byType && typeof detail.byType === 'object') {
        const entries = Object.entries(detail.byType)
        if (!entries.length) return
        const detailParts = []
        let totalValue = 0
        for (const [type, row] of entries) {
          const rolls = Array.isArray(row?.rolls) ? row.rolls : []
          const mod = Number(row?.modifier) || 0
          const subtotal = rolls.reduce((s, n) => s + (Number(n) || 0), 0) + mod
          totalValue += subtotal
          detailParts.push(`${type}:${rolls.join(',')}${mod ? `${mod >= 0 ? '+' : ''}${mod}` : ''}=${subtotal}`)
        }
        setLastRoll({
          key: Date.now(),
          label: '伤害',
          result: totalValue,
        })
        setCheckResult({
          key: Date.now(),
          label: '伤害投掷',
          formula: detailParts.join(' ; '),
          mode: 'normal',
          total: totalValue,
          details: detailParts.join(' ; '),
        })
        setRollHistory((prev) => [...prev, totalValue])
        return
      }
      const totalValue = Number(detail.total)
      if (!Number.isFinite(totalValue)) return
      const diceExpr = detail.dice || detail.label || '伤害'
      const mod = Number(detail.modifier) || 0
      const rolls = Array.isArray(detail.rolls) ? detail.rolls : []
      setLastRoll({
        key: Date.now(),
        label: detail.label || diceExpr,
        result: totalValue,
      })
      setCheckResult({
        key: Date.now(),
        label: detail.label || '伤害投掷',
        formula: diceExpr,
        mode: 'normal',
        total: totalValue,
        details: `${diceExpr}${rolls.length ? `(${rolls.join(',')})` : ''}${mod ? `${mod >= 0 ? '+' : ''}${mod}` : ''}=${totalValue}`,
      })
      setRollHistory((prev) => [...prev, totalValue])
    }
    window.addEventListener('dnd-external-roll', onExternalRoll)
    return () => window.removeEventListener('dnd-external-roll', onExternalRoll)
  }, [])

  const getLinkTo = (tab) => {
    if (tab.useLastEdited && preferredId) return `/characters/${preferredId}`
    if (tab.useLastEditedForSpells && preferredId) return `/character-spells?char=${preferredId}`
    return tab.to
  }

  const appendDie = useCallback((sides) => {
    const raw = String(formula || '').replace(/，/g, ',')
    const sepIndex = raw.lastIndexOf(',')
    const prefix = sepIndex >= 0 ? raw.slice(0, sepIndex + 1) : ''
    const tail = sepIndex >= 0 ? raw.slice(sepIndex + 1) : raw
    const parsedTail = parseFormulaSegment(tail)
    if (parsedTail?.kind === 'dice') {
      const nextCount = parsedTail.sides === sides ? Math.min(100, parsedTail.count + 1) : 1
      const nextTail = `${nextCount}d${sides}${parsedTail.modifier ? `${parsedTail.modifier >= 0 ? '+' : ''}${parsedTail.modifier}` : ''}`
      setFormula(`${prefix}${nextTail}`)
      setFormulaError('')
      return
    }
    setFormula(`${prefix}1d${sides}`)
    setFormulaError('')
  }, [formula])

  const appendComma = useCallback(() => {
    const raw = String(formula || '').replace(/，/g, ',').trim()
    if (!raw || raw.endsWith(',')) return
    setFormula(`${raw},`)
    setFormulaError('')
  }, [formula])

  const rollByFormula = useCallback(() => {
    const parsedSegments = parseFormula(formula)
    if (!parsedSegments) {
      setFormulaError('公式格式：XdN+N，可用逗号分段，如 2d6+5,5d6')
      return
    }
    setFormulaError('')
    const mode = formulaMeta?.mode || d20Mode || 'normal'
    const parsed = parsedSegments.length === 1 ? parsedSegments[0] : null
    let rolls = []
    let finalTotal = 0
    let d20Result = null
    const segmentDetails = []
    if (parsed?.kind === 'dice' && parsed.count === 1 && parsed.sides === 20 && mode !== 'normal') {
      const r = rollD20WithMode(mode)
      rolls = r.rolls
      d20Result = r.result
      finalTotal = r.result + (parsed.modifier || 0)
      segmentDetails.push(`1d20(${r.rolls.join(',')})${parsed.modifier ? `${parsed.modifier >= 0 ? '+' : ''}${parsed.modifier}` : ''}=${finalTotal}`)
    } else {
      for (const seg of parsedSegments) {
        if (seg.kind === 'flat') {
          finalTotal += seg.value
          segmentDetails.push(`${seg.value >= 0 ? '+' : ''}${seg.value}`)
          continue
        }
        const segRolls = Array.from({ length: seg.count }, () => roll(seg.sides))
        rolls.push(...segRolls)
        const segDice = segRolls.reduce((sum, n) => sum + n, 0)
        if (seg.count === 1 && seg.sides === 20) d20Result = segDice
        const segTotal = segDice + (seg.modifier || 0)
        finalTotal += segTotal
        segmentDetails.push(`${seg.count}d${seg.sides}(${segRolls.join(',')})${seg.modifier ? `${seg.modifier >= 0 ? '+' : ''}${seg.modifier}` : ''}=${segTotal}`)
      }
    }
    const normalizedFormula = String(formula || '').replace(/，/g, ',').replace(/\s+/g, '')
    setLastRoll({
      sides: parsed?.kind === 'dice' ? parsed.sides : 0,
      count: parsed?.kind === 'dice' ? parsed.count : 0,
      modifier: parsed?.kind === 'dice' ? parsed.modifier : 0,
      result: finalTotal,
      rawTotal: finalTotal,
      rolls,
      key: Date.now(),
      label: normalizedFormula,
    })
    setRollHistory((prev) => [...prev, finalTotal])
    setCheckResult({
      label: formulaMeta?.label || '通用投掷',
      modifier: parsed?.kind === 'dice' ? parsed.modifier : 0,
      d20Result: d20Result ?? null,
      rolls,
      total: finalTotal,
      key: Date.now(),
      formula: normalizedFormula,
      mode: parsed?.kind === 'dice' && parsed.count === 1 && parsed.sides === 20 ? mode : 'normal',
      details: segmentDetails.join(' ; '),
    })
    setFormulaMeta(null)
  }, [formula, formulaMeta, d20Mode])

  const clearHistory = () => {
    setRollHistory([])
    setLastRoll(null)
    setCheckResult(null)
    setFormulaError('')
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 w-full border-t border-white/10 bg-[#2D3748]/78 backdrop-blur-md safe-area-pb shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
      <div className="border-b border-white/10 bg-[#2D3748]/78 backdrop-blur-md">
          <div className="mx-auto w-[1180px] min-w-[1180px] px-2 py-2 sm:px-4">
            <div className="flex items-stretch gap-2">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-[#1E293B]/85 p-1">
                    {[
                      { value: 'advantage', label: '优势' },
                      { value: 'disadvantage', label: '劣势' },
                    ].map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setD20Mode((prev) => (prev === m.value ? '' : m.value))}
                        className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                          d20Mode === m.value
                            ? 'bg-dnd-red text-white'
                            : 'text-dnd-text-muted hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-8 min-w-[12rem] flex-1 rounded border border-dashed border-white/25 bg-[#1E293B]/45 px-2 py-1">
                    {checkResult ? (
                      <span className="font-mono text-dnd-gold-light">
                        {renderDetailsWithNat20Highlight(checkResult.details || `${checkResult.formula}=${checkResult.total}`)}
                      </span>
                    ) : lastRoll ? (
                      <span className="text-gray-300">
                        {lastRoll.label}: <span className="font-mono text-white">{lastRoll.result}</span>
                      </span>
                    ) : null}
                    {formulaError ? <span className="text-red-300">{formulaError}</span> : null}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-gray-400">合计</span>
                    <span className="font-mono font-bold text-dnd-red">{total}</span>
                    <button
                      type="button"
                      onClick={clearHistory}
                      className="rounded border border-white/15 px-2 py-1 text-[11px] text-dnd-text-muted hover:bg-white/10 hover:text-white"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {DICE_SIDES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => appendDie(s)}
                        className="rounded border border-white/20 bg-[#1E293B]/90 px-2 py-1 text-xs font-mono font-semibold text-white transition-colors hover:border-dnd-red hover:bg-dnd-red hover:text-white"
                      >
                        d{s}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={appendComma}
                      className="rounded border border-white/20 bg-[#1E293B]/90 px-2 py-1 text-xs font-mono font-semibold text-white transition-colors hover:border-dnd-red hover:bg-dnd-red hover:text-white"
                      title="添加逗号分段"
                      aria-label="添加逗号分段"
                    >
                      ,
                    </button>
                  </div>
                  <div className="flex min-w-[14rem] flex-1 items-center gap-1">
                    <input
                      ref={formulaInputRef}
                      type="text"
                      value={formula}
                      onChange={(e) => {
                        setFormula(e.target.value)
                        setFormulaMeta(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          rollByFormula()
                        }
                      }}
                      className="h-8 min-w-0 flex-1 rounded border border-white/20 bg-[#1E293B]/90 px-2 text-xs font-mono text-white placeholder:text-dnd-text-muted/70 focus:border-dnd-red focus:outline-none"
                      placeholder="XdN+N，例如 3d8+2"
                      aria-label="骰子公式输入"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFormula('')
                        setFormulaMeta(null)
                        setFormulaError('')
                        requestAnimationFrame(() => formulaInputRef.current?.focus())
                      }}
                      className="h-8 shrink-0 rounded border border-white/15 px-2 text-[11px] text-dnd-text-muted hover:bg-white/10 hover:text-white"
                      title="清空公式输入"
                    >
                      清空
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={rollByFormula}
                  className="h-[4.5rem] w-[4.5rem] shrink-0 self-stretch rounded-lg border border-[#ff4b5c] text-sm font-bold text-white shadow-[0_0_18px_rgba(224,28,47,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(165deg, #E01C2F 0%, #9E2A2B 55%, #7A1F20 100%)',
                  }}
                  title="按当前公式投掷"
                >
                  投掷
                </button>
              </div>
            </div>
          </div>
        </div>
      <div className="mx-auto flex h-14 w-[1180px] min-w-[1180px] items-center justify-around gap-1 px-2 sm:px-4">
        {tabs.map((tab) => {
          const to = getLinkTo(tab)
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.key}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center flex-1 py-1.5 text-xs transition-all duration-200 ${
                  isActive ? 'text-dnd-red' : 'text-dnd-text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-b bg-dnd-red" />
                  )}
                  <Icon
                    className={`mb-0.5 transition-all duration-200 ${
                      isActive ? 'h-7 w-7 drop-shadow-[0_0_6px_rgba(224,28,47,0.5)]' : 'h-6 w-6'
                    }`}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  <span className={isActive ? 'font-semibold' : ''}>{tab.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
