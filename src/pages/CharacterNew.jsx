import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { addCharacter } from '../lib/characterStore'

export default function CharacterNew() {
  const { user } = useAuth()
  const { currentModuleId } = useModule()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [classVal, setClassVal] = useState('')
  const [saving, setSaving] = useState(false)

  const moduleId = searchParams.get('moduleId') ?? currentModuleId ?? 'default'

  const handleSubmit = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || !user?.name) return
    setSaving(true)
    const char = addCharacter(user.name, { name: n, 'class': classVal.trim(), moduleId })
    setSaving(false)
    navigate(`/characters/${char.id}`, { replace: true })
  }

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        新建角色
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">
            角色名 <span className="text-dnd-red">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入角色名"
            className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white placeholder:text-dnd-text-muted focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">
            职业（选填）
          </label>
          <input
            type="text"
            value={classVal}
            onChange={(e) => setClassVal(e.target.value)}
            placeholder="如：战士、法师"
            className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white placeholder:text-dnd-text-muted focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full py-3 rounded-xl bg-dnd-red hover:bg-dnd-red-hover text-white font-semibold uppercase tracking-label disabled:opacity-50 transition-colors"
        >
          {saving ? '创建中…' : '创建并编辑'}
        </button>
      </form>
    </div>
  )
}
