/**
 * 角色法术页面：选择角色并管理其法术
 */
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getCharacters, getCharacter, updateCharacter, getDefaultCharacterId, getLastEditedCharacterId } from '../lib/characterStore'
import CharacterSpells from '../components/CharacterSpells'
import { inputClass } from '../lib/inputStyles'

export default function CharacterSpellsPage() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const [searchParams] = useSearchParams()
  const charFromUrl = searchParams.get('char')
  const [list, setList] = useState([])
  const [selectedCharId, setSelectedCharId] = useState('')

  useEffect(() => {
    if (user?.name !== undefined) {
      const chars = getCharacters(user?.name, isAdmin, currentModuleId)
      setList(chars)
      const defaultId = charFromUrl || getDefaultCharacterId(user?.name) || getLastEditedCharacterId(user?.name, isAdmin, currentModuleId)
      if (defaultId && chars.some((c) => c.id === defaultId)) {
        setSelectedCharId(defaultId)
      }
    }
  }, [user?.name, isAdmin, charFromUrl, currentModuleId])

  const selectedChar = selectedCharId ? getCharacter(selectedCharId) : null
  const canEditChar = selectedChar && (isAdmin || selectedChar.owner === user?.name)
  const persistSpells = (patch) => {
    if (!selectedChar?.id) return
    updateCharacter(selectedChar.id, patch)
    setList(getCharacters(user?.name, isAdmin, currentModuleId))
  }

  return (
    <div className="p-4 pb-32 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <h1 className="font-display text-xl font-semibold text-white mb-4 section-title">角色法术</h1>
      <div className="mb-4">
        <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">选择角色</label>
        <select
          value={selectedCharId}
          onChange={(e) => setSelectedCharId(e.target.value)}
          className={inputClass + ' max-w-md'}
        >
          <option value="">— 选择角色 —</option>
          {list.map((c) => (
            <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
          ))}
        </select>
      </div>
      {selectedChar ? (
        <div className="rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <CharacterSpells char={selectedChar} canEdit={canEditChar} onSave={persistSpells} />
        </div>
      ) : (
        <div className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-dnd-text-muted">请先选择一个角色。</p>
        </div>
      )}
    </div>
  )
}
