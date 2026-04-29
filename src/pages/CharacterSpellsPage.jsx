/**
 * 角色法术页面：选择角色并管理其法术
 */
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getCharacters, getCharacter, updateCharacter, getDefaultCharacterId, getLastEditedCharacterId } from '../lib/characterStore'
import CharacterSpells from '../components/CharacterSpells'

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
    <div
      className="character-sheet-page-with-topbar w-full min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] px-4"
      style={{ backgroundColor: 'var(--page-bg)' }}
    >
      <CharacterSpells
        spellPagePinnedLayout
        char={selectedChar}
        canEdit={!!canEditChar}
        onSave={persistSpells}
        characterPicker={{
          options: list,
          value: selectedCharId,
          onChange: setSelectedCharId,
        }}
      />
    </div>
  )
}
