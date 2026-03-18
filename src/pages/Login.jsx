import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseEnabled } from '../lib/supabase'

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
            输入你的玩家名进入（类似账号 ID，每人固定一个）
          </p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-name" className="sr-only">玩家名</label>
              <input
                id="login-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入玩家名"
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
          <p
            className={
              isSupabaseEnabled()
                ? 'mt-5 text-center text-xs text-emerald-400/90'
                : 'mt-5 text-center text-xs text-amber-200/70'
            }
            title={
              isSupabaseEnabled()
                ? '已配置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY'
                : '未配置环境变量时仅使用浏览器本地存储'
            }
          >
            {isSupabaseEnabled()
              ? '已连接云端（Supabase）· 角色与团队仓库可多人共享'
              : '未连接云端 · 数据仅保存在本机浏览器'}
          </p>
          {!isSupabaseEnabled() && (
            <div className="mt-4 rounded-lg border border-amber-600/35 bg-amber-950/20 p-3 text-left text-[11px] leading-relaxed text-amber-100/90">
              <p className="mb-2 font-bold text-amber-200">连不上云端时按顺序检查：</p>
              <ol className="list-decimal pl-4 space-y-1.5 text-amber-100/85">
                <li>
                  文件必须在项目<strong>根目录</strong>（和 <code className="rounded bg-black/30 px-1">package.json</code> 同级），文件名是{' '}
                  <code className="rounded bg-black/30 px-1">.env</code>
                  （不是 <code className="rounded bg-black/30 px-1">.env.example</code>，也不要存成 <code className="rounded bg-black/30 px-1">.env.txt</code>）。
                </li>
                <li>
                  两行变量名必须<strong>完全一致</strong>（含前缀 <code className="rounded bg-black/30 px-1">VITE_</code>）：
                  <br />
                  <code className="mt-0.5 block break-all text-[10px] text-emerald-300/90">VITE_SUPABASE_URL=https://xxx.supabase.co</code>
                  <code className="mt-0.5 block break-all text-[10px] text-emerald-300/90">VITE_SUPABASE_ANON_KEY=sb_publishable_…</code>
                </li>
                <li>
                  改完 <code className="rounded bg-black/30 px-1">.env</code> 后，在终端里<strong>关掉</strong>再重新运行{' '}
                  <code className="rounded bg-black/30 px-1">npm run dev</code>，然后浏览器<strong>强制刷新</strong>（Ctrl+F5）。
                </li>
                <li>
                  若打开的是 <strong>Vercel 网址</strong>：到 Vercel 项目 → Settings → Environment Variables 添加上面两项，保存后必须点{' '}
                  <strong>Deployments → 最新一次右侧 ⋯ → Redeploy</strong>（只加变量不重新部署，网页里永远没有密钥）。
                </li>
              </ol>
              <p className="mt-2 border-t border-amber-600/25 pt-2 text-[10px] text-amber-200/70">
                本页构建自检：Project URL {import.meta.env.VITE_SUPABASE_URL ? '✓ 已注入' : '✗ 未注入'} · Publishable 密钥{' '}
                {import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ 已注入' : '✗ 未注入'}
              </p>
            </div>
          )}
        </div>
        <p className="text-dnd-text-muted text-sm text-center mt-6">
          风格参考 D&D Beyond App
        </p>
      </div>
    </div>
  )
}
