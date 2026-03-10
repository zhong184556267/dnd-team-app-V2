import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import Characters from './pages/Characters'
import CharacterNew from './pages/CharacterNew'
import Warehouse from './pages/Warehouse'
import Spells from './pages/Spells'
import CharacterSpellsPage from './pages/CharacterSpellsPage'
import More from './pages/More'
import HouseRules from './pages/HouseRules'
import DataMaintain from './pages/DataMaintain'

const CharacterSheet = lazy(() => import('./pages/CharacterSheet'))

function AppRoutes() {
  const { user } = useAuth()

  if (user === undefined) {
    return (
      <div
        className="min-h-screen bg-dnd-bg flex items-center justify-center"
        style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#121212' }}
      >
        <p style={{ color: '#94a3b8', fontSize: '1.125rem' }}>加载中…</p>
      </div>
    )
  }
  if (!user) {
    return <Login />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/characters" element={<Characters />} />
        <Route path="/characters/new" element={<CharacterNew />} />
        <Route path="/characters/:id" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-dnd-bg text-dnd-text-muted">加载角色卡…</div>}><CharacterSheet /></Suspense>} />
        <Route path="/character-spells" element={<CharacterSpellsPage />} />
        <Route path="/warehouse" element={<Warehouse />} />
        <Route path="/spells" element={<Spells />} />
        <Route path="/more" element={<More />} />
        <Route path="/more/house-rules" element={<HouseRules />} />
        <Route path="/more/data" element={<DataMaintain />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
