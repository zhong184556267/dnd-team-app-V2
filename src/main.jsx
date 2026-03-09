import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import App from './App.jsx'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<p style="padding:2rem;color:#f87171;">未找到 #root 节点</p>'
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <AuthProvider>
          <App />
        </AuthProvider>
      </StrictMode>,
    )
  } catch (err) {
    rootEl.innerHTML = `<div style="padding:2rem;background:#121212;color:#e2e8f0;min-height:100vh;"><h1 style="color:#f87171;">启动失败</h1><pre style="background:#1e293b;padding:1rem;border-radius:8px;overflow:auto;margin-top:1rem;">${typeof err?.message === 'string' ? err.message : String(err)}</pre></div>`
    console.error(err)
  }
}
