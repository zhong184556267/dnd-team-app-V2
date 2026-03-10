/**
 * 角色卡 - 恢复「经验与等级」前的备份
 * 若恢复经验/等级后出错，可把此文件内容复制回 CharacterSheet.jsx 以回退。
 */
import { useState, useEffect, useCallback, useRef, forwardRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getCharacter, updateCharacter } from '../lib/characterStore'
import { levelFromXP } from '../lib/xp5e'
import { getSpellcastingLevel } from '../data/classDatabase'
import { useCombatState } from '../hooks/useCombatState'
import BuffManager from '../components/BuffManager'
import CharacterInventory from '../components/CharacterInventory'
import { inputClass, labelClass } from '../lib/inputStyles'

const NameInput = forwardRef(function NameInput({ value, onChange, onFocus, onBlur, onKeyDown, className }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder="未命名"
      className={className}
    />
  )
})

function AppearanceGrid({ char, canEdit, onSave }) {
  const app = char?.appearance ?? {}
  const [age, setAge] = useState(app.age ?? '')
  const [alignment, setAlignment] = useState(app.alignment ?? '')
  const [eyes, setEyes] = useState(app.eyes ?? '')
  const [height, setHeight] = useState(app.height ?? '')
  const [skin, setSkin] = useState(app.skin ?? '')
  const [background, setBackground] = useState(app.background ?? '')
  const [race, setRace] = useState(app.race ?? '')
  const [weight, setWeight] = useState(app.weight ?? '')
  const [hair, setHair] = useState(app.hair ?? '')
  useEffect(() => {
    const a = char?.appearance ?? {}
    setAge(a.age ?? '')
    setAlignment(a.alignment ?? '')
    setEyes(a.eyes ?? '')
    setHeight(a.height ?? '')
    setSkin(a.skin ?? '')
    setBackground(a.background ?? '')
    setRace(a.race ?? '')
    setWeight(a.weight ?? '')
    setHair(a.hair ?? '')
  }, [char?.id])

  const appearanceData = () => ({ age, race, alignment, height, weight, hair, eyes, skin, background })
  const save = () => onSave({ appearance: appearanceData() })

  const row1 = [
    { label: '年龄', value: age, set: setAge },
    { label: '阵营', value: alignment, set: setAlignment },
    { label: '瞳色', value: eyes, set: setEyes },
    { label: '身高', value: height, set: setHeight },
    { label: '肤色', value: skin, set: setSkin },
  ]
  const row2 = [
    { label: '背景', value: background, set: setBackground },
    { label: '种族', value: race, set: setRace },
    { label: '体重', value: weight, set: setWeight },
    { label: '发色', value: hair, set: setHair },
  ]

  const Cell = ({ label, value, set }) => (
    <div className="flex flex-col gap-0 min-w-0">
      <label className="text-dnd-gold-light uppercase tracking-wider text-xs font-bold mb-1">{label}</label>
      {canEdit ? (
        <input
          type="text"
          value={value}
          onChange={(e) => set(e.target.value)}
          onBlur={save}
          className={inputClass}
          placeholder="—"
        />
      ) : (
        <span className="text-white text-sm font-semibold truncate">{value || '—'}</span>
      )}
    </div>
  )

  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      <div className="grid grid-cols-5 gap-x-3 gap-y-3 mb-3">
        {row1.map(({ label, value, set }) => (
          <Cell key={label} label={label} value={value} set={set} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-3">
        {row2.map(({ label, value, set }) => (
          <Cell key={label} label={label} value={value} set={set} />
        ))}
      </div>
      {canEdit && <p className="text-gray-500 text-xs mt-2">点击他处即保存</p>}
    </div>
  )
}

function noop() {}

export default function CharacterSheet() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const [char, setChar] = useState(null)
  const [editingName, setEditingName] = useState(null)
  const nameInputRef = useRef(null)
  const level = char ? levelFromXP(char.xp) : 0
  const spellLevel = char ? getSpellcastingLevel(char) : 0
  const combatState = useCombatState(char)
  const canEdit = isAdmin || char?.owner === user?.name

  useEffect(() => {
    if (!id || id === 'new') return
    setChar(getCharacter(id))
  }, [id])
  useEffect(() => {
    setEditingName(null)
  }, [char?.id])

  const persist = useCallback((patch) => {
    if (!char?.id) return null
    const updated = updateCharacter(char.id, patch)
    if (updated) setChar(updated)
    return updated
  }, [char?.id])

  if (!char && id && id !== 'new') {
    return (
      <div className="p-4">
        <p className="text-dnd-text-muted">未找到该角色。</p>
        <Link to="/characters" className="text-dnd-red mt-2 inline-block">返回列表</Link>
      </div>
    )
  }

  return (
    <div className="p-4">
      <Link to="/characters" className="text-dnd-red">← 返回角色列表</Link>
      <p className="text-white mt-4 text-sm text-gray-400">角色卡 id: {id}</p>
      {char ? (
        <>
          <section className="mt-4 w-full flex flex-col items-stretch">
            <label className={labelClass + ' text-center'}>角色名</label>
            {canEdit ? (
              <NameInput
                ref={nameInputRef}
                value={editingName !== null ? editingName : (char.name ?? '')}
                onChange={(e) => setEditingName(e.target.value)}
                onFocus={() => { if (editingName === null) setEditingName(char.name ?? '') }}
                onBlur={() => {
                  const value = (editingName ?? char.name ?? '').trim() || '未命名'
                  persist({ name: value })
                  setEditingName(null)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                className={inputClass + ' font-bold text-2xl text-center w-full'}
              />
            ) : (
              <p className="text-2xl font-bold text-white text-center w-full">{char.name || '未命名'}</p>
            )}
          </section>
          <section className="mt-4">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">外观 / 基础</h3>
            <AppearanceGrid char={char} canEdit={canEdit} onSave={persist} />
          </section>
          <p className="text-white text-sm mt-4">等级: {level} · 施法等级: {spellLevel} · 同调位: {combatState?.maxAttunementSlots ?? '—'}</p>
          <section className="mt-6">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">Buff / 状态</h3>
            <BuffManager buffs={char.buffs} baseAbilities={char.abilities ?? {}} onSave={persist} canEdit={canEdit} />
          </section>
          <section className="mt-6">
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">背包</h3>
            <CharacterInventory character={char} canEdit={canEdit} onSave={persist} onWalletSuccess={noop} />
          </section>
        </>
      ) : null}
    </div>
  )
}
