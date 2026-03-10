/**
 * 角色法术悬浮按钮：类似万能骰子，点击打开角色法术面板
 */
import { useState, useEffect } from 'react'
import { BookOpen } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getCharacters, getCharacter, updateCharacter } from '../lib/characterStore'
import CharacterSpells from './CharacterSpells'
import { inputClass } from '../lib/inputStyles'

export default function CharacterSpellsFAB() {
  const { user, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const [selectedCharId, setSelectedCharId] = useState('')

  useEffect(() => {
    if (user?.name !== undefined) {
      setList(getCharacters(user?.name, isAdmin))
    }
  }, [user?.name, isAdmin, open])

  const selectedChar = selectedCharId ? getCharacter(selectedCharId) : null
  const canEditChar = selectedChar && (isAdmin || selectedChar.owner === user?.name)
  const persistSpells = (patch) => {
    if (!selectedChar?.id) return
    updateCharacter(selectedChar.id, patch)
    setList(getCharacters(user?.name, isAdmin))
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed left-4 z-[201] flex flex-col items-start transition-all duration-200 ${
          open ? 'bottom-24 sm:bottom-1/2 sm:translate-y-1/2' : 'bottom-24 sm:bottom-10'
        }`}
      >
        {open && (
          <div
            className="bg-[#2D3748] rounded-xl shadow-dnd-card border-l-4 border-dnd-gold p-4 w-[min(22rem,calc(100vw-2rem))] mb-3 border border-white/10 max-h-[85vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white text-sm font-medium mb-3 uppercase tracking-label">角色法术</p>
            <div className="mb-3">
              <label className="block text-dnd-text-muted text-[10px] mb-1.5">选择角色</label>
              <select
                value={selectedCharId}
                onChange={(e) => setSelectedCharId(e.target.value)}
                className={inputClass + ' w-full'}
              >
                <option value="">— 选择角色 —</option>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                ))}
              </select>
            </div>
            {selectedChar ? (
              <CharacterSpells char={selectedChar} canEdit={canEditChar} onSave={persistSpells} />
            ) : (
              <p className="text-dnd-text-muted text-sm py-4 text-center">请先选择一个角色。</p>
            )}
          </div>
        )}

        {!open && (
          <div
            className="fab-float flex items-center justify-center rounded-full z-[201]"
            style={{
              padding: '6px',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.2) 100%)',
              borderRadius: '9999px',
              boxShadow: '0 0 20px rgba(212, 175, 55, 0.4), 0 0 40px rgba(212, 175, 55, 0.2), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="fab-btn flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full active:scale-95 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A202C]"
              style={{
                background: 'linear-gradient(165deg, #8B7355 0%, #6B5344 50%, #4A3728 100%)',
                boxShadow: '0 0 14px rgba(212, 175, 55, 0.5), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)',
              }}
              aria-label="打开角色法术"
            >
              <BookOpen className="w-7 h-7 sm:w-8 sm:h-8 text-white shrink-0" strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
