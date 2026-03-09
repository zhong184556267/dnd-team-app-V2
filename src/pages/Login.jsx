import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [name, setName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    login(n)
  }

  return (
    <div
      className="min-h-screen bg-dnd-bg flex flex-col items-center justify-center p-6"
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#121212' }}
    >
      <div className="w-full max-w-sm" style={{ width: '100%', maxWidth: 384 }}>
        <div
          className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card border-l-4 border-dnd-red p-8"
          style={{ borderRadius: 12, backgroundColor: '#1E293B', padding: 32, borderLeft: '4px solid #E01C2F' }}
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white text-center mb-1" style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>
            繁星 D&D 小助手
          </h1>
          <p className="text-dnd-text-label text-center text-sm mb-8" style={{ color: '#94a3b8', textAlign: 'center', fontSize: 14, marginBottom: 32 }}>
            输入你的角色名进入
          </p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-name" className="sr-only">角色名</label>
              <input
                id="login-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入角色名"
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3.5 text-white text-base placeholder:text-dnd-text-muted focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
                autoComplete="username"
              />
            </div>
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-3.5 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-semibold text-lg uppercase tracking-label disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              进入繁星世界
            </button>
          </form>
        </div>
        <p className="text-dnd-text-muted text-sm text-center mt-6">
          风格参考 D&D Beyond App
        </p>
      </div>
    </div>
  )
}
