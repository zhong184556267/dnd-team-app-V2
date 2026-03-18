import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { addCharacter, loadCharacterById } from '../lib/characterStore'
import { logTeamActivity } from '../lib/activityLog'

export default function CharacterNew() {
  const { user } = useAuth()
  const { currentModuleId } = useModule()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [classVal, setClassVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const moduleId = String(searchParams.get('moduleId') ?? currentModuleId ?? 'default').trim() || 'default'

  const handleSubmit = async (e) => {
    e.preventDefault()
    const n = name.trim()
    setError('')
    if (!n) return
    if (!user?.name) {
      setError('未获取到玩家名，请返回登录页重新进入。')
      return
    }
    setSaving(true)
    try {
      const char = await Promise.resolve(
        addCharacter(user.name, { name: n, 'class': classVal.trim(), moduleId })
      )
      if (!char?.id) {
        throw new Error('创建未成功：未返回角色 ID。请检查 Supabase 中是否已执行 supabase-schema-v2.sql（characters 表）。')
      }
      try {
        await loadCharacterById(char.id)
      } catch (e) {
        console.warn('创建后同步角色缓存失败（将尝试直接进入角色卡）', e)
      }
      logTeamActivity({
        actor: user.name,
        moduleId,
        summary: `玩家 ${user.name} 创建了角色「${n}」`,
      })
      navigate(`/characters/${char.id}`, { replace: true })
    } catch (err) {
      console.error(err)
      const msg =
        err?.message ||
        err?.error_description ||
        (typeof err === 'string' ? err : '') ||
        '创建失败'
      setError(
        msg.includes('JWT') || msg.includes('401')
          ? '连接被拒绝：请检查 .env 里是否为 Publishable Key（sb_publishable_），不要用 Secret Key。'
          : msg
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 pb-24 min-h-screen bg-dnd-bg">
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        新建角色
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-dnd-red/50 bg-dnd-red/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
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
